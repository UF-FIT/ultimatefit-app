-- Keep completion, set results, run status and audit in one transaction.
-- No historical workouts are changed by this migration.
CREATE OR REPLACE FUNCTION public.complete_workout_run(target_run_id uuid, target_state jsonb, target_summary jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid();
  run_row public.workout_runs%rowtype;
  completion_id uuid;
  activity jsonb;
  set_entry jsonb;
  item_id uuid;
  item_row record;
  set_index_value integer;
  reps_value integer;
  weight_value numeric;
begin
  if actor_id is null then
    raise exception 'Sessão inválida.';
  end if;
  if target_state is null or jsonb_typeof(target_state) <> 'object' then
    raise exception 'Estado final do treino inválido.';
  end if;
  if target_summary is null or jsonb_typeof(target_summary) <> 'object' then
    target_summary := '{}'::jsonb;
  end if;

  select * into run_row
  from public.workout_runs wr
  where wr.id = target_run_id
  for update;

  if run_row.id is null then
    raise exception 'Treino em curso não encontrado.';
  end if;
  if run_row.student_id is distinct from public.current_student_id() then
    raise exception 'Sem permissão para concluir este treino.';
  end if;

  -- The row lock serializes double taps and retries after a lost response.
  if run_row.status = 'completed' then
    select wc.id into completion_id
    from public.workout_completions wc
    where wc.student_id = run_row.student_id
      and wc.completed_on = run_row.workout_date;
    if completion_id is null then
      raise exception 'A conclusão deste treino não foi encontrada. Contacta o professor.';
    end if;
    return completion_id;
  end if;
  if run_row.status <> 'active' then
    raise exception 'Este treino já não está ativo.';
  end if;

  completion_id := public.record_workout_completion(
    run_row.student_id,
    run_row.plan_id,
    run_row.session_id,
    run_row.workout_date,
    'student',
    null
  );

  delete from public.workout_run_set_results where run_id = target_run_id;

  for activity in
    select value
    from jsonb_array_elements(coalesce(target_state->'activities','[]'::jsonb))
  loop
    if coalesce(activity->>'status','pending') <> 'completed' then
      continue;
    end if;

    begin
      item_id := nullif(activity->>'workoutItemId','')::uuid;
    exception when others then
      item_id := null;
    end;

    if item_id is null then
      continue;
    end if;

    select
      wi.id,
      wi.exercise_id,
      el.name as exercise_name,
      el.muscle_group
    into item_row
    from public.workout_items wi
    join public.workout_blocks wb on wb.id = wi.block_id
    join public.workout_sessions ws on ws.id = wb.session_id
    left join public.exercise_library el on el.id = wi.exercise_id
    where wi.id = item_id
      and ws.id = run_row.session_id
      and ws.plan_id = run_row.plan_id
    limit 1;

    if item_row.id is null or item_row.exercise_id is null then
      continue;
    end if;

    for set_entry in
      select value
      from jsonb_array_elements(coalesce(activity->'sets','[]'::jsonb))
    loop
      if coalesce((set_entry->>'completed')::boolean, false) is not true then
        continue;
      end if;

      begin
        set_index_value := greatest(1, least(100, coalesce((set_entry->>'index')::integer, 1)));
      exception when others then
        set_index_value := 1;
      end;

      begin
        reps_value := nullif(set_entry->>'reps','')::integer;
      exception when others then
        reps_value := null;
      end;
      if reps_value is null or reps_value < 1 then
        continue;
      end if;
      reps_value := least(reps_value, 1000);

      begin
        weight_value := nullif(set_entry->>'weightKg','')::numeric;
      exception when others then
        weight_value := null;
      end;
      if weight_value is not null and (weight_value < 0 or weight_value > 2000) then
        weight_value := null;
      end if;

      insert into public.workout_run_set_results (
        run_id, student_id, plan_id, session_id, workout_item_id, exercise_id,
        exercise_name, muscle_group, set_index, reps_completed, weight_kg,
        completed_on
      ) values (
        target_run_id,
        run_row.student_id,
        run_row.plan_id,
        run_row.session_id,
        item_row.id,
        item_row.exercise_id,
        coalesce(nullif(btrim(item_row.exercise_name),''),'Exercício'),
        coalesce(nullif(btrim(item_row.muscle_group),''),'Outro'),
        set_index_value,
        reps_value,
        weight_value,
        run_row.workout_date
      )
      on conflict (run_id, workout_item_id, set_index)
        where workout_item_id is not null
      do update set
        reps_completed = excluded.reps_completed,
        weight_kg = excluded.weight_kg;
    end loop;
  end loop;

  update public.workout_runs
  set status = 'completed',
      ended_at = now(),
      current_activity_index = coalesce((target_state->>'currentIndex')::integer, current_activity_index),
      state = target_state,
      summary = target_summary,
      updated_at = now()
  where id = target_run_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id,
    'complete_workout_run',
    'workout_run',
    target_run_id,
    jsonb_build_object(
      'student_id', run_row.student_id,
      'plan_id', run_row.plan_id,
      'session_id', run_row.session_id,
      'completion_id', completion_id
    )
  );

  return completion_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.complete_workout_run(uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_workout_run(uuid,jsonb,jsonb) TO authenticated;
