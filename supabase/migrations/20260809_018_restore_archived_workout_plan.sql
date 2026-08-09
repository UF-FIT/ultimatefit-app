-- ULTIMATE FIT APP v5D.5.3
-- Permite restaurar planos de treino arquivados sem recriar o conteúdo.

begin;

create or replace function public.restore_workout_plan(target_plan_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  previous_published_at timestamptz;
  restored_status text;
begin
  if actor_id is null then
    raise exception 'Sessão inválida.';
  end if;

  if not public.can_manage_workout_plan(target_plan_id) then
    raise exception 'Sem permissão para restaurar este plano.';
  end if;

  select wp.published_at
    into previous_published_at
  from public.workout_plans wp
  where wp.id = target_plan_id
  for update;

  if not found then
    raise exception 'Plano de treino não encontrado.';
  end if;

  -- Se o plano já tinha sido publicado antes de ser arquivado, volta a publicado.
  -- Se nunca foi publicado, volta a rascunho para evitar publicação acidental.
  restored_status := case when previous_published_at is not null then 'published' else 'draft' end;

  update public.workout_plans
  set status = restored_status,
      is_active = true,
      archived_at = null,
      updated_by = actor_id
  where id = target_plan_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id,
    'restore_workout_plan',
    'workout_plan',
    target_plan_id,
    jsonb_build_object('restored_status', restored_status)
  );

  return restored_status;
end;
$$;

grant execute on function public.restore_workout_plan(uuid) to authenticated;

commit;
