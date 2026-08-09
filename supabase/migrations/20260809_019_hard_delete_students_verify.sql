-- ULTIMATE FIT APP
-- Verificação Migration 019
-- Apenas leitura: não altera dados.

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'hard_delete_student_data';

select
  count(*) filter (where sp.deleted_at is not null or p.deleted_at is not null) as eliminacoes_antigas_por_normalizar,
  count(*) filter (where sp.status = 'archived') as alunos_arquivados,
  count(*) filter (where sp.status = 'active' and p.is_active = true) as alunos_ativos
from public.student_profiles sp
join public.profiles p on p.id = sp.profile_id;

select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'hard_delete_student_data'
order by grantee;
