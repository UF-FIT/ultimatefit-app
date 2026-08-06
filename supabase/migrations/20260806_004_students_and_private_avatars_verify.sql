-- ULTIMATE FIT APP
-- Verification for Migration 004

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('student_profiles', 'trainer_profiles', 'profiles')
  and column_name in (
    'student_number', 'citizen_card', 'postal_code', 'city', 'tracking_type',
    'main_goal', 'archived_at', 'deleted_at', 'whatsapp_phone', 'avatar_thumb_path'
  )
order by table_name, ordinal_position;

select
  id,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'student-avatars';

select
  schemaname,
  tablename,
  policyname,
  cmd
from pg_policies
where (schemaname = 'public' and tablename in ('student_profiles', 'student_invitations', 'student_activity_log'))
   or (schemaname = 'storage' and tablename = 'objects' and policyname like 'student_avatars_%')
order by schemaname, tablename, policyname;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'can_view_student',
    'can_manage_student',
    'can_create_student',
    'can_edit_student_avatar',
    'student_id_from_storage_path',
    'accept_own_student_invitation'
  )
order by routine_name;

select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'student_profiles'
  and grantee = 'authenticated'
order by privilege_type;

select
  p.email,
  p.full_name,
  p.role,
  tp.whatsapp_phone
from public.profiles p
left join public.trainer_profiles tp on tp.profile_id = p.id
where p.role in ('owner'::public.app_role, 'admin'::public.app_role, 'trainer'::public.app_role)
  and p.deleted_at is null
order by p.role, p.full_name;
