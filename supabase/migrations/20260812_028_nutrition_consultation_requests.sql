-- ULTIMATE FIT APP
-- Migration 028: pedidos de consulta de nutrição
-- Data: 2026-08-12
--
-- Regras:
-- * aluno pode criar e consultar os próprios pedidos;
-- * equipa autorizada pode consultar e atualizar pedidos dos alunos que acompanha;
-- * apenas um pedido ativo por aluno de cada vez.

begin;

create table if not exists public.nutrition_consultation_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  status text not null default 'requested',
  message text,
  handled_by uuid references public.profiles(id) on delete set null,
  notification_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_consultation_requests_status_check check (status in ('requested','contacted','scheduled','completed','cancelled')),
  constraint nutrition_consultation_requests_message_check check (message is null or char_length(message) <= 800)
);

alter table public.nutrition_consultation_requests
  add column if not exists notification_sent_at timestamptz;

create index if not exists nutrition_consultation_requests_student_created_idx
  on public.nutrition_consultation_requests (student_id, created_at desc);

create unique index if not exists nutrition_consultation_requests_one_active_per_student_idx
  on public.nutrition_consultation_requests (student_id)
  where status in ('requested','contacted','scheduled');

create or replace function public.prepare_nutrition_consultation_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.message := nullif(btrim(coalesce(new.message,'')), '');
  if tg_op = 'INSERT' then
    new.requested_by := auth.uid();
    new.status := 'requested';
    new.handled_by := null;
    new.notification_sent_at := null;
  elsif new.status <> old.status and new.status in ('contacted','scheduled','completed','cancelled') then
    new.handled_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists nutrition_consultation_requests_prepare on public.nutrition_consultation_requests;
create trigger nutrition_consultation_requests_prepare
before insert or update on public.nutrition_consultation_requests
for each row execute function public.prepare_nutrition_consultation_request();

drop trigger if exists nutrition_consultation_requests_set_updated_at on public.nutrition_consultation_requests;
create trigger nutrition_consultation_requests_set_updated_at
before update on public.nutrition_consultation_requests
for each row execute function public.set_updated_at();

alter table public.nutrition_consultation_requests enable row level security;

drop policy if exists nutrition_consultation_requests_select_accessible on public.nutrition_consultation_requests;
create policy nutrition_consultation_requests_select_accessible
on public.nutrition_consultation_requests
for select to authenticated
using (
  student_id = public.current_student_id()
  or public.can_manage_nutrition_student(student_id)
);

drop policy if exists nutrition_consultation_requests_insert_own on public.nutrition_consultation_requests;
create policy nutrition_consultation_requests_insert_own
on public.nutrition_consultation_requests
for insert to authenticated
with check (
  student_id = public.current_student_id()
  and requested_by = auth.uid()
);

drop policy if exists nutrition_consultation_requests_update_staff on public.nutrition_consultation_requests;
create policy nutrition_consultation_requests_update_staff
on public.nutrition_consultation_requests
for update to authenticated
using (
  public.can_manage_nutrition_student(student_id)
)
with check (
  public.can_manage_nutrition_student(student_id)
);

revoke all on table public.nutrition_consultation_requests from anon;
grant select, insert, update on table public.nutrition_consultation_requests to authenticated;
grant execute on function public.prepare_nutrition_consultation_request() to authenticated;

commit;
