-- Verificação v5D.6.5.0 — ownership de planos de treino

-- 1) A função de gestão já não deve conter "when public.is_admin() then true".
select pg_get_functiondef('public.can_manage_workout_student(uuid)'::regprocedure) as can_manage_workout_student_definition;

-- 2) Deve existir a função que fixa a responsabilidade no professor primary.
select pg_get_functiondef('public.current_trainer_owns_student(uuid)'::regprocedure) as current_trainer_owns_student_definition;

-- 3) As policies de escrita do plano raiz devem usar can_manage_workout_*.
select
  polname,
  pg_get_expr(polqual, polrelid) as using_expression,
  pg_get_expr(polwithcheck, polrelid) as with_check_expression
from pg_policy
where polrelid = 'public.workout_plans'::regclass
  and polname in ('workout_plans_insert','workout_plans_update','workout_plans_delete')
order by polname;

-- 4) Confirma que a leitura continua separada e disponível pela função de view.
select
  polname,
  pg_get_expr(polqual, polrelid) as using_expression
from pg_policy
where polrelid = 'public.workout_plans'::regclass
  and polname = 'workout_plans_select';
