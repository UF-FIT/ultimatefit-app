-- Verificação Migration 015
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'delete_physical_assessment_permanently',
    'delete_workout_plan_permanently'
  )
order by routine_name;

select count(*) as avaliacoes_atuais
from public.physical_assessments
where deleted_at is null;

select count(*) as planos_atuais
from public.workout_plans;
