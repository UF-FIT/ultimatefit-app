-- 1. Deve devolver 0 linhas: nenhum aluno pode ter mais de um professor ativo.
select student_id, count(*) as active_trainers
from public.trainer_students
where ended_at is null
group by student_id
having count(*) > 1;

-- 2. Deve devolver 0 linhas: todo vínculo ativo deve ser o responsável/principal.
select id, student_id, trainer_id, is_primary
from public.trainer_students
where ended_at is null
  and is_primary is distinct from true;

-- 3. Deve devolver uma linha com o índice único ativo.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'trainer_students'
  and indexname = 'trainer_students_one_active_assignment_uidx';

-- 4. Deve devolver uma linha com o trigger de proteção.
select tgname as trigger_name
from pg_trigger
where tgrelid = 'public.trainer_students'::regclass
  and not tgisinternal
  and tgname = 'trainer_students_single_responsible_guard';
