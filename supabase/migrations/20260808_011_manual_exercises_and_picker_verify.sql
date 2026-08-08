-- Verificação Migration 011
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema='public' and table_name='workout_items'
  and column_name in ('exercise_id','custom_exercise_name')
order by column_name;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid='public.workout_items'::regclass
  and conname='workout_items_exercise_source_check';

select count(*) as itens_biblioteca
from public.workout_items
where exercise_id is not null;

select count(*) as itens_texto_livre
from public.workout_items
where exercise_id is null and custom_exercise_name is not null;
