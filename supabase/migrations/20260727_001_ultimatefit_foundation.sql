-- ULTIMATE FIT APP
-- Migration 001: foundation, roles, profiles, assignments, settings, audit and RLS
-- Target: Supabase PostgreSQL
-- Date: 2026-07-27
--
-- Run this file once in Supabase > SQL Editor > New query.
-- Do not add real users before this migration finishes successfully.

begin;

-- -----------------------------------------------------------------------------
-- 1. ENUMS
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'app_role'
  ) then
    create type public.app_role as enum ('admin', 'trainer', 'student');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'student_status'
  ) then
    create type public.student_status as enum ('active', 'inactive', 'paused', 'archived');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. CORE TABLES
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text,
  avatar_path text,
  role public.app_role not null default 'student',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (length(btrim(email)) > 0),
  constraint profiles_full_name_length check (char_length(full_name) <= 160),
  constraint profiles_phone_length check (phone is null or char_length(phone) <= 40)
);

create unique index if not exists profiles_email_lower_uidx
  on public.profiles (lower(email));

create index if not exists profiles_role_idx
  on public.profiles (role);

create index if not exists profiles_active_idx
  on public.profiles (is_active)
  where is_active = true;

create table if not exists public.trainer_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  professional_title text,
  biography text,
  specialties text[] not null default '{}'::text[],
  color_reference text,
  is_accepting_students boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainer_title_length check (professional_title is null or char_length(professional_title) <= 120),
  constraint trainer_color_length check (color_reference is null or char_length(color_reference) <= 40)
);

create index if not exists trainer_profiles_profile_id_idx
  on public.trainer_profiles (profile_id);

create table if not exists public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  nif text,
  birth_date date,
  sex text,
  occupation text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  start_date date not null default current_date,
  status public.student_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_sex_valid check (
    sex is null or sex in ('male', 'female', 'other', 'prefer_not_to_say')
  ),
  constraint student_nif_length check (nif is null or char_length(nif) between 9 and 20),
  constraint student_birth_date_valid check (birth_date is null or birth_date <= current_date)
);

create unique index if not exists student_profiles_nif_uidx
  on public.student_profiles (nif)
  where nif is not null and btrim(nif) <> '';

create index if not exists student_profiles_profile_id_idx
  on public.student_profiles (profile_id);

create index if not exists student_profiles_status_idx
  on public.student_profiles (status);

create table if not exists public.trainer_students (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer_profiles(id) on delete restrict,
  student_id uuid not null references public.student_profiles(id) on delete restrict,
  is_primary boolean not null default false,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint trainer_students_dates_valid check (ended_at is null or ended_at >= assigned_at)
);

create unique index if not exists trainer_students_active_pair_uidx
  on public.trainer_students (trainer_id, student_id)
  where ended_at is null;

create unique index if not exists trainer_students_one_primary_uidx
  on public.trainer_students (student_id)
  where is_primary = true and ended_at is null;

create index if not exists trainer_students_trainer_active_idx
  on public.trainer_students (trainer_id, student_id)
  where ended_at is null;

create index if not exists trainer_students_student_active_idx
  on public.trainer_students (student_id, trainer_id)
  where ended_at is null;

create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint app_settings_key_valid check (setting_key ~ '^[a-z0-9_]+$')
);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null unique,
  is_enabled boolean not null default false,
  allowed_roles public.app_role[] not null default array['admin', 'trainer', 'student']::public.app_role[],
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint feature_flags_key_valid check (feature_key ~ '^[a-z0-9_]+$')
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id, created_at desc);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 3. GENERIC TRIGGER FUNCTIONS
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Requests made through Supabase Auth have auth.uid().
  -- Internal database/auth trigger work has no auth.uid() and is allowed.
  if (select auth.uid()) is not null then
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at then
      raise exception 'Protected profile fields cannot be changed through the client';
    end if;

    if not public.is_admin()
       and (
         new.role is distinct from old.role
         or new.is_active is distinct from old.is_active
       ) then
      raise exception 'Only an administrator can change role or active status';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.protect_role_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and (
       new.id is distinct from old.id
       or new.profile_id is distinct from old.profile_id
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'Profile identity fields cannot be changed';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. AUTHORIZATION HELPER FUNCTIONS
-- These functions deliberately run as their owner so policies can query the
-- relationship tables without causing recursive RLS evaluation.
-- -----------------------------------------------------------------------------

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active = true
  limit 1;
$$;

create or replace function public.current_profile_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.is_active
    from public.profiles p
    where p.id = (select auth.uid())
    limit 1
  ), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.role = 'admin'::public.app_role and p.is_active
    from public.profiles p
    where p.id = (select auth.uid())
    limit 1
  ), false);
$$;

create or replace function public.current_trainer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tp.id
  from public.trainer_profiles tp
  join public.profiles p on p.id = tp.profile_id
  where tp.profile_id = (select auth.uid())
    and p.role = 'trainer'::public.app_role
    and p.is_active = true
  limit 1;
$$;

create or replace function public.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sp.id
  from public.student_profiles sp
  join public.profiles p on p.id = sp.profile_id
  where sp.profile_id = (select auth.uid())
    and p.role = 'student'::public.app_role
    and p.is_active = true
  limit 1;
$$;

create or replace function public.trainer_has_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.trainer_students ts
    where ts.trainer_id = public.current_trainer_id()
      and ts.student_id = target_student_id
      and ts.ended_at is null
  ), false);
$$;

create or replace function public.student_has_trainer(target_trainer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.trainer_students ts
    where ts.student_id = public.current_student_id()
      and ts.trainer_id = target_trainer_id
      and ts.ended_at is null
  ), false);
$$;

create or replace function public.can_view_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_profile_id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1
      from public.student_profiles sp
      join public.trainer_students ts on ts.student_id = sp.id
      where sp.profile_id = target_profile_id
        and ts.trainer_id = public.current_trainer_id()
        and ts.ended_at is null
    )
    or exists (
      select 1
      from public.trainer_profiles tp
      join public.trainer_students ts on ts.trainer_id = tp.id
      where tp.profile_id = target_profile_id
        and ts.student_id = public.current_student_id()
        and ts.ended_at is null
    );
$$;

-- -----------------------------------------------------------------------------
-- 5. AUTH USER SYNCHRONIZATION
-- Role is read only from raw_app_meta_data because user metadata is editable by
-- the user and must never be trusted for authorization.
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_full_name text;
begin
  v_role := case new.raw_app_meta_data ->> 'app_role'
    when 'admin' then 'admin'::public.app_role
    when 'trainer' then 'trainer'::public.app_role
    when 'student' then 'student'::public.app_role
    else 'student'::public.app_role
  end;

  v_full_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    ''
  );

  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    role,
    is_active
  )
  values (
    new.id,
    coalesce(new.email, new.id::text || '@pending.local'),
    v_full_name,
    new.phone,
    v_role,
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = case
          when public.profiles.full_name = '' then excluded.full_name
          else public.profiles.full_name
        end,
        phone = coalesce(public.profiles.phone, excluded.phone),
        updated_at = now();

  return new;
end;
$$;

create or replace function public.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles
    set email = new.email,
        updated_at = now()
    where id = new.id;
  end if;

  return new;
end;
$$;

create or replace function public.sync_role_specific_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'trainer'::public.app_role then
    insert into public.trainer_profiles (profile_id)
    values (new.id)
    on conflict (profile_id) do nothing;
  elsif new.role = 'student'::public.app_role then
    insert into public.student_profiles (profile_id)
    values (new.id)
    on conflict (profile_id) do nothing;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. AUDIT FUNCTION
-- Stores event type and changed field names, but deliberately avoids copying
-- full rows containing personal data into the audit log.
-- -----------------------------------------------------------------------------

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  v_row jsonb := case when tg_op = 'DELETE' then v_old else v_new end;
  v_entity_id uuid;
  v_changed_fields jsonb := '[]'::jsonb;
  v_row_key text;
begin
  if coalesce(v_row ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_entity_id := (v_row ->> 'id')::uuid;
  elsif coalesce(v_row ->> 'profile_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_entity_id := (v_row ->> 'profile_id')::uuid;
  end if;

  v_row_key := coalesce(
    v_row ->> 'id',
    v_row ->> 'profile_id',
    v_row ->> 'setting_key',
    v_row ->> 'feature_key'
  );

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(changed.key order by changed.key), '[]'::jsonb)
    into v_changed_fields
    from (
      select e.key
      from jsonb_each(v_new) e
      where (v_old -> e.key) is distinct from e.value
    ) changed;
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    v_entity_id,
    jsonb_strip_nulls(jsonb_build_object(
      'row_key', v_row_key,
      'changed_fields', case when tg_op = 'UPDATE' then v_changed_fields else null end
    ))
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. TRIGGERS
-- -----------------------------------------------------------------------------

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists profiles_protect_columns on public.profiles;
create trigger profiles_protect_columns
before update on public.profiles
for each row execute function public.protect_profile_columns();

drop trigger if exists trainer_profiles_set_updated_at on public.trainer_profiles;
create trigger trainer_profiles_set_updated_at
before update on public.trainer_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trainer_profiles_protect_identity on public.trainer_profiles;
create trigger trainer_profiles_protect_identity
before update on public.trainer_profiles
for each row execute function public.protect_role_profile_identity();

drop trigger if exists student_profiles_set_updated_at on public.student_profiles;
create trigger student_profiles_set_updated_at
before update on public.student_profiles
for each row execute function public.set_updated_at();

drop trigger if exists student_profiles_protect_identity on public.student_profiles;
create trigger student_profiles_protect_identity
before update on public.student_profiles
for each row execute function public.protect_role_profile_identity();

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

drop trigger if exists feature_flags_set_updated_at on public.feature_flags;
create trigger feature_flags_set_updated_at
before update on public.feature_flags
for each row execute function public.set_updated_at();

drop trigger if exists profiles_sync_role_specific on public.profiles;
create trigger profiles_sync_role_specific
after insert or update of role on public.profiles
for each row execute function public.sync_role_specific_profile();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.handle_auth_user_email_change();

-- -----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.trainer_profiles enable row level security;
alter table public.student_profiles enable row level security;
alter table public.trainer_students enable row level security;
alter table public.app_settings enable row level security;
alter table public.feature_flags enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles

drop policy if exists profiles_select_accessible on public.profiles;
create policy profiles_select_accessible
on public.profiles
for select
to authenticated
using ((select public.can_view_profile(id)));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = (select auth.uid()) and is_active = true)
with check (
  id = (select auth.uid())
  and role = (select public.current_app_role())
  and is_active = (select public.current_profile_is_active())
);

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
on public.profiles
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- Trainer profiles

drop policy if exists trainer_profiles_select_accessible on public.trainer_profiles;
create policy trainer_profiles_select_accessible
on public.trainer_profiles
for select
to authenticated
using (
  (select public.is_admin())
  or profile_id = (select auth.uid())
  or (select public.student_has_trainer(id))
);

drop policy if exists trainer_profiles_insert_admin on public.trainer_profiles;
create policy trainer_profiles_insert_admin
on public.trainer_profiles
for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists trainer_profiles_update_self on public.trainer_profiles;
create policy trainer_profiles_update_self
on public.trainer_profiles
for update
to authenticated
using (id = (select public.current_trainer_id()))
with check (
  id = (select public.current_trainer_id())
  and profile_id = (select auth.uid())
);

drop policy if exists trainer_profiles_update_admin on public.trainer_profiles;
create policy trainer_profiles_update_admin
on public.trainer_profiles
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists trainer_profiles_delete_admin on public.trainer_profiles;
create policy trainer_profiles_delete_admin
on public.trainer_profiles
for delete
to authenticated
using ((select public.is_admin()));

-- Student profiles

drop policy if exists student_profiles_select_accessible on public.student_profiles;
create policy student_profiles_select_accessible
on public.student_profiles
for select
to authenticated
using (
  (select public.is_admin())
  or profile_id = (select auth.uid())
  or (select public.trainer_has_student(id))
);

drop policy if exists student_profiles_insert_admin on public.student_profiles;
create policy student_profiles_insert_admin
on public.student_profiles
for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists student_profiles_update_trainer on public.student_profiles;
create policy student_profiles_update_trainer
on public.student_profiles
for update
to authenticated
using ((select public.trainer_has_student(id)))
with check ((select public.trainer_has_student(id)));

drop policy if exists student_profiles_update_admin on public.student_profiles;
create policy student_profiles_update_admin
on public.student_profiles
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists student_profiles_delete_admin on public.student_profiles;
create policy student_profiles_delete_admin
on public.student_profiles
for delete
to authenticated
using ((select public.is_admin()));

-- Trainer/student assignments

drop policy if exists trainer_students_select_related on public.trainer_students;
create policy trainer_students_select_related
on public.trainer_students
for select
to authenticated
using (
  (select public.is_admin())
  or trainer_id = (select public.current_trainer_id())
  or student_id = (select public.current_student_id())
);

drop policy if exists trainer_students_insert_admin on public.trainer_students;
create policy trainer_students_insert_admin
on public.trainer_students
for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists trainer_students_update_admin on public.trainer_students;
create policy trainer_students_update_admin
on public.trainer_students
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists trainer_students_delete_admin on public.trainer_students;
create policy trainer_students_delete_admin
on public.trainer_students
for delete
to authenticated
using ((select public.is_admin()));

-- App settings

drop policy if exists app_settings_public_read on public.app_settings;
create policy app_settings_public_read
on public.app_settings
for select
to anon
using (
  setting_key in (
    'coming_soon_enabled',
    'coming_soon_title',
    'coming_soon_message',
    'studio_name'
  )
);

drop policy if exists app_settings_authenticated_read on public.app_settings;
create policy app_settings_authenticated_read
on public.app_settings
for select
to authenticated
using (true);

drop policy if exists app_settings_insert_admin on public.app_settings;
create policy app_settings_insert_admin
on public.app_settings
for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists app_settings_update_admin on public.app_settings;
create policy app_settings_update_admin
on public.app_settings
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists app_settings_delete_admin on public.app_settings;
create policy app_settings_delete_admin
on public.app_settings
for delete
to authenticated
using ((select public.is_admin()));

-- Feature flags

drop policy if exists feature_flags_authenticated_read on public.feature_flags;
create policy feature_flags_authenticated_read
on public.feature_flags
for select
to authenticated
using (
  (select public.current_app_role()) = any(allowed_roles)
  or (select public.is_admin())
);

drop policy if exists feature_flags_insert_admin on public.feature_flags;
create policy feature_flags_insert_admin
on public.feature_flags
for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists feature_flags_update_admin on public.feature_flags;
create policy feature_flags_update_admin
on public.feature_flags
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists feature_flags_delete_admin on public.feature_flags;
create policy feature_flags_delete_admin
on public.feature_flags
for delete
to authenticated
using ((select public.is_admin()));

-- Audit logs: administrators can read; inserts are only performed by the
-- security-definer audit trigger.

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin
on public.audit_logs
for select
to authenticated
using ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- 9. DATABASE PRIVILEGES
-- Grants are the first access layer; RLS policies are the second.
-- -----------------------------------------------------------------------------

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.trainer_profiles from anon, authenticated;
revoke all on table public.student_profiles from anon, authenticated;
revoke all on table public.trainer_students from anon, authenticated;
revoke all on table public.app_settings from anon, authenticated;
revoke all on table public.feature_flags from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.trainer_profiles to authenticated;
grant select, insert, update, delete on table public.student_profiles to authenticated;
grant select, insert, update, delete on table public.trainer_students to authenticated;
grant select on table public.app_settings to anon;
grant select, insert, update, delete on table public.app_settings to authenticated;
grant select, insert, update, delete on table public.feature_flags to authenticated;
grant select on table public.audit_logs to authenticated;

grant usage on type public.app_role to authenticated;
grant usage on type public.student_status to authenticated;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_profile_is_active() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_trainer_id() to authenticated;
grant execute on function public.current_student_id() to authenticated;
grant execute on function public.trainer_has_student(uuid) to authenticated;
grant execute on function public.student_has_trainer(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.handle_auth_user_email_change() from public, anon, authenticated;
revoke execute on function public.sync_role_specific_profile() from public, anon, authenticated;
revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.protect_profile_columns() from public, anon, authenticated;
revoke execute on function public.protect_role_profile_identity() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 10. INITIAL SAFE SETTINGS
-- -----------------------------------------------------------------------------

insert into public.app_settings (setting_key, setting_value)
values
  ('coming_soon_enabled', 'true'::jsonb),
  ('coming_soon_title', '"ULTIMATE FIT APP"'::jsonb),
  ('coming_soon_message', '"A tua evolução, treino e acompanhamento num só lugar."'::jsonb),
  ('allow_student_login', 'false'::jsonb),
  ('allow_trainer_login', 'true'::jsonb),
  ('studio_name', '"ULTIMATE FIT"'::jsonb),
  ('studio_email', '"geral@ultimatefit.pt"'::jsonb)
on conflict (setting_key) do nothing;

insert into public.feature_flags (feature_key, is_enabled, allowed_roles)
values
  ('physical_assessments', true, array['admin', 'trainer', 'student']::public.app_role[]),
  ('progress', true, array['admin', 'trainer', 'student']::public.app_role[]),
  ('workout_plans', true, array['admin', 'trainer', 'student']::public.app_role[]),
  ('nutrition', true, array['admin', 'trainer', 'student']::public.app_role[]),
  ('goals', true, array['admin', 'trainer', 'student']::public.app_role[]),
  ('challenges', false, array['admin', 'trainer', 'student']::public.app_role[]),
  ('announcements', true, array['admin', 'trainer', 'student']::public.app_role[]),
  ('pdf_reports', false, array['admin', 'trainer', 'student']::public.app_role[]),
  ('workout_tracking', false, array['admin', 'trainer', 'student']::public.app_role[]),
  ('progress_photos', false, array['admin', 'trainer', 'student']::public.app_role[])
on conflict (feature_key) do nothing;

-- -----------------------------------------------------------------------------
-- 11. AUDIT TRIGGERS
-- Added after seed data so installation itself does not create noisy logs.
-- -----------------------------------------------------------------------------

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
after insert or update or delete on public.profiles
for each row execute function public.audit_row_change();

drop trigger if exists trainer_profiles_audit on public.trainer_profiles;
create trigger trainer_profiles_audit
after insert or update or delete on public.trainer_profiles
for each row execute function public.audit_row_change();

drop trigger if exists student_profiles_audit on public.student_profiles;
create trigger student_profiles_audit
after insert or update or delete on public.student_profiles
for each row execute function public.audit_row_change();

drop trigger if exists trainer_students_audit on public.trainer_students;
create trigger trainer_students_audit
after insert or update or delete on public.trainer_students
for each row execute function public.audit_row_change();

drop trigger if exists app_settings_audit on public.app_settings;
create trigger app_settings_audit
after insert or update or delete on public.app_settings
for each row execute function public.audit_row_change();

drop trigger if exists feature_flags_audit on public.feature_flags;
create trigger feature_flags_audit
after insert or update or delete on public.feature_flags
for each row execute function public.audit_row_change();

commit;
