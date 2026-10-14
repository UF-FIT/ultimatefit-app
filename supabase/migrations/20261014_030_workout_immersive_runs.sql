-- ULTIMATE FIT APP
-- Migration 030: sessões de treino imersivas e persistentes
-- Data: 2026-10-14

begin;

create table if not exists public.workout_runs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  plan_id uuid references public.workout_plans(id) on delete set null,
  session_id uuid references public.workout_sessions(id) on delete set null,
  status text not null default 'active',
  mode text not null default 'guided',
  workout_date date not null default current_date,
  plan_title text not null default '',
  session_title text not null default '',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  cancelled_at timestamptz,
  current_activity_index integer not null default 0,
  state jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_runs_status_check check (status in ('active','completed','cancelled')),
  constraint workout_runs_mode_check check (mode in ('guided','simplified')),
  constraint workout_runs_current_activity_check check (current_activity_index >= 0),
  constraint workout_runs_plan_title_check check (char_length(plan_title) <= 220),
  constraint workout_runs_session_title_check check (char_length(session_title) <= 220)
);

create unique index if not exists workout_runs_one_active_per_student_uidx
  on public.workout_runs (student_id)
  where status = 'active';

create index if not exists workout_runs_student_started_idx
  on public.workout_runs (student_id, started_at desc);

create index if not exists workout_runs_plan_idx
  on public.workout_runs (plan_id, started_at desc)
  where plan_id is not null;

create table if not exists public.workout_run_set_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workout_runs(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  plan_id uuid references public.workout_plans(id) on delete set null,
  session_id uuid references public.workout_sessions(id) on delete set null,
  workout_item_id uuid references public.workout_items(id) on delete set null,
  exercise_id uuid references public.exercise_library(id) on delete set null,
  exercise_name text not null,
  muscle_group text not null,
  set_index integer not null,
  reps_completed integer not null,
  weight_kg numeric(8,2),
  volume_kg numeric(14,2) generated always as (coalesce(weight_kg, 0) * reps_completed) stored,
  completed_on date not null default current_date,
  created_at timestamptz not null default now(),
  constraint workout_run_set_results_set_index_check check (set_index between 1 and 100),
  constraint workout_run_set_results_reps_check check (reps_completed between 1 and 1000),
  constraint workout_run_set_results_weight_check check (weight_kg is null or (weight_kg >= 0 and weight_kg <= 2000)),
  constraint workout_run_set_results_name_check check (char_length(btrim(exercise_name)) between 1 and 180),
  constraint workout_run_set_results_group_check check (char_length(btrim(muscle_group)) between 1 and 120)
);

create unique index if not exists workout_run_set_results_run_item_set_uidx
  on public.workout_run_set_results (run_id, workout_item_id, set_index)
  where workout_item_id is not null;

create index if not exists workout_run_set_results_student_date_idx
  on public.workout_run_set_results (student_id, completed_on desc);

create index if not exists workout_run_set_results_student_exercise_date_idx
  on public.workout_run_set_results (student_id, exercise_id, completed_on desc)
  where exercise_id is not null;

create index if not exists workout_run_set_results_student_group_date_idx
  on public.workout_run_set_results (student_id, muscle_group, completed_on desc);

create or replace function public.set_workout_run_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists workout_runs_set_updated_at on public.workout_runs;
create trigger workout_runs_set_updated_at
before update on public.workout_runs
for each row execute function public.set_workout_run_updated_at();

alter table public.workout_runs enable row level security;
alter table public.workout_run_set_results enable row level security;

drop policy if exists workout_runs_select_accessible on public.workout_runs;
create policy workout_runs_select_accessible
on public.workout_runs
for select to authenticated
using (public.can_view_student(student_id));

drop policy if exists workout_run_set_results_select_accessible on public.workout_run_set_results;
create policy workout_run_set_results_select_accessible
on public.workout_run_set_results
for select to authenticated
using (public.can_view_student(student_id));

revoke all on table public.workout_runs from anon;
revoke all on table public.workout_runs from authenticated;
grant select on table public.workout_runs to authenticated;

revoke all on table public.workout_run_set_results from anon;
revoke all on table public.workout_run_set_results from authenticated;
grant select on table public.workout_run_set_results to authenticated;

create or replace function public.start_workout_run(
  target_student_id uuid,
  target_plan_id uuid,
  target_session_id uuid,
  target_state jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  existing_id uuid;
  run_id uuid;
  plan_title_value text;
  session_title_value text;
begin
  if actor_id is null then raise exception 'Sessão inválida.'; end if;
  if target_student_id is null or target_plan_id is null or target_session_id is null then raise exception 'Treino inválido.'; end if;
  if target_student_id <> public.current_student_id() then raise exception 'Só podes iniciar o teu próprio treino.'; end if;
  if target_state is null or jsonb_typeof(target_state) <> 'object' then raise exception 'Estado inicial do treino inválido.'; end if;

  select wr.id into existing_id
  from public.workout_runs wr
  where wr.student_id = target_student_id and wr.status = 'active'
  order by wr.started_at desc
  limit 1;

  if existing_id is not null then return existing_id; end if;

  select wp.title, ws.title
    into plan_title_value, session_title_value
  from public.workout_plans wp
  join public.workout_sessions ws on ws.plan_id = wp.id
  where wp.id = target_plan_id
    and wp.student_id = target_student_id
    and wp.status = 'published'
    and ws.id = target_session_id
  limit 1;

  if plan_title_value is null then raise exception 'Este treino não está disponível para o aluno.'; end if;

  insert into public.workout_runs (
    student_id, plan_id, session_id, status, mode, workout_date,
    plan_title, session_title, current_activity_index, state, created_by
  ) values (
    target_student_id, target_plan_id, target_session_id, 'active', 'guided', current_date,
    plan_title_value, session_title_value, 0, target_state, actor_id
  )
  returning id into run_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id, 'start_workout_run', 'workout_run', run_id,
    jsonb_build_object('student_id', target_student_id, 'plan_id', target_plan_id, 'session_id', target_session_id)
  );

  return run_id;
end;
$$;

create or replace function public.save_workout_run_state(
  target_run_id uuid,
  target_mode text,
  target_current_activity_index integer,
  target_state jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  run_student_id uuid;
  clean_mode text := lower(coalesce(target_mode,'guided'));
begin
  if actor_id is null then raise exception 'Sessão inválida.'; end if;
  if clean_mode not in ('guided','simplified') then raise exception 'Modo de treino inválido.'; end if;
  if target_current_activity_index is null or target_current_activity_index < 0 then raise exception 'Atividade atual inválida.'; end if;
  if target_state is null or jsonb_typeof(target_state) <> 'object' then raise exception 'Estado do treino inválido.'; end if;

  select wr.student_id into run_student_id
  from public.workout_runs wr
  where wr.id = target_run_id and wr.status = 'active'
  for update;

  if run_student_id is null then raise exception 'Treino em curso não encontrado.'; end if;
  if run_student_id <> public.current_student_id() then raise exception 'Sem permissão para alterar este treino.'; end if;

  update public.workout_runs
  set mode = clean_mode,
      current_activity_index = target_current_activity_index,
      state = target_state,
      updated_at = now()
  where id = target_run_id;

  return true;
end;
$$;

create or replace function public.cancel_workout_run(target_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  run_student_id uuid;
begin
  if actor_id is null then raise exception 'Sessão inválida.'; end if;

  select wr.student_id into run_student_id
  from public.workout_runs wr
  where wr.id = target_run_id and wr.status = 'active'
  for update;

  if run_student_id is null then raise exception 'Treino em curso não encontrado.'; end if;
  if run_student_id <> public.current_student_id() then raise exception 'Sem permissão para cancelar este treino.'; end if;

  update public.workout_runs
  set status = 'cancelled',
      cancelled_at = now(),
      ended_at = now(),
      summary = coalesce(summary, '{}'::jsonb) || jsonb_build_object('cancelled', true),
      updated_at = now()
  where id = target_run_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (actor_id, 'cancel_workout_run', 'workout_run', target_run_id, jsonb_build_object('student_id', run_student_id));

  return true;
end;
$$;

create or replace function public.complete_workout_run(
  target_run_id uuid,
  target_state jsonb,
  target_summary jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  if actor_id is null then raise exception 'Sessão inválida.'; end if;
  if target_state is null or jsonb_typeof(target_state) <> 'object' then raise exception 'Estado final do treino inválido.'; end if;
  if target_summary is null or jsonb_typeof(target_summary) <> 'object' then target_summary := '{}'::jsonb; end if;

  select * into run_row
  from public.workout_runs wr
  where wr.id = target_run_id and wr.status = 'active'
  for update;

  if run_row.id is null then raise exception 'Treino em curso não encontrado.'; end if;
  if run_row.student_id <> public.current_student_id() then raise exception 'Sem permissão para concluir este treino.'; end if;

  completion_id := public.record_workout_completion(
    run_row.student_id, run_row.plan_id, run_row.session_id, run_row.workout_date, 'student', null
  );

  delete from public.workout_run_set_results where run_id = target_run_id;

  for activity in select value from jsonb_array_elements(coalesce(target_state->'activities','[]'::jsonb))
  loop
    if coalesce(activity->>'status','pending') <> 'completed' then continue; end if;

    begin item_id := nullif(activity->>'workoutItemId','')::uuid;
    exception when others then item_id := null; end;
    if item_id is null then continue; end if;

    select wi.id, wi.exercise_id, el.name as exercise_name, el.muscle_group
      into item_row
    from public.workout_items wi
    join public.workout_blocks wb on wb.id = wi.block_id
    join public.workout_sessions ws on ws.id = wb.session_id
    left join public.exercise_library el on el.id = wi.exercise_id
    where wi.id = item_id and ws.id = run_row.session_id and ws.plan_id = run_row.plan_id
    limit 1;

    if item_row.id is null or item_row.exercise_id is null then continue; end if;

    for set_entry in select value from jsonb_array_elements(coalesce(activity->'sets','[]'::jsonb))
    loop
      if coalesce((set_entry->>'completed')::boolean, false) is not true then continue; end if;

      begin set_index_value := greatest(1, least(100, coalesce((set_entry->>'index')::integer, 1)));
      exception when others then set_index_value := 1; end;

      begin reps_value := nullif(set_entry->>'reps','')::integer;
      exception when others then reps_value := null; end;
      if reps_value is null or reps_value < 1 then continue; end if;
      reps_value := least(reps_value, 1000);

      begin weight_value := nullif(set_entry->>'weightKg','')::numeric;
      exception when others then weight_value := null; end;
      if weight_value is not null and (weight_value < 0 or weight_value > 2000) then weight_value := null; end if;

      insert into public.workout_run_set_results (
        run_id, student_id, plan_id, session_id, workout_item_id, exercise_id,
        exercise_name, muscle_group, set_index, reps_completed, weight_kg, completed_on
      ) values (
        target_run_id, run_row.student_id, run_row.plan_id, run_row.session_id,
        item_row.id, item_row.exercise_id,
        coalesce(nullif(btrim(item_row.exercise_name),''),'Exercício'),
        coalesce(nullif(btrim(item_row.muscle_group),''),'Outro'),
        set_index_value, reps_value, weight_value, run_row.workout_date
      )
      on conflict (run_id, workout_item_id, set_index)
        where workout_item_id is not null
      do update set reps_completed = excluded.reps_completed, weight_kg = excluded.weight_kg;
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
    actor_id, 'complete_workout_run', 'workout_run', target_run_id,
    jsonb_build_object('student_id', run_row.student_id, 'plan_id', run_row.plan_id, 'session_id', run_row.session_id, 'completion_id', completion_id)
  );

  return completion_id;
end;
$$;

revoke all on function public.start_workout_run(uuid,uuid,uuid,jsonb) from public;
revoke all on function public.save_workout_run_state(uuid,text,integer,jsonb) from public;
revoke all on function public.cancel_workout_run(uuid) from public;
revoke all on function public.complete_workout_run(uuid,jsonb,jsonb) from public;

grant execute on function public.start_workout_run(uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.save_workout_run_state(uuid,text,integer,jsonb) to authenticated;
grant execute on function public.cancel_workout_run(uuid) to authenticated;
grant execute on function public.complete_workout_run(uuid,jsonb,jsonb) to authenticated;

commit;
