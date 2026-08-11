-- ULTIMATE FIT APP
-- Migration 026: Performance Advisor — RLS optimizations
-- Data: 2026-08-11
--
-- Corrige os 5 WARNINGS atuais do Supabase Performance Advisor:
--   * 3x Auth RLS Initialization Plan
--   * 2x Multiple Permissive Policies
--
-- Esta migration preserva a lógica funcional das permissões.

begin;

-- ---------------------------------------------------------------------------
-- 1. NUTRITION DOCUMENTS
-- Cache auth.uid()/current_student_id() once per statement where possible.
-- ---------------------------------------------------------------------------

drop policy if exists nutrition_documents_insert_accessible
  on public.nutrition_documents;
create policy nutrition_documents_insert_accessible
on public.nutrition_documents
for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and (
    student_id = (select public.current_student_id())
    or public.can_manage_nutrition_student(student_id)
  )
);

drop policy if exists nutrition_documents_update_accessible
  on public.nutrition_documents;
create policy nutrition_documents_update_accessible
on public.nutrition_documents
for update
to authenticated
using (
  uploaded_by = (select auth.uid())
  or public.can_manage_nutrition_student(student_id)
)
with check (
  uploaded_by = (select auth.uid())
  or public.can_manage_nutrition_student(student_id)
);

-- ---------------------------------------------------------------------------
-- 2. PHYSICAL ASSESSMENTS
-- Cache auth.uid() once per statement.
-- ---------------------------------------------------------------------------

drop policy if exists physical_assessments_insert
  on public.physical_assessments;
create policy physical_assessments_insert
on public.physical_assessments
for insert
to authenticated
with check (
  public.can_manage_assessment_student(student_id)
  and assessor_profile_id = (select auth.uid())
);

-- ---------------------------------------------------------------------------
-- 3. PROFILES
-- Combine the two permissive UPDATE policies into one OR-equivalent policy.
-- Existing trigger protections remain unchanged.
-- ---------------------------------------------------------------------------

drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists profiles_update_self_or_admin on public.profiles;

create policy profiles_update_self_or_admin
on public.profiles
for update
to authenticated
using (
  (select public.is_admin())
  or (
    id = (select auth.uid())
    and is_active = true
  )
)
with check (
  (select public.is_admin())
  or (
    id = (select auth.uid())
    and role = (select public.current_app_role())
    and is_active = (select public.current_profile_is_active())
  )
);

-- ---------------------------------------------------------------------------
-- 4. TRAINER PROFILES
-- Combine the two permissive UPDATE policies into one OR-equivalent policy.
-- ---------------------------------------------------------------------------

drop policy if exists trainer_profiles_update_self on public.trainer_profiles;
drop policy if exists trainer_profiles_update_admin on public.trainer_profiles;
drop policy if exists trainer_profiles_update_self_or_admin on public.trainer_profiles;

create policy trainer_profiles_update_self_or_admin
on public.trainer_profiles
for update
to authenticated
using (
  (select public.is_admin())
  or id = (select public.current_trainer_id())
)
with check (
  (select public.is_admin())
  or (
    id = (select public.current_trainer_id())
    and profile_id = (select auth.uid())
  )
);

commit;
