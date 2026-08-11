-- ULTIMATE FIT APP — Migration 024
-- Um aluno tem exatamente um professor responsável ativo.
-- Preserva todo o histórico de atribuições encerrando apenas vínculos ativos redundantes.

begin;

-- 1) Normalizar dados existentes: manter um único vínculo ativo por aluno.
-- Prioridade: vínculo já marcado como principal; depois o mais recente.
with ranked as (
  select
    id,
    student_id,
    row_number() over (
      partition by student_id
      order by is_primary desc, assigned_at desc, created_at desc, id desc
    ) as rn
  from public.trainer_students
  where ended_at is null
), extras as (
  select id from ranked where rn > 1
)
update public.trainer_students ts
set
  ended_at = now(),
  is_primary = false,
  end_reason = coalesce(ts.end_reason, 'normalized_single_responsible_trainer')
where ts.id in (select id from extras);

-- 2) Garantir que o único vínculo ativo fica marcado como principal.
update public.trainer_students
set is_primary = true
where ended_at is null
  and is_primary is distinct from true;

-- 3) Garantir a regra também ao nível da base de dados.
create unique index if not exists trainer_students_one_active_assignment_uidx
  on public.trainer_students (student_id)
  where ended_at is null;

-- 4) Qualquer vínculo ativo novo é, por definição, o professor responsável.
create or replace function public.trainer_students_single_responsible_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.ended_at is null then
    new.is_primary := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trainer_students_single_responsible_guard on public.trainer_students;
create trigger trainer_students_single_responsible_guard
before insert or update of ended_at, is_primary
on public.trainer_students
for each row
execute function public.trainer_students_single_responsible_guard();

commit;
