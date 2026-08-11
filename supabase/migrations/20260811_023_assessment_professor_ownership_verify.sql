-- Verificação v5D.6.5.2 — ownership das avaliações físicas

-- 1) A função de gestão não pode conter bypass administrativo global.
select
  'can_manage_assessment_student' as check_name,
  position('current_trainer_owns_student' in pg_get_functiondef('public.can_manage_assessment_student(uuid)'::regprocedure)) > 0 as usa_professor_responsavel,
  position('is_admin()' in pg_get_functiondef('public.can_manage_assessment_student(uuid)'::regprocedure)) = 0 as sem_bypass_admin,
  position('manage_assessments' in pg_get_functiondef('public.can_manage_assessment_student(uuid)'::regprocedure)) > 0 as respeita_permissao;

-- 2) A leitura mantém o acesso global para Owner/Admin.
select
  'can_view_physical_assessment' as check_name,
  position('is_admin()' in pg_get_functiondef('public.can_view_physical_assessment(uuid)'::regprocedure)) > 0 as admin_le_todos,
  position('trainer_has_student' in pg_get_functiondef('public.can_view_physical_assessment(uuid)'::regprocedure)) > 0 as professor_le_atribuidos;

-- 3) Policies de escrita do cabeçalho da avaliação.
select
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'physical_assessments'
  and policyname in (
    'physical_assessments_insert',
    'physical_assessments_update',
    'physical_assessments_delete'
  )
order by policyname;
