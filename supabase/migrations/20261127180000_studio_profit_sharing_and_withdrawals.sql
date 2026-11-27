-- Track partner profit allocation, owner withdrawals, and who funded studio expenses.
-- The existing studio workspace and access policies remain the boundary for these records.

alter table public.studio_financial_records
 add column expense_paid_by text not null default 'studio'
  check (expense_paid_by in ('studio','partner_a','partner_b','shared'));
alter table public.studio_financial_records
 add constraint studio_financial_records_expense_payer_direction
  check (direction='expense' or expense_paid_by='studio');

alter table public.studio_recurring_items
 add column expense_paid_by text not null default 'studio'
  check (expense_paid_by in ('studio','partner_a','partner_b','shared'));
alter table public.studio_recurring_items
 add constraint studio_recurring_items_expense_payer_direction
  check (direction='expense' or expense_paid_by='studio');

create table public.studio_profit_settings (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id),
 valid_from date not null check (extract(day from valid_from)=1),
 partner_a_name text not null check (char_length(btrim(partner_a_name)) between 1 and 100),
 partner_b_name text not null check (char_length(btrim(partner_b_name)) between 1 and 100),
 partner_a_percent integer not null default 50 check (partner_a_percent between 0 and 100),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (owner_id,valid_from),
 unique (owner_id,id)
);
create index studio_profit_settings_owner_effective
 on public.studio_profit_settings(owner_id,valid_from desc);

create table public.studio_owner_withdrawals (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id),
 partner_key text not null check (partner_key in ('partner_a','partner_b')),
 amount_cents integer not null check (amount_cents between 1 and 100000000),
 withdrawn_on date not null,
 description text not null default '' check (char_length(description)<=160),
 request_id uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (owner_id,id),
 unique (owner_id,request_id)
);
create index studio_owner_withdrawals_owner_date
 on public.studio_owner_withdrawals(owner_id,withdrawn_on);

alter table public.studio_profit_settings enable row level security;
alter table public.studio_owner_withdrawals enable row level security;

revoke all on public.studio_profit_settings,public.studio_owner_withdrawals from public,anon,authenticated;
grant select,insert,update,delete on public.studio_profit_settings,public.studio_owner_withdrawals to authenticated;

create policy studio_profit_settings_admins_all on public.studio_profit_settings
 for all to authenticated
 using ((select public.studio_can_access()) and owner_id=(select public.studio_workspace_id()))
 with check ((select public.studio_can_access()) and owner_id=(select public.studio_workspace_id()));
create policy studio_owner_withdrawals_admins_all on public.studio_owner_withdrawals
 for all to authenticated
 using ((select public.studio_can_access()) and owner_id=(select public.studio_workspace_id()))
 with check ((select public.studio_can_access()) and owner_id=(select public.studio_workspace_id()));

-- Carry each recurring expense's funding source into its monthly record.
create or replace function public.studio_generate_month(p_month date) returns integer
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
  owner_id,recurring_item_id,direction,category,description,amount_cents,period,due_on,request_id,expense_paid_by
 )
 select r.owner_id,r.id,r.direction,r.category,r.description,r.amount_cents,p_month,
  p_month+(least(r.due_day,extract(day from v_end)::integer)-1),
  gen_random_uuid(),case when r.direction='expense' then r.expense_paid_by else 'studio' end
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
