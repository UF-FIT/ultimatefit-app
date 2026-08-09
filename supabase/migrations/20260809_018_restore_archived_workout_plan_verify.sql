-- Verificação Migration 018 — não altera dados.

select
  p.proname as funcao,
  pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'restore_workout_plan';

select
  status,
  count(*) as total
from public.workout_plans
group by status
order by status;

select
  count(*) filter (where status = 'archived') as planos_arquivados,
  count(*) filter (where status = 'archived' and published_at is not null) as arquivados_que_foram_publicados
from public.workout_plans;
