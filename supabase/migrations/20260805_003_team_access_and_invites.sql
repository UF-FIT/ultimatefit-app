-- ULTIMATE FIT APP
-- Migration 003 (revised): owner/admin/trainer hierarchy, trainer permissions,
-- invitations, safe deactivation and safe removal.
--
-- IMPORTANT: this replaces the earlier draft named
-- 20260804_003_trainer_permissions.sql. Do not run the earlier draft.

-- The enum change must be committed before the new value is used.
alter type public.app_role add value if not exists 'owner' before 'admin';
commit;

begin;

-- -----------------------------------------------------------------------------
-- 1. PROFILE LIFECYCLE
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create unique index if not exists profiles_single_owner_uidx
  on public.profiles ((role))
  where role = 'owner'::public.app_role and deleted_at is null;

create index if not exists profiles_team_active_idx
  on public.profiles (role, is_active)
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- 2. PERMISSIONS AND INVITATIONS
-- -----------------------------------------------------------------------------

create table if not exists public.trainer_permissions (
  trainer_id uuid not null
    references public.trainer_profiles(id) on delete cascade,
  permission_key text not null,
  is_granted boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (trainer_id, permission_key),
  constraint trainer_permissions_key_valid check (
    permission_key in (
      'edit_student_profiles',
      'manage_assessments',
      'manage_workout_plans',
      'manage_nutrition',
      'manage_goals',
      'manage_progress_photos',
      'generate_reports',
      'send_announcements',
      'manage_challenges',
      'manage_exercise_library'
    )
  )
);

create index if not exists trainer_permissions_granted_idx
  on public.trainer_permissions (trainer_id, permission_key)
  where is_granted = true;

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  requested_role public.app_role not null,
  status text not null default 'pending',
  invited_by uuid references public.profiles(id) on delete set null,
  auth_user_id uuid references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_invitations_role_valid check (
    requested_role in ('admin'::public.app_role, 'trainer'::public.app_role)
  ),
  constraint team_invitations_status_valid check (
    status in ('pending', 'accepted', 'revoked', 'failed')
  ),
  constraint team_invitations_email_not_blank check (length(btrim(email)) > 3),
  constraint team_invitations_name_not_blank check (length(btrim(full_name)) > 1)
);

create unique index if not exists team_invitations_pending_email_uidx
  on public.team_invitations (lower(email))
  where status = 'pending';

create index if not exists team_invitations_auth_user_idx
  on public.team_invitations (auth_user_id, invited_at desc);

create table if not exists public.archived_team_members (
  id uuid primary key default gen_random_uuid(),
  original_profile_id uuid not null,
  full_name text not null,
  email text not null,
  previous_role public.app_role not null,
  archived_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists archived_team_members_profile_idx
  on public.archived_team_members (original_profile_id, archived_at desc);

-- -----------------------------------------------------------------------------
-- 3. AUTHORIZATION HELPERS
-- -----------------------------------------------------------------------------

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.role = 'owner'::public.app_role
      and p.is_active
      and p.deleted_at is null
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
    select p.role in ('owner'::public.app_role, 'admin'::public.app_role)
      and p.is_active
      and p.deleted_at is null
    from public.profiles p
    where p.id = (select auth.uid())
    limit 1
  ), false);
$$;

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
    and p.deleted_at is null
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
    select p.is_active and p.deleted_at is null
    from public.profiles p
    where p.id = (select auth.uid())
    limit 1
  ), false);
$$;

-- Owners and administrators can also work as personal trainers.
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
    and p.role in (
      'owner'::public.app_role,
      'admin'::public.app_role,
      'trainer'::public.app_role
    )
    and p.is_active = true
    and p.deleted_at is null
  limit 1;
$$;

create or replace function public.can_manage_team_member(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when actor.role = 'owner'::public.app_role then
        target.role <> 'owner'::public.app_role
        and target.id <> actor.id
        and target.deleted_at is null
      when actor.role = 'admin'::public.app_role then
        target.role = 'trainer'::public.app_role
        and target.id <> actor.id
        and target.deleted_at is null
      else false
    end
    from public.profiles actor
    join public.profiles target on target.id = target_profile_id
    where actor.id = (select auth.uid())
      and actor.is_active = true
      and actor.deleted_at is null
    limit 1
  ), false);
$$;

create or replace function public.trainer_has_permission(target_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_admin() then true
    else coalesce(exists (
      select 1
      from public.trainer_permissions tp
      where tp.trainer_id = public.current_trainer_id()
        and tp.permission_key = target_permission
        and tp.is_granted = true
    ), false)
  end;
$$;

-- -----------------------------------------------------------------------------
-- 4. AUTH/PROFILE SYNCHRONIZATION
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
    when 'owner' then 'owner'::public.app_role
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
    id, email, full_name, phone, role, is_active, deleted_at
  )
  values (
    new.id,
    coalesce(new.email, new.id::text || '@pending.local'),
    v_full_name,
    new.phone,
    v_role,
    true,
    null
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

create or replace function public.sync_role_specific_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role in (
    'owner'::public.app_role,
    'admin'::public.app_role,
    'trainer'::public.app_role
  ) then
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
-- 5. OWNER PROTECTION
-- The owner can update their name/phone/avatar, but no client, admin function or
-- cascading deletion can demote, deactivate, mark deleted or remove the owner.
-- -----------------------------------------------------------------------------

create or replace function public.protect_owner_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.role = 'owner'::public.app_role then
    raise exception 'The owner account is protected and cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'owner'::public.app_role and (
      new.role is distinct from old.role
      or new.is_active is distinct from old.is_active
      or new.deleted_at is distinct from old.deleted_at
    ) then
      raise exception 'The owner role and access state are protected';
    end if;

    if old.role <> 'owner'::public.app_role
       and new.role = 'owner'::public.app_role then
      raise exception 'A new owner cannot be created through the application';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

-- Also stop an administrator from editing the owner's personal profile.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at then
      raise exception 'Protected profile fields cannot be changed through the client';
    end if;

    if old.role = 'owner'::public.app_role
       and (select auth.uid()) <> old.id then
      raise exception 'The owner profile cannot be changed by another administrator';
    end if;

    -- Role, activation and safe-removal changes must always pass through the
    -- protected Edge Function. Its service client has no auth.uid(), while a
    -- browser request does, so direct client manipulation is rejected here.
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'Account access must be changed through the protected team service';
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. PERMISSION SEEDING AND INVITATION ACCEPTANCE
-- -----------------------------------------------------------------------------

create or replace function public.seed_trainer_permissions(target_trainer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trainer_permissions (
    trainer_id, permission_key, is_granted
  )
  values
    (target_trainer_id, 'edit_student_profiles', true),
    (target_trainer_id, 'manage_assessments', true),
    (target_trainer_id, 'manage_workout_plans', true),
    (target_trainer_id, 'manage_nutrition', true),
    (target_trainer_id, 'manage_goals', true),
    (target_trainer_id, 'manage_progress_photos', true),
    (target_trainer_id, 'generate_reports', true),
    (target_trainer_id, 'send_announcements', true),
    (target_trainer_id, 'manage_challenges', false),
    (target_trainer_id, 'manage_exercise_library', false)
  on conflict (trainer_id, permission_key) do nothing;
end;
$$;

create or replace function public.handle_new_trainer_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_trainer_permissions(new.id);
  return new;
end;
$$;

create or replace function public.accept_own_team_invitation()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.team_invitations
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now()),
      updated_at = now()
  where auth_user_id = (select auth.uid())
    and status = 'pending';
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. TRIGGERS
-- -----------------------------------------------------------------------------

drop trigger if exists trainer_profiles_seed_permissions on public.trainer_profiles;
create trigger trainer_profiles_seed_permissions
after insert on public.trainer_profiles
for each row execute function public.handle_new_trainer_permissions();

drop trigger if exists trainer_permissions_set_updated_at on public.trainer_permissions;
create trigger trainer_permissions_set_updated_at
before update on public.trainer_permissions
for each row execute function public.set_updated_at();

drop trigger if exists team_invitations_set_updated_at on public.team_invitations;
create trigger team_invitations_set_updated_at
before update on public.team_invitations
for each row execute function public.set_updated_at();

drop trigger if exists trainer_permissions_audit on public.trainer_permissions;
create trigger trainer_permissions_audit
after insert or update or delete on public.trainer_permissions
for each row execute function public.audit_row_change();

drop trigger if exists team_invitations_audit on public.team_invitations;
create trigger team_invitations_audit
after insert or update or delete on public.team_invitations
for each row execute function public.audit_row_change();

-- Seed any professional profiles already present.
do $$
declare
  trainer_row record;
begin
  for trainer_row in select id from public.trainer_profiles loop
    perform public.seed_trainer_permissions(trainer_row.id);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------

alter table public.trainer_permissions enable row level security;
alter table public.team_invitations enable row level security;
alter table public.archived_team_members enable row level security;

drop policy if exists trainer_permissions_select_admin_or_self on public.trainer_permissions;
create policy trainer_permissions_select_admin_or_self
on public.trainer_permissions
for select
to authenticated
using (
  (select public.is_admin())
  or trainer_id = (select public.current_trainer_id())
);

drop policy if exists trainer_permissions_insert_admin on public.trainer_permissions;
create policy trainer_permissions_insert_admin
on public.trainer_permissions
for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists trainer_permissions_update_admin on public.trainer_permissions;
create policy trainer_permissions_update_admin
on public.trainer_permissions
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists trainer_permissions_delete_admin on public.trainer_permissions;
create policy trainer_permissions_delete_admin
on public.trainer_permissions
for delete
to authenticated
using ((select public.is_admin()));

drop policy if exists team_invitations_select_admin on public.team_invitations;
create policy team_invitations_select_admin
on public.team_invitations
for select
to authenticated
using ((select public.is_admin()));

drop policy if exists team_invitations_insert_admin on public.team_invitations;
create policy team_invitations_insert_admin
on public.team_invitations
for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists team_invitations_update_admin on public.team_invitations;
create policy team_invitations_update_admin
on public.team_invitations
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists archived_team_members_select_admin on public.archived_team_members;
create policy archived_team_members_select_admin
on public.archived_team_members
for select
to authenticated
using ((select public.is_admin()));

-- Tighten existing profile policies to match the Owner/Admin hierarchy.
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
on public.profiles
for update
to authenticated
using (
  (select public.is_owner())
  or (
    (select public.current_app_role()) = 'admin'::public.app_role
    and role = 'trainer'::public.app_role
  )
)
with check (
  (select public.is_owner())
  or (
    (select public.current_app_role()) = 'admin'::public.app_role
    and role = 'trainer'::public.app_role
  )
);

-- An administrator may manage ordinary professional profiles; only the Owner
-- may manage an Administrator's professional profile. Nobody manages Owner here.
drop policy if exists trainer_profiles_insert_admin on public.trainer_profiles;
create policy trainer_profiles_insert_admin
on public.trainer_profiles
for insert
to authenticated
with check (
  (select public.is_owner())
  or (
    (select public.current_app_role()) = 'admin'::public.app_role
    and exists (
      select 1 from public.profiles p
      where p.id = profile_id
        and p.role = 'trainer'::public.app_role
        and p.deleted_at is null
    )
  )
);

drop policy if exists trainer_profiles_update_admin on public.trainer_profiles;
create policy trainer_profiles_update_admin
on public.trainer_profiles
for update
to authenticated
using ((select public.can_manage_team_member(profile_id)))
with check ((select public.can_manage_team_member(profile_id)));

drop policy if exists trainer_profiles_delete_admin on public.trainer_profiles;
create policy trainer_profiles_delete_admin
on public.trainer_profiles
for delete
to authenticated
using ((select public.can_manage_team_member(profile_id)));

-- A normal professor may edit assigned student profiles only with permission.
drop policy if exists student_profiles_update_trainer on public.student_profiles;
create policy student_profiles_update_trainer
on public.student_profiles
for update
to authenticated
using (
  (select public.trainer_has_student(id))
  and (select public.trainer_has_permission('edit_student_profiles'))
)
with check (
  (select public.trainer_has_student(id))
  and (select public.trainer_has_permission('edit_student_profiles'))
);

-- -----------------------------------------------------------------------------
-- 9. DATABASE PRIVILEGES
-- -----------------------------------------------------------------------------

revoke all on table public.trainer_permissions from anon, authenticated;
revoke all on table public.team_invitations from anon, authenticated;
revoke all on table public.archived_team_members from anon, authenticated;

-- The browser may read these tables. All administrative writes are routed
-- through the protected Edge Function (or the security-definer acceptance RPC).
grant select on table public.trainer_permissions to authenticated;
grant select on table public.team_invitations to authenticated;
grant select on table public.archived_team_members to authenticated;

grant execute on function public.is_owner() to authenticated;
grant execute on function public.can_manage_team_member(uuid) to authenticated;
grant execute on function public.trainer_has_permission(text) to authenticated;
grant execute on function public.accept_own_team_invitation() to authenticated;

revoke execute on function public.seed_trainer_permissions(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_trainer_permissions() from public, anon, authenticated;
revoke execute on function public.protect_owner_lifecycle() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 10. ESTABLISH RUI AS THE PROTECTED OWNER
-- -----------------------------------------------------------------------------

update public.profiles
set role = 'owner'::public.app_role,
    is_active = true,
    deleted_at = null,
    full_name = case
      when nullif(btrim(full_name), '') is null or lower(btrim(full_name)) = 'geral'
      then 'Rui Marques'
      else full_name
    end
where lower(email) = lower('geral@ultimatefit.pt');

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('app_role', 'owner')
where lower(email) = lower('geral@ultimatefit.pt');

delete from public.student_profiles
where profile_id in (
  select id from public.profiles
  where lower(email) = lower('geral@ultimatefit.pt')
);

insert into public.trainer_profiles (profile_id, professional_title)
select p.id, 'Proprietário · Personal Trainer'
from public.profiles p
where lower(p.email) = lower('geral@ultimatefit.pt')
on conflict (profile_id) do update
set professional_title = coalesce(
  public.trainer_profiles.professional_title,
  excluded.professional_title
);

-- Install the owner lifecycle trigger only after the first owner is established.
drop trigger if exists profiles_protect_owner_lifecycle on public.profiles;
create trigger profiles_protect_owner_lifecycle
before update or delete on public.profiles
for each row execute function public.protect_owner_lifecycle();

commit;
