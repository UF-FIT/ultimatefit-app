-- ULTIMATE FIT APP
-- Migration 015: eliminação definitiva de avaliações e planos de treino
-- Data: 2026-08-08
-- Requer migrations anteriores até 014.

begin;

create or replace function public.delete_physical_assessment_permanently(target_assessment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_student_id uuid;
  target_status text;
begin
  if actor_id is null then
    raise exception 'Sessão inválida.';
  end if;

  select pa.student_id, pa.status
    into target_student_id, target_status
  from public.physical_assessments pa
  where pa.id = target_assessment_id
    and pa.deleted_at is null
  limit 1;

  if target_student_id is null then
    raise exception 'Avaliação não encontrada.';
  end if;

  if not public.can_manage_assessment_student(target_student_id) then
    raise exception 'Sem permissão para eliminar esta avaliação.';
  end if;

  delete from public.physical_assessments
  where id = target_assessment_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id,
    'delete_physical_assessment_permanently',
    'physical_assessment',
    target_assessment_id,
    jsonb_build_object('student_id', target_student_id, 'previous_status', target_status)
  );

  return target_assessment_id;
end;
$$;

create or replace function public.delete_workout_plan_permanently(target_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_student_id uuid;
  target_title text;
  target_status text;
begin
  if actor_id is null then
    raise exception 'Sessão inválida.';
  end if;

  select wp.student_id, wp.title, wp.status
    into target_student_id, target_title, target_status
  from public.workout_plans wp
  where wp.id = target_plan_id
  limit 1;

  if target_student_id is null then
    raise exception 'Plano de treino não encontrado.';
  end if;

  if not public.can_manage_workout_plan(target_plan_id) then
    raise exception 'Sem permissão para eliminar este plano de treino.';
  end if;

  delete from public.workout_plans
  where id = target_plan_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id,
    'delete_workout_plan_permanently',
    'workout_plan',
    target_plan_id,
    jsonb_build_object(
      'student_id', target_student_id,
      'title', target_title,
      'previous_status', target_status
    )
  );

  return target_plan_id;
end;
$$;

revoke all on function public.delete_physical_assessment_permanently(uuid) from public;
revoke all on function public.delete_workout_plan_permanently(uuid) from public;
grant execute on function public.delete_physical_assessment_permanently(uuid) to authenticated;
grant execute on function public.delete_workout_plan_permanently(uuid) to authenticated;

commit;
