-- ULTIMATE FIT APP — verificar Migration 025
-- Security Advisor hardening

-- 1) Nenhuma SECURITY DEFINER do schema public deve ser executável por anon/PUBLIC.
select
  p.oid::regprocedure as function_signature,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') as public_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
  and (
    has_function_privilege('anon', p.oid, 'EXECUTE')
    or has_function_privilege('public', p.oid, 'EXECUTE')
  )
order by p.oid::regprocedure::text;

-- Esperado: 0 rows.

-- 2) Trigger-only SECURITY DEFINER functions must not be directly executable
-- by authenticated users.
select
  p.oid::regprocedure as function_signature,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'app_runtime_settings_prepare',
    'exercise_library_set_dedupe_key',
    'prepare_challenge_slug',
    'prepare_nutrition_document',
    'propagate_muscle_group_name',
    'sync_exercise_muscle_group',
    'validate_challenge_record_date',
    'validate_workout_completion_row',
    'workout_block_types_prepare'
  )
order by function_signature::text;

-- Esperado: authenticated_can_execute = false em todas.

-- 3) Storage path parsers should now be SECURITY INVOKER.
select
  p.oid::regprocedure as function_signature,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'assessment_id_from_storage_path',
    'profile_id_from_storage_path',
    'student_id_from_storage_path'
  )
order by function_signature::text;

-- Esperado: security_definer=false e authenticated_can_execute=true.

-- 4) community-media must remain a public bucket, but without broad SELECT RLS
-- policy that permits object listing through the Storage API.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'community-media';

select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'community_media_%'
order by policyname;

-- Esperado: bucket public=true; policies insert/update/delete admin presentes;
-- community_media_read ausente.

-- 5) Critical authenticated RPCs must remain executable.
select
  p.oid::regprocedure as function_signature,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'save_workout_plan',
    'publish_physical_assessment',
    'submit_own_parq',
    'register_for_activity',
    'cancel_activity_registration',
    'delete_physical_assessment_permanently',
    'delete_workout_plan_permanently',
    'restore_workout_plan',
    'trainer_has_permission'
  )
order by function_signature::text;

-- Esperado: authenticated_can_execute=true em todas.
