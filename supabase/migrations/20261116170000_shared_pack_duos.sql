alter table public.pt_packs
 add column duration_minutes integer,
 add column partner_student_id uuid references public.student_profiles(id),
 add column partner_name text not null default '',
 add column partner_phone text not null default '',
 add constraint pt_packs_duration_valid check (duration_minutes is null or duration_minutes between 5 and 480),
 add constraint pt_packs_partner_name_length check (char_length(partner_name)<=160),
 add constraint pt_packs_partner_phone_length check (char_length(partner_phone)<=40);

create index pt_packs_partner_student on public.pt_packs(partner_student_id) where partner_student_id is not null;

drop policy pack_read on public.pt_packs;
create policy pack_read on public.pt_packs for select to authenticated
 using (
  public.student_module_can_read(owner_id,student_id,'agenda')
  or (partner_student_id is not null and public.student_module_can_read(owner_id,partner_student_id,'agenda'))
 );

create or replace function public.pt_create_pack(p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 sid uuid:=nullif(p_data->>'student_id','')::uuid;
 partner_sid uuid:=nullif(p_data->>'partner_student_id','')::uuid;
 pid uuid;
 result uuid;
 pay public.student_payments;
 pack_title text:=btrim(coalesce(p_data->>'title',''));
 partner_label text:=btrim(coalesce(p_data->>'partner_name',''));
 partner_phone_value text:=btrim(coalesce(p_data->>'partner_phone',''));
 payment_status text:=coalesce(nullif(p_data->>'status',''),'pending');
 paid_date date:=nullif(p_data->>'paid_on','')::date;
 due_date date:=nullif(p_data->>'due_on','')::date;
 payment_method text:=nullif(p_data->>'method','');
 payment_period date;
 session_total integer:=nullif(p_data->>'total','')::integer;
 session_minutes integer:=nullif(p_data->>'duration_minutes','')::integer;
begin
 if sid is null or not public.payment_can_manage(sid) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 if nullif(p_data->>'request_id','') is null then raise exception 'Identificador do pedido em falta.'; end if;
 if pack_title='' or char_length(pack_title)>120 then raise exception 'O nome do pack é inválido.'; end if;
 if session_total is null or session_total not between 1 and 1000 then raise exception 'O número de sessões é inválido.'; end if;
 if session_minutes is not null and session_minutes not between 5 and 480 then raise exception 'A duração do pack é inválida.'; end if;
 if partner_sid=sid then raise exception 'O parceiro do duo tem de ser outro aluno.'; end if;
 if partner_sid is not null then
  if not public.payment_can_manage(partner_sid) then raise exception 'O parceiro não está associado à tua conta.' using errcode='42501'; end if;
  if partner_label='' then
   select pr.full_name into partner_label from public.student_profiles sp join public.profiles pr on pr.id=sp.profile_id where sp.id=partner_sid;
  end if;
 end if;
 if char_length(partner_label)>160 or char_length(partner_phone_value)>40 then raise exception 'Os dados do parceiro são demasiado longos.'; end if;
 if partner_label='' and partner_phone_value<>'' then raise exception 'Indica o nome do parceiro.'; end if;
 if not public.payment_can_manage() then raise exception 'Sem permissão.' using errcode='42501'; end if;
 if payment_status not in ('pending','paid') then raise exception 'Estado do pagamento inválido.'; end if;
 due_date:=coalesce(due_date,paid_date,(now() at time zone 'Europe/Lisbon')::date);
 if payment_status='paid' then
  if paid_date is null or paid_date>(now() at time zone 'Europe/Lisbon')::date then raise exception 'Indica uma data de pagamento válida, não futura.'; end if;
  if payment_method not in ('mbway','cash','transfer') then raise exception 'Método de pagamento inválido.'; end if;
 else
  paid_date:=null;
  payment_method:=null;
 end if;
 payment_period:=date_trunc('month',coalesce(paid_date,due_date,(now() at time zone 'Europe/Lisbon')::date)::timestamp)::date;
 perform pg_advisory_xact_lock(hashtextextended('pt:'||auth.uid()::text,0));
 select id into result from public.pt_packs where owner_id=auth.uid() and request_id=(p_data->>'request_id')::uuid;
 if found then return result; end if;
 pid:=nullif(p_data->>'payment_id','')::uuid;
 if pid is null then
  pid:=public.payment_save(jsonb_build_object(
   'request_id',p_data->>'request_id',
   'student_id',sid,
   'kind','package',
   'amount_cents',p_data->'amount_cents',
   'period',payment_period,
   'due_on',due_date,
   'status',payment_status,
   'paid_on',paid_date,
   'method',payment_method,
   'description',pack_title||case when partner_label<>'' then ' · Duo com '||partner_label else '' end
  ));
 end if;
 select * into pay from public.student_payments where id=pid for update;
 if not found or pay.owner_id<>auth.uid() or pay.student_id<>sid or pay.kind<>'package' or pay.status='cancelled' then
  raise exception 'Escolhe um pagamento de pack válido para este aluno.';
 end if;
 insert into public.pt_packs(owner_id,student_id,payment_id,title,total,request_id,duration_minutes,partner_student_id,partner_name,partner_phone)
 values(auth.uid(),sid,pid,pack_title,session_total,(p_data->>'request_id')::uuid,session_minutes,partner_sid,partner_label,partner_phone_value)
 returning id into result;
 return result;
end $$;

create or replace function public.pt_update_pack_partner(
 p_id uuid,p_partner_student_id uuid,p_partner_name text,p_partner_phone text
) returns void
language plpgsql security definer set search_path='' as $$
declare
 pack public.pt_packs;
 partner_label text:=btrim(coalesce(p_partner_name,''));
 phone_value text:=btrim(coalesce(p_partner_phone,''));
begin
 if not public.payment_can_manage() then raise exception 'Sem permissão.' using errcode='42501'; end if;
 select * into pack from public.pt_packs where id=p_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Pack não disponível.' using errcode='42501'; end if;
 if p_partner_student_id=pack.student_id then raise exception 'O parceiro do duo tem de ser outro aluno.'; end if;
 if p_partner_student_id is not null then
  if not public.payment_can_manage(p_partner_student_id) then raise exception 'O parceiro não está associado à tua conta.' using errcode='42501'; end if;
  if partner_label='' then
   select pr.full_name into partner_label from public.student_profiles sp join public.profiles pr on pr.id=sp.profile_id where sp.id=p_partner_student_id;
  end if;
 end if;
 if char_length(partner_label)>160 or char_length(phone_value)>40 then raise exception 'Os dados do parceiro são demasiado longos.'; end if;
 if partner_label='' and phone_value<>'' then raise exception 'Indica o nome do parceiro.'; end if;
 update public.pt_packs set partner_student_id=p_partner_student_id,partner_name=partner_label,partner_phone=phone_value
  where id=pack.id and owner_id=auth.uid();
end $$;

create or replace function public.pt_save_session(p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
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
   where p.id=pack and (p.student_id=sid or p.partner_student_id=sid) and p.owner_id=auth.uid()
    and (p.duration_minutes is null or p.duration_minutes=minutes) and pay.status<>'cancelled') then
   raise exception 'Pack inválido para este aluno ou duração.'; end if;
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
end $$;

create or replace function public.pt_mark_attendance(p_session uuid,p_student uuid,p_status text,p_deduct boolean,p_pack uuid,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
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
  if not found or p.owner_id<>auth.uid() or (p.student_id<>p_student and p.partner_student_id is distinct from p_student) then raise exception 'Pack inválido.'; end if;
  if p.duration_minutes is not null and not exists(select 1 from public.pt_sessions where id=p_session and duration=p.duration_minutes) then raise exception 'A duração desta sessão não corresponde ao pack.'; end if;
  if charge then
   if (select status from public.student_payments where id=p.payment_id)='cancelled' then raise exception 'O pagamento deste pack foi anulado.'; end if;
   select count(distinct session_id) into used from public.pt_attendance where pack_id=p_pack and deduct and session_id<>p_session;
   if used>=p.total then raise exception 'Este pack não tem sessões disponíveis. Associa outro pack.'; end if;
  end if;
 end if;
 update public.pt_attendance set status=p_status,deduct=charge,pack_id=p_pack,version=version+1,updated_at=now()
 where session_id=p_session and student_id=p_student;
end $$;

create or replace function public.pt_copy_week(p_source date,p_target date) returns integer
language plpgsql security definer set search_path='' as $$
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
  select newid,a.student_id,auth.uid(),case
    when pay.status<>'cancelled' and (p.student_id=a.student_id or p.partner_student_id=a.student_id) then a.pack_id
    else null end
  from public.pt_attendance a
   left join public.pt_packs p on p.id=a.pack_id
   left join public.student_payments pay on pay.id=p.payment_id
  where a.session_id=s.id and a.status<>'cancelled';
  countnew:=countnew+1;
 end loop;
 return countnew;
end $$;

create or replace function public.pt_snapshot(p_week date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object(
 'sessions',coalesce((select jsonb_agg(s order by starts_at) from public.pt_sessions s where (starts_at at time zone 'Europe/Lisbon')::date>=p_week and (starts_at at time zone 'Europe/Lisbon')::date<p_week+7),'[]'::jsonb),
 'attendance',coalesce((select jsonb_agg(a) from public.pt_attendance a join public.pt_sessions s on s.id=a.session_id where (s.starts_at at time zone 'Europe/Lisbon')::date>=p_week and (s.starts_at at time zone 'Europe/Lisbon')::date<p_week+7),'[]'::jsonb),
 'packs',coalesce((select jsonb_agg(x) from (select p.*,(select count(distinct a.session_id) from public.pt_attendance a where a.pack_id=p.id and a.deduct) as used from public.pt_packs p order by created_at desc) x),'[]'::jsonb)
 ) into result;
 return result;
end $$;

revoke all on function public.pt_update_pack_partner(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.pt_update_pack_partner(uuid,uuid,text,text) to authenticated;
