-- ULTIMATE FIT APP
-- Migration 004: real student management, assignments, invitations,
-- lifecycle, professional WhatsApp and private optimized avatars.
-- Run only after Migration 003 has completed successfully.

begin;

-- -----------------------------------------------------------------------------
-- 1. PROFESSIONAL CONTACT REQUIREMENT
-- -----------------------------------------------------------------------------

alter table public.trainer_profiles
  add column if not exists whatsapp_phone text;

alter table public.trainer_profiles
  drop constraint if exists trainer_whatsapp_length;

alter table public.trainer_profiles
  add constraint trainer_whatsapp_length check (
    whatsapp_phone is null or char_length(regexp_replace(whatsapp_phone, '[^0-9+]', '', 'g')) between 9 and 20
  );

-- -----------------------------------------------------------------------------
-- 2. EXTEND PROFILES AND STUDENT RECORDS
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists avatar_thumb_path text;

create sequence if not exists public.student_number_seq start with 1 increment by 1;

alter table public.student_profiles
  add column if not exists student_number bigint,
  add column if not exists citizen_card text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists tracking_type text,
  add column if not exists main_goal text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz;

update public.student_profiles
set student_number = nextval('public.student_number_seq')
where student_number is null;

alter table public.student_profiles
  alter column student_number set default nextval('public.student_number_seq'),
  alter column student_number set not null;

create unique index if not exists student_profiles_student_number_uidx
  on public.student_profiles (student_number);

create index if not exists student_profiles_tracking_type_idx
  on public.student_profiles (tracking_type);

create index if not exists student_profiles_deleted_idx
  on public.student_profiles (deleted_at)
  where deleted_at is not null;

alter table public.student_profiles
  drop constraint if exists student_tracking_type_valid;

alter table public.student_profiles
  add constraint student_tracking_type_valid check (
    tracking_type is null or tracking_type in (
      'personal_training',
      'online_training',
      'home_training',
      'group_classes'
    )
  );

alter table public.student_profiles
  drop constraint if exists student_postal_code_length;

alter table public.student_profiles
  add constraint student_postal_code_length check (
    postal_code is null or char_length(postal_code) <= 24
  );

alter table public.student_profiles
  drop constraint if exists student_city_length;

alter table public.student_profiles
  add constraint student_city_length check (
    city is null or char_length(city) <= 120
  );

alter table public.trainer_students
  add column if not exists assigned_by uuid references public.profiles(id) on delete set null,
  add column if not exists ended_by uuid references public.profiles(id) on delete set null,
  add column if not exists end_reason text;

-- -----------------------------------------------------------------------------
-- 3. STUDENT INVITATIONS AND ACTIVITY HISTORY
-- -----------------------------------------------------------------------------

create table if not exists public.student_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  status text not null default 'pending',
  invited_by uuid references public.profiles(id) on delete set null,
  auth_user_id uuid references public.profiles(id) on delete set null,
  student_id uuid references public.student_profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  last_sent_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_invitations_status_valid check (
    status in ('pending', 'accepted', 'revoked', 'failed')
  ),
  constraint student_invitations_email_not_blank check (length(btrim(email)) > 3),
  constraint student_invitations_name_not_blank check (length(btrim(full_name)) > 1)
);

create unique index if not exists student_invitations_pending_email_uidx
  on public.student_invitations (lower(email))
  where status = 'pending';

create index if not exists student_invitations_student_idx
  on public.student_invitations (student_id, invited_at desc);

create table if not exists public.student_activity_log (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.student_profiles(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists student_activity_log_student_idx
  on public.student_activity_log (student_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 4. AUTHORIZATION HELPERS
-- -----------------------------------------------------------------------------

create or replace function public.can_view_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_student_id is null then false
    when public.is_admin() then true
    when target_student_id = public.current_student_id() then true
    else public.trainer_has_student(target_student_id)
  end;
$$;

create or replace function public.can_manage_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_student_id is null then false
    when public.is_admin() then true
    else public.trainer_has_student(target_student_id)
      and public.trainer_has_permission('edit_student_profiles')
  end;
$$;

create or replace function public.can_create_student()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    or (
      public.current_trainer_id() is not null
      and public.trainer_has_permission('edit_student_profiles')
    );
$$;

create or replace function public.can_edit_student_avatar(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_student_id is null then false
    when public.is_admin() then true
    when target_student_id = public.current_student_id() then true
    else public.trainer_has_student(target_student_id)
      and public.trainer_has_permission('edit_student_profiles')
  end;
$$;

create or replace function public.student_id_from_storage_path(object_name text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  first_part text;
begin
  first_part := split_part(coalesce(object_name, ''), '/', 1);
  if first_part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return first_part::uuid;
  end if;
  return null;
end;
$$;

create or replace function public.accept_own_student_invitation()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.student_invitations
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now()),
      updated_at = now()
  where auth_user_id = (select auth.uid())
    and status = 'pending';
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. DATA PROTECTION TRIGGERS
-- -----------------------------------------------------------------------------

create or replace function public.protect_student_lifecycle_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and old.profile_id = (select auth.uid())
     and not public.is_admin() then
    if new.student_number is distinct from old.student_number
       or new.profile_id is distinct from old.profile_id
       or new.status is distinct from old.status
       or new.tracking_type is distinct from old.tracking_type
       or new.start_date is distinct from old.start_date
       or new.created_by is distinct from old.created_by
       or new.archived_at is distinct from old.archived_at
       or new.deleted_at is distinct from old.deleted_at
       or new.notes is distinct from old.notes then
      raise exception 'O aluno não pode alterar campos administrativos do acompanhamento';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.ensure_primary_trainer_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trainer_whatsapp text;
begin
  if new.ended_at is null and new.is_primary then
    select tp.whatsapp_phone
      into trainer_whatsapp
    from public.trainer_profiles tp
    where tp.id = new.trainer_id;

    if nullif(btrim(coalesce(trainer_whatsapp, '')), '') is null then
      raise exception 'O professor principal tem de ter um número de WhatsApp registado';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists student_profiles_protect_lifecycle on public.student_profiles;
create trigger student_profiles_protect_lifecycle
before update on public.student_profiles
for each row execute function public.protect_student_lifecycle_fields();

drop trigger if exists trainer_students_require_whatsapp on public.trainer_students;
create trigger trainer_students_require_whatsapp
before insert or update on public.trainer_students
for each row execute function public.ensure_primary_trainer_whatsapp();

drop trigger if exists student_invitations_set_updated_at on public.student_invitations;
create trigger student_invitations_set_updated_at
before update on public.student_invitations
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. RLS FOR STUDENTS, INVITATIONS AND HISTORY
-- -----------------------------------------------------------------------------

alter table public.student_invitations enable row level security;
alter table public.student_activity_log enable row level security;

-- Student-profile changes are routed through the protected manage-student
-- Edge Function. Removing direct browser writes prevents a user from bypassing
-- field-level rules with a crafted API request.
drop policy if exists student_profiles_update_self on public.student_profiles;
drop policy if exists student_profiles_update_trainer on public.student_profiles;
drop policy if exists student_profiles_update_admin on public.student_profiles;
drop policy if exists student_profiles_insert_admin on public.student_profiles;
drop policy if exists student_profiles_delete_admin on public.student_profiles;

-- Keep the existing admin/assigned-trainer select policy but exclude safely
-- removed records from ordinary trainers and students.
drop policy if exists student_profiles_select_accessible on public.student_profiles;
create policy student_profiles_select_accessible
on public.student_profiles
for select
to authenticated
using (
  (select public.is_admin())
  or (
    deleted_at is null
    and (
      profile_id = (select auth.uid())
      or (select public.trainer_has_student(id))
    )
  )
);

drop policy if exists student_invitations_select_accessible on public.student_invitations;
create policy student_invitations_select_accessible
on public.student_invitations
for select
to authenticated
using (
  (select public.is_admin())
  or invited_by = (select auth.uid())
  or auth_user_id = (select auth.uid())
  or (student_id is not null and (select public.trainer_has_student(student_id)))
);

drop policy if exists student_activity_log_select_accessible on public.student_activity_log;
create policy student_activity_log_select_accessible
on public.student_activity_log
for select
to authenticated
using ((select public.can_view_student(student_id)));

-- All writes to invitations and activity history are made by protected server
-- functions using the secret key.
revoke all on table public.student_invitations from anon, authenticated;
revoke all on table public.student_activity_log from anon, authenticated;
grant select on table public.student_invitations to authenticated;
grant select on table public.student_activity_log to authenticated;

-- -----------------------------------------------------------------------------
-- 7. PRIVATE AVATAR BUCKET AND STORAGE RLS
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-avatars',
  'student-avatars',
  false,
  524288,
  array['image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists student_avatars_select_accessible on storage.objects;
create policy student_avatars_select_accessible
on storage.objects
for select
to authenticated
using (
  bucket_id = 'student-avatars'
  and public.can_view_student(public.student_id_from_storage_path(name))
);

drop policy if exists student_avatars_insert_accessible on storage.objects;
create policy student_avatars_insert_accessible
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'student-avatars'
  and public.can_edit_student_avatar(public.student_id_from_storage_path(name))
);

drop policy if exists student_avatars_update_accessible on storage.objects;
create policy student_avatars_update_accessible
on storage.objects
for update
to authenticated
using (
  bucket_id = 'student-avatars'
  and public.can_edit_student_avatar(public.student_id_from_storage_path(name))
)
with check (
  bucket_id = 'student-avatars'
  and public.can_edit_student_avatar(public.student_id_from_storage_path(name))
);

drop policy if exists student_avatars_delete_accessible on storage.objects;
create policy student_avatars_delete_accessible
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'student-avatars'
  and public.can_edit_student_avatar(public.student_id_from_storage_path(name))
);

-- -----------------------------------------------------------------------------
-- 8. PRIVILEGES
-- -----------------------------------------------------------------------------

grant execute on function public.can_view_student(uuid) to authenticated;
grant execute on function public.can_manage_student(uuid) to authenticated;
grant execute on function public.can_create_student() to authenticated;
grant execute on function public.can_edit_student_avatar(uuid) to authenticated;
grant execute on function public.student_id_from_storage_path(text) to authenticated;
grant execute on function public.accept_own_student_invitation() to authenticated;

revoke insert, update, delete on table public.student_profiles from authenticated;
grant select on table public.student_profiles to authenticated;

revoke execute on function public.protect_student_lifecycle_fields() from public, anon, authenticated;
revoke execute on function public.ensure_primary_trainer_whatsapp() from public, anon, authenticated;

commit;
