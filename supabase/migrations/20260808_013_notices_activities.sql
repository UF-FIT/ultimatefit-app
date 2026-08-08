-- ULTIMATE FIT APP
-- Migration 013: avisos/pop-ups + atividades e inscrições
-- Data: 2026-08-08
-- Requer migrations anteriores até 012.

begin;

create table if not exists public.app_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  target_audience text not null default 'students',
  show_popup boolean not null default true,
  show_dashboard boolean not null default true,
  is_active boolean not null default true,
  active_from timestamptz not null default now(),
  active_until timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_notices_title_check check (char_length(btrim(title)) between 2 and 120),
  constraint app_notices_body_check check (char_length(btrim(body)) between 2 and 4000),
  constraint app_notices_target_check check (target_audience in ('students','team','all')),
  constraint app_notices_dates_check check (active_until is null or active_until >= active_from)
);

drop trigger if exists app_notices_set_updated_at on public.app_notices;
create trigger app_notices_set_updated_at before update on public.app_notices
for each row execute function public.set_updated_at();

alter table public.app_notices enable row level security;
drop policy if exists app_notices_read on public.app_notices;
create policy app_notices_read on public.app_notices for select to authenticated using (
  public.is_admin()
  or (
    is_active = true
    and active_from <= now()
    and (active_until is null or active_until >= now())
    and (
      target_audience = 'all'
      or (target_audience = 'students' and public.current_app_role() = 'student'::public.app_role)
      or (target_audience = 'team' and public.current_app_role() in ('owner'::public.app_role,'admin'::public.app_role,'trainer'::public.app_role))
    )
  )
);
drop policy if exists app_notices_admin_insert on public.app_notices;
create policy app_notices_admin_insert on public.app_notices for insert to authenticated with check (public.is_admin());
drop policy if exists app_notices_admin_update on public.app_notices;
create policy app_notices_admin_update on public.app_notices for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists app_notices_admin_delete on public.app_notices;
create policy app_notices_admin_delete on public.app_notices for delete to authenticated using (public.is_admin());

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  description text,
  event_date date not null,
  start_time time,
  location text,
  fee_cents integer not null default 0,
  capacity integer,
  poster_url text,
  registration_open boolean not null default true,
  registration_deadline timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_title_check check (char_length(btrim(title)) between 2 and 160),
  constraint activities_slug_check check (slug ~ '^[a-z0-9-]+$'),
  constraint activities_fee_check check (fee_cents >= 0),
  constraint activities_capacity_check check (capacity is null or capacity > 0)
);
create unique index if not exists activities_slug_uidx on public.activities(slug);
create index if not exists activities_date_idx on public.activities(event_date desc);

drop trigger if exists activities_set_updated_at on public.activities;
create trigger activities_set_updated_at before update on public.activities
for each row execute function public.set_updated_at();

create table if not exists public.activity_registrations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  status text not null default 'registered',
  payment_status text not null default 'not_applicable',
  amount_paid_cents integer not null default 0,
  notes text,
  registered_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint activity_reg_status_check check (status in ('registered','cancelled')),
  constraint activity_payment_status_check check (payment_status in ('not_applicable','pending','paid')),
  constraint activity_amount_paid_check check (amount_paid_cents >= 0),
  constraint activity_reg_unique unique(activity_id, student_id)
);
create index if not exists activity_registrations_activity_idx on public.activity_registrations(activity_id,status);
create index if not exists activity_registrations_student_idx on public.activity_registrations(student_id,registered_at desc);

drop trigger if exists activity_registrations_set_updated_at on public.activity_registrations;
create trigger activity_registrations_set_updated_at before update on public.activity_registrations
for each row execute function public.set_updated_at();

alter table public.activities enable row level security;
alter table public.activity_registrations enable row level security;

drop policy if exists activities_read on public.activities;
create policy activities_read on public.activities for select to authenticated using (public.is_admin() or is_active = true);
drop policy if exists activities_admin_insert on public.activities;
create policy activities_admin_insert on public.activities for insert to authenticated with check (public.is_admin());
drop policy if exists activities_admin_update on public.activities;
create policy activities_admin_update on public.activities for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists activities_admin_delete on public.activities;
create policy activities_admin_delete on public.activities for delete to authenticated using (public.is_admin());

drop policy if exists activity_registrations_read on public.activity_registrations;
create policy activity_registrations_read on public.activity_registrations for select to authenticated using (
  public.is_admin() or student_id = public.current_student_id()
);
drop policy if exists activity_registrations_admin_update on public.activity_registrations;
create policy activity_registrations_admin_update on public.activity_registrations for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.register_for_activity(target_activity_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_student uuid := public.current_student_id();
  a public.activities%rowtype;
  reg_id uuid;
  current_count integer;
begin
  if actor_student is null then raise exception 'Apenas alunos podem efetuar esta inscrição.'; end if;
  select * into a from public.activities where id = target_activity_id and is_active = true;
  if not found then raise exception 'Atividade indisponível.'; end if;
  if not a.registration_open then raise exception 'As inscrições estão encerradas.'; end if;
  if a.registration_deadline is not null and now() > a.registration_deadline then raise exception 'O prazo de inscrição terminou.'; end if;
  if a.capacity is not null then
    select count(*) into current_count from public.activity_registrations where activity_id=a.id and status='registered';
    if current_count >= a.capacity and not exists(select 1 from public.activity_registrations where activity_id=a.id and student_id=actor_student and status='registered') then
      raise exception 'A atividade já atingiu a lotação.';
    end if;
  end if;

  insert into public.activity_registrations(activity_id,student_id,status,payment_status,amount_paid_cents)
  values(a.id,actor_student,'registered',case when a.fee_cents>0 then 'pending' else 'not_applicable' end,0)
  on conflict(activity_id,student_id) do update set
    status='registered',
    payment_status=case when public.activity_registrations.payment_status='paid' then 'paid' when a.fee_cents>0 then 'pending' else 'not_applicable' end,
    updated_at=now()
  returning id into reg_id;
  return reg_id;
end;
$$;

create or replace function public.cancel_activity_registration(target_activity_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare actor_student uuid := public.current_student_id();
begin
  if actor_student is null then raise exception 'Sessão de aluno inválida.'; end if;
  update public.activity_registrations set status='cancelled',updated_at=now()
  where activity_id=target_activity_id and student_id=actor_student;
  return found;
end;
$$;

revoke all on public.app_notices, public.activities, public.activity_registrations from anon;
grant select on public.app_notices, public.activities, public.activity_registrations to authenticated;
grant insert,update,delete on public.app_notices, public.activities to authenticated;
grant update on public.activity_registrations to authenticated;
grant execute on function public.register_for_activity(uuid) to authenticated;
grant execute on function public.cancel_activity_registration(uuid) to authenticated;

commit;
