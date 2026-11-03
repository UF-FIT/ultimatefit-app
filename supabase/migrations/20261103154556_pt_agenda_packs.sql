create table public.pt_packs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 student_id uuid not null references public.student_profiles(id), payment_id uuid not null unique references public.student_payments(id),
 title text not null check(length(title) between 1 and 120), total integer not null check(total between 1 and 1000),
 request_id uuid not null, created_at timestamptz not null default now(), unique(owner_id,request_id)
);
create index pt_packs_student on public.pt_packs(student_id);
create table public.pt_sessions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 starts_at timestamptz not null, duration integer not null check(duration between 5 and 480),
 kind text not null check(kind in ('individual','group','assessment','online')),
 location text not null default '' check(length(location)<=200),
 version integer not null default 1, request_id uuid not null, copied_from uuid references public.pt_sessions(id),
 created_at timestamptz not null default now(), unique(owner_id,request_id), unique(owner_id,copied_from,starts_at)
);
create index pt_sessions_owner_start on public.pt_sessions(owner_id,starts_at);
create table public.pt_attendance (
 session_id uuid not null references public.pt_sessions(id), student_id uuid not null references public.student_profiles(id),
 owner_id uuid not null references public.profiles(id), pack_id uuid references public.pt_packs(id),
 status text not null default 'booked' check(status in ('booked','present','absent','cancelled')),
 deduct boolean not null default false, version integer not null default 1, updated_at timestamptz not null default now(),
 primary key(session_id,student_id), check(not deduct or (pack_id is not null and status<>'booked')),
 check(status<>'present' or pack_id is null or deduct)
);
create index pt_attendance_pack on public.pt_attendance(pack_id) where pack_id is not null;
create index pt_attendance_student on public.pt_attendance(student_id);
create index pt_attendance_owner on public.pt_attendance(owner_id);
create table public.pt_attendance_audit (
 id bigint generated always as identity primary key, actor_id uuid references public.profiles(id),
 changed_at timestamptz not null default now(), before_data jsonb, after_data jsonb not null
);
alter table public.pt_packs enable row level security;
alter table public.pt_sessions enable row level security;
alter table public.pt_attendance enable row level security;
alter table public.pt_attendance_audit enable row level security;
revoke all on public.pt_packs,public.pt_sessions,public.pt_attendance,public.pt_attendance_audit from anon,authenticated;
grant select on public.pt_packs,public.pt_sessions,public.pt_attendance to authenticated;
create policy pack_read on public.pt_packs for select to authenticated using(public.payment_can_read(owner_id,student_id));
create policy attendance_read on public.pt_attendance for select to authenticated using(public.payment_can_read(owner_id,student_id));
create function public.pt_session_read(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.pt_attendance a where a.session_id=p_id and public.payment_can_read(a.owner_id,a.student_id))
$$;
create policy session_read on public.pt_sessions for select to authenticated using(public.pt_session_read(id));
create function public.pt_audit_write() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.pt_attendance_audit(actor_id,before_data,after_data)
 values(auth.uid(),case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
create trigger pt_attendance_history after insert or update on public.pt_attendance for each row execute function public.pt_audit_write();

create function public.pt_create_pack(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid:=(p_data->>'student_id')::uuid; pid uuid; result uuid; pay public.student_payments;
begin
 if sid is null or not public.payment_can_manage(sid) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('pt:'||auth.uid()::text,0));
 select id into result from public.pt_packs where owner_id=auth.uid() and request_id=(p_data->>'request_id')::uuid;
 if found then return result; end if;
 pid:=nullif(p_data->>'payment_id','')::uuid;
 if pid is null then
  pid:=public.payment_save(jsonb_build_object('request_id',p_data->>'request_id','student_id',sid,'kind','package',
   'amount_cents',p_data->'amount_cents','period',date_trunc('month',(now() at time zone 'Europe/Lisbon'))::date,
   'due_on',p_data->>'due_on','status','pending','description',p_data->>'title'));
 end if;
 select * into pay from public.student_payments where id=pid for update;
 if not found or pay.owner_id<>auth.uid() or pay.student_id<>sid or pay.kind<>'package' or pay.status='cancelled' then
  raise exception 'Escolhe um pagamento de pack válido para este aluno.';
 end if;
 insert into public.pt_packs(owner_id,student_id,payment_id,title,total,request_id)
 values(auth.uid(),sid,pid,trim(p_data->>'title'),(p_data->>'total')::integer,(p_data->>'request_id')::uuid) returning id into result;
 return result;
end $$;

create function public.pt_save_session(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
 if exists(select 1 from public.pt_sessions s where s.owner_id=auth.uid() and s.id is distinct from result
  and s.starts_at<starttime+make_interval(mins=>minutes) and s.starts_at+make_interval(mins=>s.duration)>starttime
  and exists(select 1 from public.pt_attendance a where a.session_id=s.id and a.status<>'cancelled')) then
  raise exception 'Conflito de horário: já tens uma sessão neste intervalo.';
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
end $$;

create function public.pt_mark_attendance(p_session uuid,p_student uuid,p_status text,p_deduct boolean,p_pack uuid,p_version integer) returns void
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
  if not found or p.student_id<>p_student or p.owner_id<>auth.uid() then raise exception 'Pack inválido.'; end if;
  if charge then
   if (select status from public.student_payments where id=p.payment_id)='cancelled' then raise exception 'O pagamento deste pack foi anulado.'; end if;
   select count(*) into used from public.pt_attendance where pack_id=p_pack and deduct and not(session_id=p_session and student_id=p_student);
   if used>=p.total then raise exception 'Este pack não tem sessões disponíveis. Associa outro pack.'; end if;
  end if;
 end if;
 update public.pt_attendance set status=p_status,deduct=charge,pack_id=p_pack,version=version+1,updated_at=now()
 where session_id=p_session and student_id=p_student;
end $$;

create function public.pt_copy_week(p_source date,p_target date) returns integer language plpgsql security definer set search_path='' as $$
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
  if exists(select 1 from public.pt_sessions other where other.owner_id=auth.uid() and other.starts_at<targettime+make_interval(mins=>s.duration)
   and other.starts_at+make_interval(mins=>other.duration)>targettime and exists(select 1 from public.pt_attendance a where a.session_id=other.id and a.status<>'cancelled')) then
   raise exception 'Conflito de horário em %. Nenhuma sessão foi copiada.',to_char(targettime at time zone 'Europe/Lisbon','DD/MM HH24:MI');
  end if;
  insert into public.pt_sessions(owner_id,starts_at,duration,kind,location,request_id,copied_from)
  values(auth.uid(),targettime,s.duration,s.kind,s.location,gen_random_uuid(),s.id) returning id into newid;
  insert into public.pt_attendance(session_id,student_id,owner_id,pack_id)
  select newid,a.student_id,auth.uid(),case when pay.status<>'cancelled' then a.pack_id end
  from public.pt_attendance a left join public.pt_packs p on p.id=a.pack_id left join public.student_payments pay on pay.id=p.payment_id
  where a.session_id=s.id and a.status<>'cancelled';
  countnew:=countnew+1;
 end loop;
 return countnew;
end $$;

-- A single consistent snapshot; student responses never include other group members.
create function public.pt_snapshot(p_week date) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object(
 'sessions',coalesce((select jsonb_agg(s order by starts_at) from public.pt_sessions s where (starts_at at time zone 'Europe/Lisbon')::date>=p_week and (starts_at at time zone 'Europe/Lisbon')::date<p_week+7),'[]'::jsonb),
 'attendance',coalesce((select jsonb_agg(a) from public.pt_attendance a join public.pt_sessions s on s.id=a.session_id where (s.starts_at at time zone 'Europe/Lisbon')::date>=p_week and (s.starts_at at time zone 'Europe/Lisbon')::date<p_week+7),'[]'::jsonb),
 'packs',coalesce((select jsonb_agg(x) from (select p.*,(select count(*) from public.pt_attendance a where a.pack_id=p.id and a.deduct) as used from public.pt_packs p order by created_at desc) x),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.pt_session_read(uuid),public.pt_audit_write(),public.pt_create_pack(jsonb),public.pt_save_session(jsonb),
 public.pt_mark_attendance(uuid,uuid,text,boolean,uuid,integer),public.pt_copy_week(date,date),public.pt_snapshot(date) from public,anon,authenticated;
grant execute on function public.pt_session_read(uuid),public.pt_create_pack(jsonb),public.pt_save_session(jsonb),
 public.pt_mark_attendance(uuid,uuid,text,boolean,uuid,integer),public.pt_copy_week(date,date),public.pt_snapshot(date) to authenticated;
