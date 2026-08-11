-- ULTIMATE FIT APP — verificar Migration 026
-- Performance Advisor — RLS optimizations
-- Apenas leitura. Não altera dados nem permissões.
--
-- Esperado:
--   nutrition_insert_uses_initplan = true
--   nutrition_update_uses_initplan = true
--   assessment_insert_uses_initplan = true
--   profiles_update_policy_count = 1
--   trainer_profiles_update_policy_count = 1

with policies as (
  select schemaname, tablename, policyname, cmd, qual, with_check
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'nutrition_documents',
      'physical_assessments',
      'profiles',
      'trainer_profiles'
    )
),
checks as (
  select
    exists (
      select 1 from policies
      where tablename = 'nutrition_documents'
        and policyname = 'nutrition_documents_insert_accessible'
        and cmd = 'INSERT'
        and with_check ilike '%(SELECT auth.uid()%'
    ) as nutrition_insert_uses_initplan,
    exists (
      select 1 from policies
      where tablename = 'nutrition_documents'
        and policyname = 'nutrition_documents_update_accessible'
        and cmd = 'UPDATE'
        and qual ilike '%(SELECT auth.uid()%'
        and with_check ilike '%(SELECT auth.uid()%'
    ) as nutrition_update_uses_initplan,
    exists (
      select 1 from policies
      where tablename = 'physical_assessments'
        and policyname = 'physical_assessments_insert'
        and cmd = 'INSERT'
        and with_check ilike '%(SELECT auth.uid()%'
    ) as assessment_insert_uses_initplan,
    (
      select count(*)::int from policies
      where tablename = 'profiles' and cmd = 'UPDATE'
    ) as profiles_update_policy_count,
    (
      select count(*)::int from policies
      where tablename = 'trainer_profiles' and cmd = 'UPDATE'
    ) as trainer_profiles_update_policy_count
)
select * from checks;
