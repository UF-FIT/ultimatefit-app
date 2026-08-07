-- ULTIMATE FIT APP — Verify Migration 008 / Update 5B.1

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('parq_versions','student_parq_submissions')
order by table_name;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'active_parq_version_id',
    'student_has_current_parq',
    'current_student_has_required_parq',
    'submit_own_parq',
    'parq_status_for_student',
    'require_parq_before_first_assessment_publish'
  )
order by routine_name;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('parq_versions','student_parq_submissions')
order by tablename, policyname;

select version_code, title, is_active, jsonb_array_length(questions) as question_count
from public.parq_versions
where is_active = true;

select feature_key, is_enabled, allowed_roles
from public.feature_flags
where feature_key = 'parq';
