-- ULTIMATE FIT APP
-- Verify Migration 003 (revised)

-- A) Rui must be the single protected Owner and also have a PT profile.
select
  p.email,
  p.full_name,
  p.role,
  p.is_active,
  p.deleted_at,
  exists (
    select 1 from public.trainer_profiles tp where tp.profile_id = p.id
  ) as has_trainer_profile,
  exists (
    select 1 from public.student_profiles sp where sp.profile_id = p.id
  ) as has_student_profile
from public.profiles p
where lower(p.email) = lower('geral@ultimatefit.pt');

select count(*) as active_owner_count
from public.profiles
where role = 'owner'::public.app_role
  and deleted_at is null;

-- B) New tables must have RLS enabled.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'trainer_permissions',
    'team_invitations',
    'archived_team_members'
  )
order by c.relname;

-- C) Policies installed.
select policyname, tablename, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'trainer_permissions',
    'team_invitations',
    'archived_team_members'
  )
order by tablename, policyname;

-- D) Security/helper functions installed.
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'is_owner',
    'is_admin',
    'can_manage_team_member',
    'trainer_has_permission',
    'accept_own_team_invitation'
  )
order by routine_name;
