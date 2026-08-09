-- ULTIMATE FIT APP
-- Migration 017: opção de alongamentos automáticos por plano
-- Data: 2026-08-09
-- Requer Migration 011 ou superior.

begin;

alter table public.workout_plans
  add column if not exists auto_stretching_enabled boolean not null default true;

update public.workout_plans
set auto_stretching_enabled = true
where auto_stretching_enabled is null;

comment on column public.workout_plans.auto_stretching_enabled is
  'Quando true, a app mostra alongamentos automáticos no final de cada sessão com base nos grupos musculares trabalhados.';

create or replace function public.save_workout_plan(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_plan_id uuid;
  target_student_id uuid;
  target_trainer_id uuid;
  session_payload jsonb;
  block_payload jsonb;
  item_payload jsonb;
  created_session_id uuid;
  created_block_id uuid;
  session_index integer := 0;
  block_index integer := 0;
  item_index integer := 0;
  requested_status text;
  selected_exercise_id uuid;
  custom_exercise_name text;
begin
  if actor_id is null then
    raise exception 'Sessão inválida.';
  end if;

  target_student_id := nullif(payload->>'studentId','')::uuid;
  target_plan_id := nullif(payload->>'planId','')::uuid;
  requested_status := coalesce(nullif(payload->>'status',''), 'draft');

  if target_student_id is null then
    raise exception 'Seleciona um aluno.';
  end if;
  if not public.can_manage_workout_student(target_student_id) then
    raise exception 'Sem permissão para gerir planos deste aluno.';
  end if;
  if requested_status not in ('draft','published') then
    requested_status := 'draft';
  end if;

  target_trainer_id := public.current_trainer_id();

  if target_plan_id is null then
    insert into public.workout_plans (
      student_id, trainer_id, title, description, goal, status, is_active,
      start_date, end_date, auto_stretching_enabled, created_by, updated_by, published_by, published_at
    ) values (
      target_student_id,
      target_trainer_id,
      btrim(coalesce(payload->>'title','')),
      nullif(btrim(coalesce(payload->>'description','')),''),
      nullif(btrim(coalesce(payload->>'goal','')),''),
      requested_status,
      coalesce((payload->>'isActive')::boolean, true),
      nullif(payload->>'startDate','')::date,
      nullif(payload->>'endDate','')::date,
      coalesce((payload->>'autoStretchingEnabled')::boolean, true),
      actor_id,
      actor_id,
      case when requested_status='published' then actor_id else null end,
      case when requested_status='published' then now() else null end
    ) returning id into target_plan_id;
  else
    if not public.can_manage_workout_plan(target_plan_id) then
      raise exception 'Sem permissão para editar este plano.';
    end if;

    update public.workout_plans
    set student_id = target_student_id,
        trainer_id = coalesce(target_trainer_id, trainer_id),
        title = btrim(coalesce(payload->>'title','')),
        description = nullif(btrim(coalesce(payload->>'description','')),''),
        goal = nullif(btrim(coalesce(payload->>'goal','')),''),
        status = requested_status,
        is_active = coalesce((payload->>'isActive')::boolean, is_active),
        start_date = nullif(payload->>'startDate','')::date,
        end_date = nullif(payload->>'endDate','')::date,
        auto_stretching_enabled = coalesce((payload->>'autoStretchingEnabled')::boolean, true),
        updated_by = actor_id,
        published_by = case when requested_status='published' then coalesce(published_by, actor_id) else published_by end,
        published_at = case when requested_status='published' then coalesce(published_at, now()) else published_at end,
        archived_at = null
    where id = target_plan_id;

    delete from public.workout_sessions where plan_id = target_plan_id;
  end if;

  if btrim(coalesce(payload->>'title','')) = '' then
    raise exception 'O plano precisa de um título.';
  end if;

  session_index := 0;
  for session_payload in select value from jsonb_array_elements(coalesce(payload->'sessions','[]'::jsonb))
  loop
    insert into public.workout_sessions (plan_id, title, description, sort_order)
    values (
      target_plan_id,
      coalesce(nullif(btrim(session_payload->>'title'),''), 'Treino ' || (session_index + 1)::text),
      nullif(btrim(coalesce(session_payload->>'description','')),''),
      session_index
    ) returning id into created_session_id;

    block_index := 0;
    for block_payload in select value from jsonb_array_elements(coalesce(session_payload->'blocks','[]'::jsonb))
    loop
      insert into public.workout_blocks (
        session_id, block_type, title, rounds, rest_after_seconds, sort_order
      ) values (
        created_session_id,
        coalesce(
          (
            select wbt.code
            from public.workout_block_types wbt
            where wbt.code = nullif(block_payload->>'type','')
              and wbt.is_active = true
            limit 1
          ),
          'standard'
        ),
        nullif(btrim(coalesce(block_payload->>'title','')),''),
        greatest(1, least(50, coalesce(nullif(block_payload->>'rounds','')::integer,1))),
        nullif(block_payload->>'restAfterSeconds','')::integer,
        block_index
      ) returning id into created_block_id;

      item_index := 0;
      for item_payload in select value from jsonb_array_elements(coalesce(block_payload->'items','[]'::jsonb))
      loop
        selected_exercise_id := nullif(item_payload->>'exerciseId','')::uuid;
        custom_exercise_name := nullif(btrim(coalesce(item_payload->>'manualName','')),'');

        -- Um item pode vir da biblioteca OU ser escrito livremente pelo professor.
        if selected_exercise_id is not null or custom_exercise_name is not null then
          if selected_exercise_id is not null then
            custom_exercise_name := null;
          elsif char_length(custom_exercise_name) < 2 then
            raise exception 'O nome do exercício em texto livre é demasiado curto.';
          end if;

          insert into public.workout_items (
            block_id, exercise_id, custom_exercise_name, sort_order, sets, reps, duration_seconds,
            rest_seconds, tempo, load_text, rpe, notes
          ) values (
            created_block_id,
            selected_exercise_id,
            custom_exercise_name,
            item_index,
            nullif(item_payload->>'sets','')::integer,
            nullif(btrim(coalesce(item_payload->>'reps','')),''),
            nullif(item_payload->>'durationSeconds','')::integer,
            nullif(item_payload->>'restSeconds','')::integer,
            nullif(btrim(coalesce(item_payload->>'tempo','')),''),
            nullif(btrim(coalesce(item_payload->>'loadText','')),''),
            nullif(item_payload->>'rpe','')::numeric,
            nullif(btrim(coalesce(item_payload->>'notes','')),'')
          );
          item_index := item_index + 1;
        end if;
      end loop;
      block_index := block_index + 1;
    end loop;
    session_index := session_index + 1;
  end loop;

  if requested_status = 'published' and not exists (
    select 1
    from public.workout_sessions ws
    join public.workout_blocks wb on wb.session_id = ws.id
    join public.workout_items wi on wi.block_id = wb.id
    where ws.plan_id = target_plan_id
  ) then
    raise exception 'Para publicar, adiciona pelo menos um exercício ao plano.';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (actor_id, 'save_workout_plan', 'workout_plan', target_plan_id,
    jsonb_build_object('student_id', target_student_id, 'status', requested_status, 'auto_stretching_enabled', coalesce((payload->>'autoStretchingEnabled')::boolean, true)));

  return target_plan_id;
end;
$$;

grant execute on function public.save_workout_plan(jsonb) to authenticated;

commit;
