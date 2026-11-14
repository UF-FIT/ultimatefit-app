-- Permit distinct sessions owned by the same teacher to overlap in time.
-- Preserve all owner/student authorization, optimistic version checks, pack accounting,
-- idempotent request IDs, and copy-week uniqueness; remove only overlap rejection.

CREATE OR REPLACE FUNCTION public.pt_save_session(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result uuid; oldrow public.pt_sessions; item jsonb; sid uuid; pack uuid; starttime timestamptz;
 minutes integer:=(p_data->>'duration')::integer; n integer;
begin
 if not public.payment_can_manage() then raise exception 'Sem permissão.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('pt:'||auth.uid()::text,0));
 starttime:=(p_data->>'starts_local')::timestamp at time zone 'Europe/Lisbon';
 if starttime is null or minutes is null or minutes not between 5 and 480 then raise exception 'Data ou duração inválida.'; end if;
 n:=jsonb_array_length(p_data->'participants');
 if n is null or n<1 or n>50 or (p_data->>'kind'<>'group' and n<>1) then raise exception 'Seleciona os participantes da sessão.'; end if;
 result:=nullif(p_data->>'id','')::uuid;
 if result is null then
  select id into result from public.pt_sessions where owner_id=auth.uid() and request_id=(p_data->>'request_id')::uuid;
  if found then return result; end if;
 else
  select * into oldrow from public.pt_sessions where id=result for update;
  if not found or oldrow.owner_id<>auth.uid() then raise exception 'Sem permissão.' using errcode='42501'; end if;
  if oldrow.version is distinct from (p_data->>'version')::integer then raise exception 'A sessão mudou. Atualiza a agenda.'; end if;
  if exists(select 1 from public.pt_attendance where session_id=result and status<>'booked') then raise exception 'Repõe primeiro os registos em Por registar para alterar esta sessão.'; end if;
 end if;
 for item in select * from jsonb_array_elements(p_data->'participants') loop
  sid:=(item->>'student_id')::uuid; pack:=nullif(item->>'pack_id','')::uuid;
  if sid is null or not public.payment_can_manage(sid) then raise exception 'Aluno fora do teu acompanhamento.' using errcode='42501'; end if;
  if pack is not null and not exists(select 1 from public.pt_packs p join public.student_payments pay on pay.id=p.payment_id
   where p.id=pack and p.student_id=sid and p.owner_id=auth.uid() and pay.status<>'cancelled') then raise exception 'Pack inválido para este aluno.'; end if;
 end loop;
 if result is null then
  insert into public.pt_sessions(owner_id,starts_at,duration,kind,location,request_id)
  values(auth.uid(),starttime,minutes,p_data->>'kind',coalesce(p_data->>'location',''),(p_data->>'request_id')::uuid) returning id into result;
 else
  update public.pt_sessions set starts_at=starttime,duration=minutes,kind=p_data->>'kind',location=coalesce(p_data->>'location',''),version=version+1 where id=result;
  delete from public.pt_attendance where session_id=result and student_id not in
   (select (x->>'student_id')::uuid from jsonb_array_elements(p_data->'participants') x);
 end if;
 insert into public.pt_attendance(session_id,student_id,owner_id,pack_id)
 select result,(x->>'student_id')::uuid,auth.uid(),nullif(x->>'pack_id','')::uuid from jsonb_array_elements(p_data->'participants') x
 on conflict(session_id,student_id) do update set pack_id=excluded.pack_id,version=pt_attendance.version+1,updated_at=now();
 return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.pt_mark_attendance(p_session uuid, p_student uuid, p_status text, p_deduct boolean, p_pack uuid, p_version integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.pt_attendance; p public.pt_packs; used integer; charge boolean;
begin
 if p_student is null or not public.payment_can_manage(p_student) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('pt:'||auth.uid()::text,0));
 select * into a from public.pt_attendance where session_id=p_session and student_id=p_student for update;
 if not found or a.owner_id<>auth.uid() then raise exception 'Sem permissão.' using errcode='42501'; end if;
 if a.version is distinct from p_version then raise exception 'A presença mudou. Atualiza a agenda antes de guardar.'; end if;
 if p_status is null or p_status not in ('booked','present','absent','cancelled') then raise exception 'Estado inválido.'; end if;
 if p_status in ('present','absent') and (select starts_at from public.pt_sessions where id=p_session)>now() then raise exception 'Não podes registar presença ou falta antes da sessão.'; end if;
 if p_status in ('absent','cancelled') and p_deduct is null then raise exception 'Decide se descontas a sessão.'; end if;
 charge:=case when p_status='present' then p_pack is not null when p_status='booked' then false else p_deduct end;
 if charge and p_pack is null then raise exception 'Seleciona o pack a descontar.'; end if;
 if p_pack is not null then
  select * into p from public.pt_packs where id=p_pack for update;
  if not found or p.student_id<>p_student or p.owner_id<>auth.uid() then raise exception 'Pack inválido.'; end if;
  if charge then
   if (select status from public.student_payments where id=p.payment_id)='cancelled' then raise exception 'O pagamento deste pack foi anulado.'; end if;
   select count(*) into used from public.pt_attendance where pack_id=p_pack and deduct and not(session_id=p_session and student_id=p_student);
   if used>=p.total then raise exception 'Este pack não tem sessões disponíveis. Associa outro pack.'; end if;
  end if;
 end if;
 update public.pt_attendance set status=p_status,deduct=charge,pack_id=p_pack,version=version+1,updated_at=now()
 where session_id=p_session and student_id=p_student;
end $function$
;

CREATE OR REPLACE FUNCTION public.pt_copy_week(p_source date, p_target date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.pt_sessions; targettime timestamptz; newid uuid; countnew integer:=0;
begin
 if not public.payment_can_manage() then raise exception 'Sem permissão.' using errcode='42501'; end if;
 if p_source is null or p_target is null or extract(isodow from p_source)<>1 or extract(isodow from p_target)<>1 or p_source=p_target then raise exception 'Escolhe duas semanas diferentes.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('pt:'||auth.uid()::text,0));
 for s in select * from public.pt_sessions where owner_id=auth.uid() and (starts_at at time zone 'Europe/Lisbon')::date>=p_source
 and (starts_at at time zone 'Europe/Lisbon')::date<p_source+7 order by starts_at loop
  if not exists(select 1 from public.pt_attendance a where a.session_id=s.id and a.status<>'cancelled') then continue; end if;
  targettime:=((s.starts_at at time zone 'Europe/Lisbon')+((p_target-p_source)*interval '1 day')) at time zone 'Europe/Lisbon';
  if exists(select 1 from public.pt_sessions where owner_id=auth.uid() and copied_from=s.id and starts_at=targettime) then continue; end if;
  if exists(select 1 from public.pt_attendance a where a.session_id=s.id and a.status<>'cancelled' and not public.payment_can_manage(a.student_id)) then raise exception 'A semana inclui um aluno que já não acompanhas.'; end if;
  insert into public.pt_sessions(owner_id,starts_at,duration,kind,location,request_id,copied_from)
  values(auth.uid(),targettime,s.duration,s.kind,s.location,gen_random_uuid(),s.id) returning id into newid;
  insert into public.pt_attendance(session_id,student_id,owner_id,pack_id)
  select newid,a.student_id,auth.uid(),case when pay.status<>'cancelled' then a.pack_id end
  from public.pt_attendance a left join public.pt_packs p on p.id=a.pack_id left join public.student_payments pay on pay.id=p.payment_id
  where a.session_id=s.id and a.status<>'cancelled';
  countnew:=countnew+1;
 end loop;
 return countnew;
end $function$
;
