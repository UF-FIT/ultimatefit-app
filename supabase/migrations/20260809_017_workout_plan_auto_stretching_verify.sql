-- Verificação Migration 017
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public'
  and table_name='workout_plans'
  and column_name='auto_stretching_enabled';

select
  count(*) as planos_totais,
  count(*) filter (where auto_stretching_enabled = true) as automaticos_ligados,
  count(*) filter (where auto_stretching_enabled = false) as automaticos_desligados
from public.workout_plans;

select
  case
    when pg_get_functiondef('public.save_workout_plan(jsonb)'::regprocedure) ilike '%auto_stretching_enabled%'
      then 'OK - save_workout_plan guarda a definição'
    else 'ERRO - função sem suporte'
  end as verificacao_funcao;
