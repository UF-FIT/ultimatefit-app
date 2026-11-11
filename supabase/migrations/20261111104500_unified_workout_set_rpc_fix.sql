begin;
create or replace function public.record_workout_session_with_loads(
  target_student_id uuid,
  target_plan_id uuid default null,
  target_session_id uuid default null,
  target_completed_on date default current_date,
  requested_source text default 'student',
  target_notes text default null,
  target_loads jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  completion_value uuid;
  entry jsonb;
  item_id uuid;
  weight_value numeric;
  sets_value integer;
  reps_value integer;
  item_row record;
  source_value text := lower(coalesce(requested_source,'student'));
  recorded_count integer := 0;
  set_number integer;
begin
  if actor_id is null then
    raise exception 'Sessão inválida.';
  end if;
  if target_student_id is null then
    raise exception 'Seleciona um aluno.';
  end if;
  if target_loads is null then
    target_loads := '[]'::jsonb;
  end if;
  if jsonb_typeof(target_loads) <> 'array' then
    raise exception 'Registo de cargas inválido.';
  end if;
  if not public.can_record_workout_completion(target_student_id, source_value) then
    raise exception 'Sem permissão para registar este treino.';
  end if;

  completion_value := public.record_workout_completion(
    target_student_id,
    target_plan_id,
    target_session_id,
    target_completed_on,
    source_value,
    target_notes
  );

  for entry in select value from jsonb_array_elements(target_loads)
  loop
    begin
      item_id := nullif(entry->>'workoutItemId','')::uuid;
    exception when others then
      raise exception 'Exercício do registo de carga inválido.';
    end;

    if item_id is null then
      continue;
    end if;

    weight_value := nullif(entry->>'weightKg','')::numeric;
    sets_value := nullif(entry->>'setsCompleted','')::integer;
    reps_value := nullif(entry->>'repsCompleted','')::integer;

    if weight_value is null or weight_value <= 0 then
      continue;
    end if;
    if sets_value is null or sets_value < 1 or sets_value > 100 then
      raise exception 'Número de séries inválido no registo de carga.';
    end if;
    if reps_value is null or reps_value < 1 or reps_value > 1000 then
      raise exception 'Número de repetições inválido no registo de carga.';
    end if;

    select
      wi.id,
      wi.exercise_id,
      ws.id as session_id,
      wp.id as plan_id,
      wp.student_id,
      el.name as exercise_name,
      el.muscle_group
    into item_row
    from public.workout_items wi
    join public.workout_blocks wb on wb.id = wi.block_id
    join public.workout_sessions ws on ws.id = wb.session_id
    join public.workout_plans wp on wp.id = ws.plan_id
    left join public.exercise_library el on el.id = wi.exercise_id
    where wi.id = item_id
      and wp.student_id = target_student_id
      and (target_plan_id is null or wp.id = target_plan_id)
      and (target_session_id is null or ws.id = target_session_id)
    limit 1;

    if item_row.id is null then
      raise exception 'Um dos exercícios não pertence a este treino.';
    end if;
    if item_row.exercise_id is null then
      -- Exercícios em texto livre não têm grupo muscular fiável para análise.
      continue;
    end if;

    insert into public.workout_exercise_loads (
      student_id,
      completion_value,
      plan_id,
      session_id,
      workout_item_id,
      exercise_id,
      exercise_name,
      muscle_group,
      weight_kg,
      sets_completed,
      reps_completed,
      completed_on,
      source,
      created_by
    ) values (
      target_student_id,
      completion_value,
      item_row.plan_id,
      item_row.session_id,
      item_row.id,
      item_row.exercise_id,
      coalesce(nullif(btrim(item_row.exercise_name),''),'Exercício'),
      coalesce(nullif(btrim(item_row.muscle_group),''),'Outro'),
      weight_value,
      sets_value,
      reps_value,
      coalesce(target_completed_on,current_date),
      source_value,
      actor_id
    )
    on conflict (student_id, completed_on, workout_item_id)
      where workout_item_id is not null
    do update set
      completion_value = excluded.completion_value,
      plan_id = excluded.plan_id,
      session_id = excluded.session_id,
      exercise_id = excluded.exercise_id,
      exercise_name = excluded.exercise_name,
      muscle_group = excluded.muscle_group,
      weight_kg = excluded.weight_kg,
      sets_completed = excluded.sets_completed,
      reps_completed = excluded.reps_completed,
      source = excluded.source,
      created_by = excluded.created_by,
      updated_at = now();

    insert into public.workout_run_set_results (
      run_id, completion_id, student_id, plan_id, session_id, workout_item_id, exercise_id,
      exercise_name, muscle_group, set_index, reps_completed, weight_kg, completed_on
    )
    select
      null, completion_value, target_student_id, item_row.plan_id, item_row.session_id,
      item_row.id, item_row.exercise_id,
      coalesce(nullif(btrim(item_row.exercise_name),''),'Exercício'),
      coalesce(nullif(btrim(item_row.muscle_group),''),'Outro'),
      gs.set_number, reps_value, weight_value, coalesce(target_completed_on,current_date)
    from generate_series(1,sets_value) as gs(set_number)
    on conflict (completion_id, workout_item_id, set_index)
      where completion_id is not null and workout_item_id is not null
    do update set reps_completed=excluded.reps_completed, weight_kg=excluded.weight_kg,
      plan_id=excluded.plan_id, session_id=excluded.session_id,
      exercise_id=excluded.exercise_id, exercise_name=excluded.exercise_name,
      muscle_group=excluded.muscle_group, completed_on=excluded.completed_on;

    recorded_count := recorded_count + 1;
  end loop;

  if recorded_count > 0 then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (
      actor_id,
      'record_workout_exercise_loads',
      'workout_completion',
      completion_value,
      jsonb_build_object(
        'student_id', target_student_id,
        'plan_id', target_plan_id,
        'session_id', target_session_id,
        'completed_on', coalesce(target_completed_on,current_date),
        'load_entries', recorded_count
      )
    );
  end if;

  return completion_value;
end;
$$;
revoke all on function public.record_workout_session_with_loads(uuid,uuid,uuid,date,text,text,jsonb) from public;
grant execute on function public.record_workout_session_with_loads(uuid,uuid,uuid,date,text,text,jsonb) to authenticated;
commit;