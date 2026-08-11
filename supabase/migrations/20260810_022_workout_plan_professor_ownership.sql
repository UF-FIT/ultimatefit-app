-- ULTIMATE FIT APP v5D.6.5.0
-- Planos de treino: administração com leitura global, escrita reservada ao professor responsável.
-- Data: 2026-08-10
--
-- Regra funcional:
--   * Owner/Admin: podem consultar todos os planos, mas só alteram planos de alunos
--     que lhes estejam atribuídos como professor responsável.
--   * Trainer: apenas consulta/gera planos dos seus alunos (mantém a RLS existente).
--   * Student: apenas consulta o próprio plano publicado (mantém a RLS existente).
--
-- A função considera a atribuição PRIMARY ativa. Para registos antigos sem qualquer
-- primary ativo, usa a atribuição ativa existente como fallback, evitando bloquear
-- alunos legados.

begin;

create or replace function public.current_trainer_owns_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_student_id is null then false
    when public.current_trainer_id() is null then false
    when exists (
      select 1
      from public.trainer_students ts_primary
      where ts_primary.student_id = target_student_id
        and ts_primary.ended_at is null
        and ts_primary.is_primary = true
    ) then exists (
      select 1
      from public.trainer_students ts
      where ts.student_id = target_student_id
        and ts.trainer_id = public.current_trainer_id()
        and ts.ended_at is null
        and ts.is_primary = true
    )
    else public.trainer_has_student(target_student_id)
  end;
$$;

create or replace function public.can_manage_workout_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_student_id is not null
    and public.current_trainer_owns_student(target_student_id)
    and public.trainer_has_permission('manage_workout_plans');
$$;

create or replace function public.can_manage_workout_plan(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.can_manage_workout_student(wp.student_id)
    from public.workout_plans wp
    where wp.id = target_plan_id
    limit 1
  ), false);
$$;

-- A leitura continua global para Owner/Admin através de can_view_workout_plan().
-- A escrita direta fica alinhada com a mesma regra das RPCs.
drop policy if exists workout_plans_insert on public.workout_plans;
create policy workout_plans_insert
on public.workout_plans for insert to authenticated
with check (
  public.can_manage_workout_student(student_id)
  and trainer_id = public.current_trainer_id()
);

drop policy if exists workout_plans_update on public.workout_plans;
create policy workout_plans_update
on public.workout_plans for update to authenticated
using (public.can_manage_workout_plan(id))
with check (
  public.can_manage_workout_student(student_id)
  and trainer_id = public.current_trainer_id()
);

-- Antes, qualquer admin podia apagar qualquer plano diretamente pela tabela.
-- Passa a ser permitido apenas ao professor responsável pelo aluno.
drop policy if exists workout_plans_delete on public.workout_plans;
create policy workout_plans_delete
on public.workout_plans for delete to authenticated
using (public.can_manage_workout_plan(id));

revoke all on function public.current_trainer_owns_student(uuid) from public;
grant execute on function public.current_trainer_owns_student(uuid) to authenticated;
grant execute on function public.can_manage_workout_student(uuid) to authenticated;
grant execute on function public.can_manage_workout_plan(uuid) to authenticated;

commit;
