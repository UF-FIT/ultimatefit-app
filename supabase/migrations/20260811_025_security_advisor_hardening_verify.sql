-- ULTIMATE FIT APP — verificar Migration 025
-- Security Advisor hardening
--
-- Esta query é APENAS de leitura. Não altera dados nem permissões.
-- Esperado no resultado final:
--   anon_security_definer_exposures = 0
--   trigger_only_authenticated_exposures = 0
--   storage_parsers_still_security_definer = 0
--   storage_parsers_missing_authenticated_execute = 0
--   community_media_is_public = true
--   community_media_read_policy_count = 0
--   community_media_admin_policy_count = 3
--   critical_rpcs_missing_authenticated_execute = 0

with
anon_sd as (
  select count(*)::int as n
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef = true
    and has_function_privilege('anon', p.oid, 'EXECUTE')
),
trigger_only as (
  select count(*)::int as n
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef = true
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
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
),
storage_parsers as (
  select
    count(*) filter (where p.prosecdef = true)::int as still_security_definer,
    count(*) filter (
      where not has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )::int as missing_authenticated_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'assessment_id_from_storage_path',
      'profile_id_from_storage_path',
      'student_id_from_storage_path'
    )
),
community_bucket as (
  select coalesce(bool_or(public), false) as is_public
  from storage.buckets
  where id = 'community-media'
),
community_policies as (
  select
    count(*) filter (where policyname = 'community_media_read')::int as read_policy_count,
    count(*) filter (
      where policyname in (
        'community_media_insert_admin',
        'community_media_update_admin',
        'community_media_delete_admin'
      )
    )::int as admin_policy_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
),
critical_rpc_signatures(signature) as (
  values
    ('public.save_workout_plan(jsonb)'),
    ('public.publish_physical_assessment(uuid)'),
    ('public.submit_own_parq(uuid,jsonb,text)'),
    ('public.register_for_activity(uuid)'),
    ('public.cancel_activity_registration(uuid)'),
    ('public.delete_physical_assessment_permanently(uuid)'),
    ('public.delete_workout_plan_permanently(uuid)'),
    ('public.restore_workout_plan(uuid)'),
    ('public.trainer_has_permission(text)')
),
critical_rpcs as (
  select count(*)::int as missing_execute
  from critical_rpc_signatures s
  where to_regprocedure(s.signature) is null
     or not has_function_privilege(
       'authenticated',
       to_regprocedure(s.signature),
       'EXECUTE'
     )
)
select
  anon_sd.n as anon_security_definer_exposures,
  trigger_only.n as trigger_only_authenticated_exposures,
  storage_parsers.still_security_definer as storage_parsers_still_security_definer,
  storage_parsers.missing_authenticated_execute as storage_parsers_missing_authenticated_execute,
  community_bucket.is_public as community_media_is_public,
  community_policies.read_policy_count as community_media_read_policy_count,
  community_policies.admin_policy_count as community_media_admin_policy_count,
  critical_rpcs.missing_execute as critical_rpcs_missing_authenticated_execute
from anon_sd
cross join trigger_only
cross join storage_parsers
cross join community_bucket
cross join community_policies
cross join critical_rpcs;
