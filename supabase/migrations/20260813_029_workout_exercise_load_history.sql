-- ULTIMATE FIT APP
-- Migration 029: histórico de cargas por exercício + volume mensal por grupo muscular
-- Data: 2026-08-13
-- Requer migrations anteriores até 028.

begin;

create table if not exists public.workout_exercise_loads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  completion_id uuid not null references public.workout_completions(id) on delete cascade,
  plan_id uuid references public.workout_plans(id) on delete set null,
  session_id uuid references public.workout_sessions(id) on delete set null,
  workout_item_id uuid references public.workout_items(id) on delete set null,
  exercise_id uuid references public.exercise_library(id) on delete set null,
  exercise_name text not null,
  muscle_group text not null,
  weight_kg numeric(8,2) not null,
  sets_completed integer not null,
  reps_completed integer not null,
  volume_kg numeric(14,2) generated always as (weight_kg * sets_completed * reps_completed) stored,
  completed_on date not null default current_date,
  source text not null default 'student',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_exercise_loads_weight_check check (weight_kg > 0 and weight_kg <= 2000),
  constraint workout_exercise_loads_sets_check check (sets_completed between 1 and 100),
  constraint workout_exercise_loads_reps_check check (reps_completed between 1 and 1000),
  constraint workout_exercise_loads_source_check check (source in ('student','trainer')),
  constraint workout_exercise_loads_name_check check (char_length(btrim(exercise_name)) between 1 and 180),
  constraint workout_exercise_loads_group_check check (char_length(btrim(muscle_group)) between 1 and 120)
);

create unique index if not exists workout_exercise_loads_day_item_uidx
  on public.workout_exercise_loads (student_id, completed_on, workout_item_id)
  where workout_item_id is not null;

create index if not exists workout_exercise_loads_student_date_idx
  on public.workout_exercise_loads (student_id, completed_on desc);
create index if not exists workout_exercise_loads_student_exercise_idx
  on public.workout_exercise_loads (student_id, exercise_id, completed_on desc)
  where exercise_id is not null;
create index if not exists workout_exercise_loads_student_group_date_idx
  on public.workout_exercise_loads (student_id, muscle_group, completed_on desc);

create or replace function public.set_workout_exercise_load_updated_at()
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

drop trigger if exists workout_exercise_loads_set_updated_at on public.workout_exercise_loads;
create trigger workout_exercise_loads_set_updated_at
before update on public.workout_exercise_loads
for each row execute function public.set_workout_exercise_load_updated_at();

-- Regista o treino e as cargas numa única transação. O array target_loads contém:
-- workoutItemId, weightKg, setsCompleted e repsCompleted.
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
  completion_id uuid;
  entry jsonb;
  item_id uuid;
  weight_value numeric;
  sets_value integer;
  reps_value integer;
  item_row record;
  source_value text := lower(coalesce(requested_source,'student'));
  recorded_count integer := 0;
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

  completion_id := public.record_workout_completion(
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
      completion_id,
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
      completion_id,
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
      completion_id = excluded.completion_id,
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

    recorded_count := recorded_count + 1;
  end loop;

  if recorded_count > 0 then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (
      actor_id,
      'record_workout_exercise_loads',
      'workout_completion',
      completion_id,
      jsonb_build_object(
        'student_id', target_student_id,
        'plan_id', target_plan_id,
        'session_id', target_session_id,
        'completed_on', coalesce(target_completed_on,current_date),
        'load_entries', recorded_count
      )
    );
  end if;

  return completion_id;
end;
$$;

alter table public.workout_exercise_loads enable row level security;

drop policy if exists workout_exercise_loads_select_accessible on public.workout_exercise_loads;
create policy workout_exercise_loads_select_accessible
on public.workout_exercise_loads
for select to authenticated
using (public.can_view_student(student_id));

-- Escrita apenas através da RPC acima; não damos INSERT/UPDATE/DELETE direto ao cliente.
revoke all on table public.workout_exercise_loads from anon;
revoke all on table public.workout_exercise_loads from authenticated;
grant select on table public.workout_exercise_loads to authenticated;
revoke all on function public.record_workout_session_with_loads(uuid,uuid,uuid,date,text,text,jsonb) from public;
grant execute on function public.record_workout_session_with_loads(uuid,uuid,uuid,date,text,text,jsonb) to authenticated;

-- Endurece a eliminação definitiva: além das FKs para student_profiles(id), remove
-- audit logs que possam conter o ID do aluno ou da conta Auth em metadata.
create or replace function public.hard_delete_student_data(target_student_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile_id uuid;
  fk record;
begin
  if target_student_id is null then
    raise exception 'Aluno em falta.';
  end if;

  select sp.profile_id
    into target_profile_id
  from public.student_profiles sp
  where sp.id = target_student_id;

  if target_profile_id is null then
    raise exception 'Aluno não encontrado.';
  end if;

  delete from public.audit_logs al
  where al.actor_id = target_profile_id
     or al.entity_id = target_student_id
     or al.entity_id = target_profile_id
     or al.metadata::text like ('%' || target_student_id::text || '%')
     or al.metadata::text like ('%' || target_profile_id::text || '%');

  for fk in
    select
      child_ns.nspname as schema_name,
      child.relname as table_name,
      child_att.attname as column_name
    from pg_constraint con
    join pg_class child on child.oid = con.conrelid
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_class parent on parent.oid = con.confrelid
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    join lateral unnest(con.conkey) with ordinality ck(attnum, ord) on true
    join lateral unnest(con.confkey) with ordinality pk(attnum, ord) on pk.ord = ck.ord
    join pg_attribute child_att on child_att.attrelid = child.oid and child_att.attnum = ck.attnum
    join pg_attribute parent_att on parent_att.attrelid = parent.oid and parent_att.attnum = pk.attnum
    where con.contype = 'f'
      and parent_ns.nspname = 'public'
      and parent.relname = 'student_profiles'
      and parent_att.attname = 'id'
      and child_ns.nspname = 'public'
      and array_length(con.conkey, 1) = 1
    order by child_ns.nspname, child.relname
  loop
    execute format('delete from %I.%I where %I = $1', fk.schema_name, fk.table_name, fk.column_name)
      using target_student_id;
  end loop;

  delete from public.student_profiles where id = target_student_id;
  delete from public.profiles where id = target_profile_id;

  return target_profile_id;
end;
$$;

revoke all on function public.hard_delete_student_data(uuid) from public;
revoke execute on function public.hard_delete_student_data(uuid) from anon;
revoke execute on function public.hard_delete_student_data(uuid) from authenticated;
grant execute on function public.hard_delete_student_data(uuid) to service_role;

commit;
