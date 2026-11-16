-- Shared studio access for active admins and the owner account.
create or replace function public.studio_can_access() returns boolean
language sql stable security definer
set search_path=''
as $$
 select auth.uid() is not null and exists (
  select 1 from public.profiles p
  where p.id=(select auth.uid())
   and p.role::text in ('admin','owner')
   and p.is_active and p.deleted_at is null
 );
$$;
revoke all on function public.studio_can_access() from public,anon,authenticated;
grant execute on function public.studio_can_access() to authenticated;

-- The single active owner profile identifies the shared studio workspace.
create or replace function public.studio_workspace_id() returns uuid
language plpgsql stable security definer
set search_path=''
as $$
declare
 v_owner_count integer;
 v_workspace_id uuid;
begin
 if not public.studio_can_access() then return null; end if;

 select count(*),(array_agg(p.id order by p.id))[1]
 into v_owner_count,v_workspace_id
 from public.profiles p
 where p.role::text='owner' and p.is_active and p.deleted_at is null;

 if v_owner_count<>1 then
  raise exception 'The studio workspace requires exactly one active owner account.';
 end if;
 return v_workspace_id;
end
$$;
revoke all on function public.studio_workspace_id() from public,anon,authenticated;
grant execute on function public.studio_workspace_id() to authenticated;

-- The owner sees an aggregate across all trainers; each admin sees only their own.
-- This function never returns payment rows or per-student amounts.
create function public.studio_personal_training_summary(p_from date,p_to date)
returns table(month date,amount_cents bigint)
language plpgsql stable security definer
set search_path=''
as $$
declare
 v_role text;
begin
 if auth.uid() is null then
  raise exception 'Sem permissão para consultar os valores.' using errcode='42501';
 end if;

 select p.role::text into v_role
 from public.profiles p
 where p.id=(select auth.uid()) and p.is_active and p.deleted_at is null;

 if coalesce(v_role,'') not in ('admin','owner') then
  raise exception 'Sem permissão para consultar os valores.' using errcode='42501';
 end if;
 if p_from is null or p_to is null or p_to<=p_from then
  raise exception 'Intervalo inválido.';
 end if;

 return query
 select date_trunc('month',p.paid_on::timestamp)::date,sum(p.amount_cents)::bigint
 from public.student_payments p
 where p.status='paid'
  and p.paid_on>=p_from and p.paid_on<p_to
  and (v_role='owner' or p.owner_id=(select auth.uid()))
 group by date_trunc('month',p.paid_on::timestamp)::date
 order by date_trunc('month',p.paid_on::timestamp)::date;
end
$$;
revoke all on function public.studio_personal_training_summary(date,date) from public,anon,authenticated;
grant execute on function public.studio_personal_training_summary(date,date) to authenticated;

-- Gestão do Estúdio: registos partilhados, independentes dos alunos de treino pessoal.
create table public.studio_group_members (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id),
 first_name text not null check (char_length(btrim(first_name)) between 1 and 60),
 last_name text not null check (char_length(btrim(last_name)) between 1 and 60),
 whatsapp_phone text not null default '' check (char_length(whatsapp_phone)<=40),
 monthly_fee_cents integer not null check (monthly_fee_cents between 1 and 100000000),
 due_day integer not null default 8 check (due_day between 1 and 31),
 starts_on date not null default ((now() at time zone 'Europe/Lisbon')::date),
 ends_on date,
 active boolean not null default true,
 request_id uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (owner_id,id),
 unique (owner_id,request_id),
 check (ends_on is null or ends_on>=starts_on)
);
create index studio_group_members_owner_active on public.studio_group_members(owner_id,active,first_name,last_name);

create table public.studio_group_charges (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id),
 member_id uuid not null,
 period date not null check (extract(day from period)=1),
 amount_cents integer not null check (amount_cents between 1 and 100000000),
 due_on date not null,
 status text not null default 'pending' check (status in ('pending','paid','cancelled')),
 paid_on date,
 method text check (method is null or method in ('mbway','cash','transfer','other')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (owner_id,member_id,period),
 foreign key (owner_id,member_id) references public.studio_group_members(owner_id,id),
 check ((status='paid' and paid_on is not null) or (status<>'paid' and paid_on is null))
);
create index studio_group_charges_owner_period on public.studio_group_charges(owner_id,period);
create index studio_group_charges_owner_paid_on on public.studio_group_charges(owner_id,paid_on) where status='paid';

create table public.studio_recurring_items (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id),
 direction text not null check (direction in ('income','expense')),
 category text not null check (char_length(btrim(category)) between 1 and 40),
 description text not null check (char_length(btrim(description)) between 1 and 160),
 amount_cents integer not null check (amount_cents between 1 and 100000000),
 due_day integer not null default 8 check (due_day between 1 and 31),
 starts_on date not null default ((now() at time zone 'Europe/Lisbon')::date),
 ends_on date,
 active boolean not null default true,
 request_id uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (owner_id,id),
 unique (owner_id,request_id),
 check (ends_on is null or ends_on>=starts_on)
);
create index studio_recurring_items_owner_active on public.studio_recurring_items(owner_id,active);

create table public.studio_financial_records (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id),
 recurring_item_id uuid,
 direction text not null check (direction in ('income','expense')),
 category text not null check (char_length(btrim(category)) between 1 and 40),
 description text not null check (char_length(btrim(description)) between 1 and 160),
 amount_cents integer not null check (amount_cents between 1 and 100000000),
 period date not null check (extract(day from period)=1),
 due_on date not null,
 status text not null default 'pending' check (status in ('pending','paid','cancelled')),
 paid_on date,
 method text check (method is null or method in ('mbway','cash','transfer','other')),
 request_id uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (owner_id,id),
 unique (owner_id,request_id),
 foreign key (owner_id,recurring_item_id) references public.studio_recurring_items(owner_id,id),
 check ((status='paid' and paid_on is not null) or (status<>'paid' and paid_on is null))
);
create unique index studio_financial_records_recurring_period
 on public.studio_financial_records(owner_id,recurring_item_id,period)
 where recurring_item_id is not null;
create index studio_financial_records_owner_period on public.studio_financial_records(owner_id,period);
create index studio_financial_records_owner_paid_on
 on public.studio_financial_records(owner_id,paid_on) where status='paid';

alter table public.studio_group_members enable row level security;
alter table public.studio_group_charges enable row level security;
alter table public.studio_recurring_items enable row level security;
alter table public.studio_financial_records enable row level security;

revoke all on public.studio_group_members,public.studio_group_charges,
 public.studio_recurring_items,public.studio_financial_records from anon,authenticated;
grant select,insert,update,delete on public.studio_group_members,public.studio_group_charges,
 public.studio_recurring_items,public.studio_financial_records to authenticated;

create policy studio_group_members_admins_all on public.studio_group_members
 for all to authenticated
 using ((select public.studio_can_access()) and owner_id=(select public.studio_workspace_id()))
 with check ((select public.studio_can_access()) and owner_id=(select public.studio_workspace_id()));
create policy studio_group_charges_admins_all on public.studio_group_charges
 for all to authenticated
 using ((select public.studio_can_access()) and owner_id=(select public.studio_workspace_id()))
 with check ((select public.studio_can_access()) and owner_id=(select public.studio_workspace_id()));
create policy studio_recurring_items_admins_all on public.studio_recurring_items
 for all to authenticated
 using ((select public.studio_can_access()) and owner_id=(select public.studio_workspace_id()))
 with check ((select public.studio_can_access()) and owner_id=(select public.studio_workspace_id()));
create policy studio_financial_records_admins_all on public.studio_financial_records
 for all to authenticated
 using ((select public.studio_can_access()) and owner_id=(select public.studio_workspace_id()))
 with check ((select public.studio_can_access()) and owner_id=(select public.studio_workspace_id()));

-- Geração idempotente da mensalidade de grupo e dos registos recorrentes do mês.
-- SECURITY INVOKER mantém a verificação de RLS do utilizador autenticado.
create function public.studio_generate_month(p_month date) returns integer
language plpgsql
security invoker
set search_path=''
as $$
declare
 v_end date;
 v_count integer:=0;
 v_step integer;
 v_workspace_id uuid;
begin
 if auth.uid() is null or not public.studio_can_access() then
  raise exception 'Sem permissão para gerir o estúdio.' using errcode='42501';
 end if;
 v_workspace_id:=public.studio_workspace_id();
 if p_month is null or extract(day from p_month)<>1 then
  raise exception 'Mês inválido.';
 end if;

 v_end:=(p_month+interval '1 month - 1 day')::date;

 insert into public.studio_group_charges(owner_id,member_id,period,amount_cents,due_on)
 select m.owner_id,m.id,p_month,m.monthly_fee_cents,
  p_month+(least(m.due_day,extract(day from v_end)::integer)-1)
 from public.studio_group_members m
 where m.owner_id=v_workspace_id
  and (m.active or m.ends_on is not null)
  and m.starts_on<=v_end
  and (m.ends_on is null or m.ends_on>=p_month)
 on conflict(owner_id,member_id,period) do nothing;
 get diagnostics v_step=row_count;
 v_count:=v_count+v_step;

 insert into public.studio_financial_records(
  owner_id,recurring_item_id,direction,category,description,amount_cents,period,due_on,request_id
 )
 select r.owner_id,r.id,r.direction,r.category,r.description,r.amount_cents,p_month,
  p_month+(least(r.due_day,extract(day from v_end)::integer)-1),
  gen_random_uuid()
 from public.studio_recurring_items r
 where r.owner_id=v_workspace_id
  and (r.active or r.ends_on is not null)
  and r.starts_on<=v_end
  and (r.ends_on is null or r.ends_on>=p_month)
 on conflict(owner_id,recurring_item_id,period) where recurring_item_id is not null do nothing;
 get diagnostics v_step=row_count;
 v_count:=v_count+v_step;

 return v_count;
end
$$;

revoke all on function public.studio_generate_month(date) from public,anon;
grant execute on function public.studio_generate_month(date) to authenticated;
