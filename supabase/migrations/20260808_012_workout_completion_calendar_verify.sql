-- Verificação Migration 012
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='workout_completions'
order by ordinal_position;

select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name in ('can_record_workout_completion','record_workout_completion','validate_workout_completion_row')
order by routine_name;

select trigger_name, event_manipulation
from information_schema.triggers
where event_object_schema='public' and event_object_table='workout_completions'
order by trigger_name, event_manipulation;

select policyname, cmd
from pg_policies
where schemaname='public' and tablename='workout_completions'
order by policyname;

select count(*) as treinos_registados
from public.workout_completions;
