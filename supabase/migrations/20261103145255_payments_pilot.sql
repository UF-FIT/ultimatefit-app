-- Pilot enabled only for the verified Rui Marques profile. No charges are seeded.
create table public.payment_managers (
 profile_id uuid primary key references public.profiles(id), enabled boolean not null default false
);
insert into public.payment_managers values ('392fe540-ed9b-4548-9051-2f43405f11cc',true);
alter table public.payment_managers enable row level security;
revoke all on public.payment_managers from anon, authenticated;

create function public.payment_can_manage(p_student uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.payment_managers m join public.profiles p on p.id=m.profile_id
 where m.profile_id=auth.uid() and m.enabled and p.is_active and p.deleted_at is null
 and (p_student is null or exists(select 1 from public.trainer_students ts
 join public.trainer_profiles tp on tp.id=ts.trainer_id join public.student_profiles s on s.id=ts.student_id
 where tp.profile_id=m.profile_id and ts.student_id=p_student and ts.ended_at is null and s.deleted_at is null)))
$$;
create function public.payment_can_read(p_owner uuid,p_student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.payment_managers m join public.profiles owner on owner.id=m.profile_id
 join public.trainer_profiles tp on tp.profile_id=m.profile_id
 join public.trainer_students ts on ts.trainer_id=tp.id and ts.ended_at is null
 join public.student_profiles s on s.id=ts.student_id
 join public.profiles viewer on viewer.id=auth.uid()
 where m.enabled and m.profile_id=p_owner and owner.is_active and owner.deleted_at is null
 and s.id=p_student and s.deleted_at is null and viewer.is_active and viewer.deleted_at is null
 and (auth.uid()=p_owner or auth.uid()=s.profile_id))
$$;
create function public.payment_access() returns text
language sql stable security definer set search_path='' as $$
 select case when public.payment_can_manage() then 'manage'
 when exists(select 1 from public.student_profiles s join public.payment_managers m on m.enabled
 where s.profile_id=auth.uid() and public.payment_can_read(m.profile_id,s.id)) then 'read' else 'none' end
$$;

create table public.student_billing (
 student_id uuid not null references public.student_profiles(id),
 owner_id uuid not null references public.profiles(id),
 amount_cents integer not null check(amount_cents between 1 and 100000000),
 due_day integer not null check(due_day between 1 and 31),
 starts_on date not null check(extract(day from starts_on)=1),
 enabled boolean not null default true,
 updated_at timestamptz not null default now(),
 primary key(owner_id,student_id)
);
create table public.student_payments (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id),
 student_id uuid not null references public.student_profiles(id),
 kind text not null check(kind in ('monthly','package','session','assessment','other')),
 amount_cents integer not null check(amount_cents between 1 and 100000000),
 period date not null check(extract(day from period)=1),
 due_on date not null,
 status text not null default 'pending' check(status in ('pending','paid','cancelled')),
 paid_on date,
 method text check(method in ('mbway','cash','transfer')),
 receipt_reference text not null default '' check(length(receipt_reference)<=200),
 description text not null default '' check(length(description)<=500),
 version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint payment_paid_details check((status='paid' and paid_on is not null and method is not null) or
 (status<>'paid' and paid_on is null and method is null))
);
create unique index student_payments_monthly_unique on public.student_payments(owner_id,student_id,period) where kind='monthly' and status<>'cancelled';
create index student_payments_owner_period on public.student_payments(owner_id,period);
create index student_payments_student on public.student_payments(student_id);
create index student_billing_student on public.student_billing(student_id);
alter table public.student_billing enable row level security;
alter table public.student_payments enable row level security;
revoke all on public.student_billing,public.student_payments from anon,authenticated;
grant select on public.student_billing,public.student_payments to authenticated;
create policy billing_read on public.student_billing for select to authenticated using(public.payment_can_read(owner_id,student_id));
create policy payments_read on public.student_payments for select to authenticated using(public.payment_can_read(owner_id,student_id));

create table public.payment_audit (
 id bigint generated always as identity primary key, payment_id uuid not null references public.student_payments(id),
 actor_id uuid references public.profiles(id), changed_at timestamptz not null default now(),
 before_data jsonb, after_data jsonb not null
);
create index payment_audit_payment on public.payment_audit(payment_id);
alter table public.payment_audit enable row level security;
revoke all on public.payment_audit from anon,authenticated;
create function public.payment_record_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.payment_audit(payment_id,actor_id,before_data,after_data)
 values(new.id,auth.uid(),case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
create trigger payment_audit_write after insert or update on public.student_payments for each row execute function public.payment_record_audit();

create function public.payment_save_billing(p_student uuid,p_amount integer,p_day integer,p_starts date,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.payment_can_manage(p_student) then raise exception 'Sem permissão para gerir este aluno.' using errcode='42501'; end if;
 insert into public.student_billing(student_id,owner_id,amount_cents,due_day,starts_on,enabled)
 values(p_student,auth.uid(),p_amount,p_day,p_starts,p_enabled)
 on conflict(owner_id,student_id) do update set amount_cents=excluded.amount_cents,due_day=excluded.due_day,
 starts_on=excluded.starts_on,enabled=excluded.enabled,updated_at=now();
end $$;

create function public.payment_save(p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid()); v_old public.student_payments;
 v_student uuid:=(p_data->>'student_id')::uuid; v_status text:=p_data->>'status';
begin
 if not public.payment_can_manage(v_student) then raise exception 'Sem permissão para gerir este aluno.' using errcode='42501'; end if;
 if v_status not in ('pending','paid','cancelled') then raise exception 'Estado inválido.'; end if;
 if v_status='paid' and (p_data->>'paid_on')::date>(now() at time zone 'Europe/Lisbon')::date then raise exception 'A data do pagamento não pode ser futura.'; end if;
 if nullif(p_data->>'id','') is not null then
  select * into v_old from public.student_payments where id=v_id for update;
  if not found or v_old.owner_id<>auth.uid() or v_old.student_id<>v_student then raise exception 'Pagamento não disponível.' using errcode='42501'; end if;
  if v_old.version is distinct from (p_data->>'version')::integer then raise exception 'Este pagamento foi alterado. Atualiza a página antes de guardar.'; end if;
  if v_old.status='cancelled' then raise exception 'Um registo anulado não pode ser alterado.'; end if;
  update public.student_payments set kind=p_data->>'kind',amount_cents=(p_data->>'amount_cents')::integer,
   period=(p_data->>'period')::date,due_on=(p_data->>'due_on')::date,status=v_status,
   paid_on=case when v_status='paid' then (p_data->>'paid_on')::date end,
   method=case when v_status='paid' then p_data->>'method' end,
   receipt_reference=coalesce(p_data->>'receipt_reference',''),description=coalesce(p_data->>'description',''),
   version=version+1,updated_at=now() where id=v_id;
 else
  insert into public.student_payments(id,owner_id,student_id,kind,amount_cents,period,due_on,status,paid_on,method,receipt_reference,description)
  values(v_id,auth.uid(),v_student,p_data->>'kind',(p_data->>'amount_cents')::integer,(p_data->>'period')::date,
   (p_data->>'due_on')::date,v_status,case when v_status='paid' then (p_data->>'paid_on')::date end,
   case when v_status='paid' then p_data->>'method' end,coalesce(p_data->>'receipt_reference',''),coalesce(p_data->>'description',''));
 end if;
 return v_id;
end $$;

create function public.payment_generate_month(p_month date) returns integer
language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if not public.payment_can_manage() then raise exception 'Sem permissão.' using errcode='42501'; end if;
 if p_month is null or extract(day from p_month)<>1 then raise exception 'Mês inválido.'; end if;
 insert into public.student_payments(owner_id,student_id,kind,amount_cents,period,due_on)
 select b.owner_id,b.student_id,'monthly',b.amount_cents,p_month,
 p_month+(least(b.due_day,extract(day from (p_month+interval '1 month - 1 day'))::integer)-1)
 from public.student_billing b join public.student_profiles s on s.id=b.student_id
 where b.owner_id=auth.uid() and b.enabled and b.starts_on<=p_month and s.status='active' and s.archived_at is null
 and public.payment_can_manage(s.id)
 on conflict(owner_id,student_id,period) where kind='monthly' and status<>'cancelled' do nothing;
 get diagnostics v_count=row_count;
 return v_count;
end $$;

revoke all on function public.payment_can_manage(uuid),public.payment_can_read(uuid,uuid),public.payment_access(),
 public.payment_record_audit(),public.payment_save_billing(uuid,integer,integer,date,boolean),public.payment_save(jsonb),public.payment_generate_month(date) from public,anon;
grant execute on function public.payment_can_manage(uuid),public.payment_can_read(uuid,uuid),public.payment_access(),
 public.payment_save_billing(uuid,integer,integer,date,boolean),public.payment_save(jsonb),public.payment_generate_month(date) to authenticated;
