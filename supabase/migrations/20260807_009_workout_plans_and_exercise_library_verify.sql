-- Verificação Migration 009

select table_name
from information_schema.tables
where table_schema='public'
  and table_name in ('exercise_library','workout_plans','workout_sessions','workout_blocks','workout_items')
order by table_name;

select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name in (
    'can_manage_workout_student','can_view_workout_plan','can_manage_workout_plan',
    'save_workout_plan','archive_workout_plan'
  )
order by routine_name;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id='exercise-media';

select feature_key, is_enabled, allowed_roles
from public.feature_flags
where feature_key in ('workout_plans','exercise_library')
order by feature_key;
