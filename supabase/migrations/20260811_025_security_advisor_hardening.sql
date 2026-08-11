-- ULTIMATE FIT APP
-- Migration 025: Security Advisor hardening
-- Data: 2026-08-11
--
-- Objetivos:
-- 1) remover EXECUTE anonimo/Public de funcoes SECURITY DEFINER;
-- 2) preservar explicitamente as funcoes de que utilizadores autenticados dependem;
-- 3) retirar acesso direto a funcoes usadas apenas por triggers;
-- 4) converter parsers puros de Storage para SECURITY INVOKER;
-- 5) impedir listagem ampla do bucket publico community-media;
-- 6) tornar futuras funcoes opt-in para a Data API.
--
-- Esta migration NAO altera as regras funcionais/RLS da aplicacao.

begin;

-- ---------------------------------------------------------------------------
-- 1. FUTURE DEFAULTS: new functions in public must be granted explicitly.
-- ---------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke execute on functions from PUBLIC;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon;

alter default privileges for role postgres in schema public
  revoke execute on functions from authenticated;

-- ---------------------------------------------------------------------------
-- 2. PRESERVE THE CURRENT AUTHENTICATED API SURFACE EXPLICITLY.
-- These functions are used by RLS/Storage policies or by authenticated RPCs.
-- ---------------------------------------------------------------------------

grant execute on function public.accept_own_student_invitation() to authenticated;
grant execute on function public.accept_own_team_invitation() to authenticated;
grant execute on function public.archive_workout_plan(uuid) to authenticated;
grant execute on function public.assessment_id_from_storage_path(text) to authenticated;
grant execute on function public.can_create_student() to authenticated;
grant execute on function public.can_edit_own_professional_avatar(uuid) to authenticated;
grant execute on function public.can_edit_student_avatar(uuid) to authenticated;
grant execute on function public.can_manage_assessment_student(uuid) to authenticated;
grant execute on function public.can_manage_challenge_student(uuid) to authenticated;
grant execute on function public.can_manage_challenges_global() to authenticated;
grant execute on function public.can_manage_nutrition_student(uuid) to authenticated;
grant execute on function public.can_manage_physical_assessment(uuid) to authenticated;
grant execute on function public.can_manage_student(uuid) to authenticated;
grant execute on function public.can_manage_team_member(uuid) to authenticated;
grant execute on function public.can_manage_workout_plan(uuid) to authenticated;
grant execute on function public.can_manage_workout_student(uuid) to authenticated;
grant execute on function public.can_record_workout_completion(uuid, text) to authenticated;
grant execute on function public.can_view_physical_assessment(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.can_view_student(uuid) to authenticated;
grant execute on function public.can_view_workout_plan(uuid) to authenticated;
grant execute on function public.cancel_activity_registration(uuid) to authenticated;
grant execute on function public.challenge_leaderboard(uuid) to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_profile_is_active() to authenticated;
grant execute on function public.current_student_has_required_parq() to authenticated;
grant execute on function public.current_student_id() to authenticated;
grant execute on function public.current_trainer_id() to authenticated;
grant execute on function public.current_trainer_owns_student(uuid) to authenticated;
grant execute on function public.delete_physical_assessment_permanently(uuid) to authenticated;
grant execute on function public.delete_workout_plan_permanently(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.parq_status_for_student(uuid) to authenticated;
grant execute on function public.profile_id_from_storage_path(text) to authenticated;
grant execute on function public.publish_physical_assessment(uuid) to authenticated;
grant execute on function public.record_workout_completion(uuid, uuid, uuid, date, text, text) to authenticated;
grant execute on function public.register_for_activity(uuid) to authenticated;
grant execute on function public.restore_workout_plan(uuid) to authenticated;
grant execute on function public.save_workout_plan(jsonb) to authenticated;
grant execute on function public.student_has_trainer(uuid) to authenticated;
grant execute on function public.student_id_from_storage_path(text) to authenticated;
grant execute on function public.submit_own_parq(uuid, jsonb, text) to authenticated;
grant execute on function public.trainer_has_permission(text) to authenticated;
grant execute on function public.trainer_has_student(uuid) to authenticated;
grant execute on function public.workout_plan_id_from_block(uuid) to authenticated;
grant execute on function public.workout_plan_id_from_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. REMOVE ANONYMOUS/PUBLIC EXECUTE FROM EVERY CURRENT SECURITY DEFINER
-- FUNCTION IN public. Authenticated grants above remain intact.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
  loop
    execute format(
      'revoke execute on function %s from PUBLIC, anon',
      r.signature
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. TRIGGER-ONLY FUNCTIONS MUST NOT BE DIRECT RPCs.
-- Existing triggers keep working; direct authenticated calls are removed.
-- ---------------------------------------------------------------------------

revoke execute on function public.app_runtime_settings_prepare() from authenticated;
revoke execute on function public.exercise_library_set_dedupe_key() from authenticated;
revoke execute on function public.prepare_challenge_slug() from authenticated;
revoke execute on function public.prepare_nutrition_document() from authenticated;
revoke execute on function public.propagate_muscle_group_name() from authenticated;
revoke execute on function public.sync_exercise_muscle_group() from authenticated;
revoke execute on function public.validate_challenge_record_date() from authenticated;
revoke execute on function public.validate_workout_completion_row() from authenticated;
revoke execute on function public.workout_block_types_prepare() from authenticated;

-- ---------------------------------------------------------------------------
-- 5. PURE STORAGE PATH PARSERS DO NOT NEED OWNER PRIVILEGES.
-- They only split/validate text and do not read protected tables.
-- Keep authenticated EXECUTE because Storage RLS policies call them.
-- ---------------------------------------------------------------------------

alter function public.assessment_id_from_storage_path(text) security invoker;
alter function public.profile_id_from_storage_path(text) security invoker;
alter function public.student_id_from_storage_path(text) security invoker;

grant execute on function public.assessment_id_from_storage_path(text) to authenticated;
grant execute on function public.profile_id_from_storage_path(text) to authenticated;
grant execute on function public.student_id_from_storage_path(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. PUBLIC BUCKET DOES NOT NEED A BROAD SELECT POLICY FOR getPublicUrl().
-- Upload/update/delete policies for authenticated admins remain unchanged.
-- ---------------------------------------------------------------------------

drop policy if exists community_media_read on storage.objects;

commit;
