-- ULTIMATE FIT APP — verificar Migration 007

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'physical_assessments','assessment_anamnesis','assessment_perimetry',
    'assessment_skinfolds','assessment_bioimpedance','assessment_posture','assessment_photos'
  )
order by table_name;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'can_manage_assessment_student','can_view_physical_assessment',
    'can_manage_physical_assessment','publish_physical_assessment','assessment_id_from_storage_path'
  )
order by routine_name;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'physical_assessments','assessment_anamnesis','assessment_perimetry',
    'assessment_skinfolds','assessment_bioimpedance','assessment_posture','assessment_photos'
  )
order by tablename, policyname;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'assessment-photos';

select feature_key, is_enabled, allowed_roles
from public.feature_flags
where feature_key in ('physical_assessments','progress','progress_photos')
order by feature_key;
