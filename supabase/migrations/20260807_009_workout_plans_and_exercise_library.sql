-- ULTIMATE FIT APP
-- Migration 009: biblioteca real de exercícios + planos de treino estruturados
-- Data: 2026-08-07
-- Executar uma única vez depois das migrations 001-008A.

begin;

-- -----------------------------------------------------------------------------
-- 1. BIBLIOTECA DE EXERCÍCIOS
-- -----------------------------------------------------------------------------

create table if not exists public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  muscle_group text not null,
  secondary_muscles text[] not null default '{}'::text[],
  equipment text,
  category text,
  difficulty text,
  instructions text,
  media_path text,
  media_kind text,
  external_media_url text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_library_name_not_blank check (length(btrim(name)) > 1),
  constraint exercise_library_name_length check (char_length(name) <= 160),
  constraint exercise_library_group_length check (char_length(muscle_group) <= 100),
  constraint exercise_library_equipment_length check (equipment is null or char_length(equipment) <= 120),
  constraint exercise_library_category_length check (category is null or char_length(category) <= 80),
  constraint exercise_library_difficulty_valid check (
    difficulty is null or difficulty in ('Iniciante','Intermédio','Avançado')
  ),
  constraint exercise_library_media_kind_valid check (
    media_kind is null or media_kind in ('image','gif','video','external')
  )
);

create unique index if not exists exercise_library_name_uidx
  on public.exercise_library (lower(name));
create index if not exists exercise_library_group_idx
  on public.exercise_library (muscle_group);
create index if not exists exercise_library_active_idx
  on public.exercise_library (is_active)
  where is_active = true;

-- Biblioteca inicial. Pode ser editada/arquivada depois no Backoffice da app.
insert into public.exercise_library (name, muscle_group, equipment, category, difficulty, description)
values
('Agachamento Goblet','Pernas','Halter/Kettlebell','Força','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Agachamento Livre','Pernas','Barra','Força','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Agachamento Frontal','Pernas','Barra','Força','Avançado','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Leg Press','Pernas','Máquina','Hipertrofia','Iniciante','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Extensão de Pernas','Quadríceps','Máquina','Hipertrofia','Iniciante','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Curl Femoral','Posteriores','Máquina','Hipertrofia','Iniciante','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Peso Morto Romeno','Posteriores','Barra/Halteres','Força','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Hip Thrust','Glúteos','Barra','Hipertrofia','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Afundo Caminhado','Pernas','Halteres','Funcional','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Elevação de Gémeos','Gémeos','Máquina/Halteres','Hipertrofia','Iniciante','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Supino Plano','Peito','Barra','Força','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Supino Inclinado com Halteres','Peito','Halteres','Hipertrofia','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Crucifixo na Polia','Peito','Polia','Hipertrofia','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Flexões','Peito','Peso corporal','Funcional','Iniciante','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Remada Baixa','Costas','Polia','Hipertrofia','Iniciante','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Remada Curvada','Costas','Barra','Força','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Puxada Frontal','Costas','Polia','Hipertrofia','Iniciante','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Elevações na Barra','Costas','Peso corporal','Força','Avançado','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Desenvolvimento Militar','Ombros','Barra/Halteres','Força','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Elevação Lateral','Ombros','Halteres','Hipertrofia','Iniciante','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Face Pull','Ombros','Polia','Prevenção','Iniciante','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Curl Bíceps','Bíceps','Halteres','Hipertrofia','Iniciante','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Curl Martelo','Bíceps','Halteres','Hipertrofia','Iniciante','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Extensão de Tríceps na Polia','Tríceps','Polia','Hipertrofia','Iniciante','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Fundos em Paralelas','Tríceps','Peso corporal','Força','Avançado','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Prancha','Core','Peso corporal','Estabilidade','Iniciante','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Dead Bug','Core','Peso corporal','Estabilidade','Iniciante','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Pallof Press','Core','Polia/Banda','Estabilidade','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Russian Twist','Core','Peso corporal/Halter','Funcional','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Burpee','Corpo inteiro','Peso corporal','Condicionamento','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Kettlebell Swing','Corpo inteiro','Kettlebell','Funcional','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Thruster','Corpo inteiro','Barra/Halteres','Cross Training','Avançado','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Wall Ball','Corpo inteiro','Bola medicinal','Cross Training','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Box Jump','Pernas','Caixa','Pliometria','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Farmer Walk','Corpo inteiro','Halteres/Kettlebell','Funcional','Iniciante','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Sled Push','Corpo inteiro','Sled','Condicionamento','Intermédio','Executar com controlo, amplitude adequada e técnica definida pelo professor.'),
('Bike Erg','Cardio','Bicicleta','Cardio','Iniciante','Executar com controlo e intensidade definida pelo professor.'),
('Remo Ergómetro','Cardio','Remo','Cardio','Iniciante','Executar com controlo e intensidade definida pelo professor.'),
('Corrida em Passadeira','Cardio','Passadeira','Cardio','Iniciante','Executar com controlo e intensidade definida pelo professor.'),
('Mobilidade de Tornozelo','Mobilidade','Peso corporal','Mobilidade','Iniciante','Executar lentamente e sem dor.'),
('Rotação Torácica','Mobilidade','Peso corporal','Mobilidade','Iniciante','Executar lentamente e sem dor.'),
('90/90 da Anca','Mobilidade','Peso corporal','Mobilidade','Iniciante','Executar lentamente e sem dor.'),
('Alongamento Flexores da Anca','Alongamentos','Peso corporal','Alongamento','Iniciante','Manter respiração confortável e evitar dor.'),
('Alongamento Peitoral na Parede','Alongamentos','Parede','Alongamento','Iniciante','Manter respiração confortável e evitar dor.'),
('Child’s Pose','Alongamentos','Peso corporal','Alongamento','Iniciante','Manter respiração confortável e evitar dor.')
on conflict ((lower(name))) do nothing;

-- -----------------------------------------------------------------------------
-- 2. PLANOS, SESSÕES, BLOCOS E EXERCÍCIOS DO PLANO
-- -----------------------------------------------------------------------------

create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete restrict,
  trainer_id uuid references public.trainer_profiles(id) on delete set null,
  title text not null,
  description text,
  goal text,
  status text not null default 'draft',
  is_active boolean not null default true,
  start_date date,
  end_date date,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_plans_title_not_blank check (length(btrim(title)) > 1),
  constraint workout_plans_title_length check (char_length(title) <= 180),
  constraint workout_plans_status_valid check (status in ('draft','published','archived')),
  constraint workout_plans_dates_valid check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists workout_plans_student_idx
  on public.workout_plans (student_id, status, updated_at desc);
create index if not exists workout_plans_trainer_idx
  on public.workout_plans (trainer_id, updated_at desc);
create index if not exists workout_plans_active_idx
  on public.workout_plans (student_id, is_active)
  where status = 'published' and archived_at is null;

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  title text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_sessions_title_not_blank check (length(btrim(title)) > 0),
  constraint workout_sessions_sort_nonnegative check (sort_order >= 0)
);

create index if not exists workout_sessions_plan_idx
  on public.workout_sessions (plan_id, sort_order);

create table if not exists public.workout_blocks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  block_type text not null default 'standard',
  title text,
  rounds integer not null default 1,
  rest_after_seconds integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_blocks_type_valid check (block_type in ('standard','superset','circuit')),
  constraint workout_blocks_rounds_valid check (rounds between 1 and 50),
  constraint workout_blocks_rest_valid check (rest_after_seconds is null or rest_after_seconds between 0 and 3600),
  constraint workout_blocks_sort_nonnegative check (sort_order >= 0)
);

create index if not exists workout_blocks_session_idx
  on public.workout_blocks (session_id, sort_order);

create table if not exists public.workout_items (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.workout_blocks(id) on delete cascade,
  exercise_id uuid not null references public.exercise_library(id) on delete restrict,
  sort_order integer not null default 0,
  sets integer,
  reps text,
  duration_seconds integer,
  rest_seconds integer,
  tempo text,
  load_text text,
  rpe numeric(3,1),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_items_sets_valid check (sets is null or sets between 1 and 100),
  constraint workout_items_duration_valid check (duration_seconds is null or duration_seconds between 0 and 86400),
  constraint workout_items_rest_valid check (rest_seconds is null or rest_seconds between 0 and 3600),
  constraint workout_items_rpe_valid check (rpe is null or (rpe >= 0 and rpe <= 10)),
  constraint workout_items_sort_nonnegative check (sort_order >= 0)
);

create index if not exists workout_items_block_idx
  on public.workout_items (block_id, sort_order);
create index if not exists workout_items_exercise_idx
  on public.workout_items (exercise_id);

-- -----------------------------------------------------------------------------
-- 3. UPDATED_AT
-- -----------------------------------------------------------------------------

drop trigger if exists exercise_library_set_updated_at on public.exercise_library;
create trigger exercise_library_set_updated_at
before update on public.exercise_library
for each row execute function public.set_updated_at();

drop trigger if exists workout_plans_set_updated_at on public.workout_plans;
create trigger workout_plans_set_updated_at
before update on public.workout_plans
for each row execute function public.set_updated_at();

drop trigger if exists workout_sessions_set_updated_at on public.workout_sessions;
create trigger workout_sessions_set_updated_at
before update on public.workout_sessions
for each row execute function public.set_updated_at();

drop trigger if exists workout_blocks_set_updated_at on public.workout_blocks;
create trigger workout_blocks_set_updated_at
before update on public.workout_blocks
for each row execute function public.set_updated_at();

drop trigger if exists workout_items_set_updated_at on public.workout_items;
create trigger workout_items_set_updated_at
before update on public.workout_items
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. AUTORIZAÇÃO
-- -----------------------------------------------------------------------------

create or replace function public.can_manage_workout_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_student_id is null then false
    when public.is_admin() then true
    else public.trainer_has_student(target_student_id)
      and public.trainer_has_permission('manage_workout_plans')
  end;
$$;

create or replace function public.can_view_workout_plan(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when public.is_admin() then true
      when wp.student_id = public.current_student_id()
        then wp.status = 'published' and wp.archived_at is null
      else public.trainer_has_student(wp.student_id)
    end
    from public.workout_plans wp
    where wp.id = target_plan_id
    limit 1
  ), false);
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

create or replace function public.workout_plan_id_from_session(target_session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ws.plan_id from public.workout_sessions ws where ws.id = target_session_id limit 1;
$$;

create or replace function public.workout_plan_id_from_block(target_block_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ws.plan_id
  from public.workout_blocks wb
  join public.workout_sessions ws on ws.id = wb.session_id
  where wb.id = target_block_id
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC: GUARDAR PLANO COMPLETO DE FORMA ATÓMICA
-- -----------------------------------------------------------------------------

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
      start_date, end_date, created_by, updated_by, published_by, published_at
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
        case when block_payload->>'type' in ('standard','superset','circuit') then block_payload->>'type' else 'standard' end,
        nullif(btrim(coalesce(block_payload->>'title','')),''),
        greatest(1, least(50, coalesce(nullif(block_payload->>'rounds','')::integer,1))),
        nullif(block_payload->>'restAfterSeconds','')::integer,
        block_index
      ) returning id into created_block_id;

      item_index := 0;
      for item_payload in select value from jsonb_array_elements(coalesce(block_payload->'items','[]'::jsonb))
      loop
        if nullif(item_payload->>'exerciseId','') is not null then
          insert into public.workout_items (
            block_id, exercise_id, sort_order, sets, reps, duration_seconds,
            rest_seconds, tempo, load_text, rpe, notes
          ) values (
            created_block_id,
            (item_payload->>'exerciseId')::uuid,
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
    jsonb_build_object('student_id', target_student_id, 'status', requested_status));

  return target_plan_id;
end;
$$;

create or replace function public.archive_workout_plan(target_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_workout_plan(target_plan_id) then
    raise exception 'Sem permissão para arquivar este plano.';
  end if;

  update public.workout_plans
  set status = 'archived', is_active = false, archived_at = now(), updated_by = auth.uid()
  where id = target_plan_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. RLS
-- -----------------------------------------------------------------------------

alter table public.exercise_library enable row level security;
alter table public.workout_plans enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_blocks enable row level security;
alter table public.workout_items enable row level security;

-- Biblioteca: todos os utilizadores autenticados podem consultar. A gestão é
-- reservada à equipa com a permissão própria.
drop policy if exists exercise_library_select_authenticated on public.exercise_library;
create policy exercise_library_select_authenticated
on public.exercise_library for select to authenticated
using (true);

drop policy if exists exercise_library_insert_managers on public.exercise_library;
create policy exercise_library_insert_managers
on public.exercise_library for insert to authenticated
with check (public.is_admin() or public.trainer_has_permission('manage_exercise_library'));

drop policy if exists exercise_library_update_managers on public.exercise_library;
create policy exercise_library_update_managers
on public.exercise_library for update to authenticated
using (public.is_admin() or public.trainer_has_permission('manage_exercise_library'))
with check (public.is_admin() or public.trainer_has_permission('manage_exercise_library'));

drop policy if exists exercise_library_delete_admin on public.exercise_library;
create policy exercise_library_delete_admin
on public.exercise_library for delete to authenticated
using (public.is_admin());

-- Plano raiz.
drop policy if exists workout_plans_select on public.workout_plans;
create policy workout_plans_select
on public.workout_plans for select to authenticated
using (public.can_view_workout_plan(id));

drop policy if exists workout_plans_insert on public.workout_plans;
create policy workout_plans_insert
on public.workout_plans for insert to authenticated
with check (public.can_manage_workout_student(student_id));

drop policy if exists workout_plans_update on public.workout_plans;
create policy workout_plans_update
on public.workout_plans for update to authenticated
using (public.can_manage_workout_plan(id))
with check (public.can_manage_workout_student(student_id));

drop policy if exists workout_plans_delete on public.workout_plans;
create policy workout_plans_delete
on public.workout_plans for delete to authenticated
using (public.is_admin());

-- Sessões.
drop policy if exists workout_sessions_select on public.workout_sessions;
create policy workout_sessions_select
on public.workout_sessions for select to authenticated
using (public.can_view_workout_plan(plan_id));

drop policy if exists workout_sessions_insert on public.workout_sessions;
create policy workout_sessions_insert
on public.workout_sessions for insert to authenticated
with check (public.can_manage_workout_plan(plan_id));

drop policy if exists workout_sessions_update on public.workout_sessions;
create policy workout_sessions_update
on public.workout_sessions for update to authenticated
using (public.can_manage_workout_plan(plan_id))
with check (public.can_manage_workout_plan(plan_id));

drop policy if exists workout_sessions_delete on public.workout_sessions;
create policy workout_sessions_delete
on public.workout_sessions for delete to authenticated
using (public.can_manage_workout_plan(plan_id));

-- Blocos.
drop policy if exists workout_blocks_select on public.workout_blocks;
create policy workout_blocks_select
on public.workout_blocks for select to authenticated
using (public.can_view_workout_plan(public.workout_plan_id_from_session(session_id)));

drop policy if exists workout_blocks_insert on public.workout_blocks;
create policy workout_blocks_insert
on public.workout_blocks for insert to authenticated
with check (public.can_manage_workout_plan(public.workout_plan_id_from_session(session_id)));

drop policy if exists workout_blocks_update on public.workout_blocks;
create policy workout_blocks_update
on public.workout_blocks for update to authenticated
using (public.can_manage_workout_plan(public.workout_plan_id_from_session(session_id)))
with check (public.can_manage_workout_plan(public.workout_plan_id_from_session(session_id)));

drop policy if exists workout_blocks_delete on public.workout_blocks;
create policy workout_blocks_delete
on public.workout_blocks for delete to authenticated
using (public.can_manage_workout_plan(public.workout_plan_id_from_session(session_id)));

-- Itens.
drop policy if exists workout_items_select on public.workout_items;
create policy workout_items_select
on public.workout_items for select to authenticated
using (public.can_view_workout_plan(public.workout_plan_id_from_block(block_id)));

drop policy if exists workout_items_insert on public.workout_items;
create policy workout_items_insert
on public.workout_items for insert to authenticated
with check (public.can_manage_workout_plan(public.workout_plan_id_from_block(block_id)));

drop policy if exists workout_items_update on public.workout_items;
create policy workout_items_update
on public.workout_items for update to authenticated
using (public.can_manage_workout_plan(public.workout_plan_id_from_block(block_id)))
with check (public.can_manage_workout_plan(public.workout_plan_id_from_block(block_id)));

drop policy if exists workout_items_delete on public.workout_items;
create policy workout_items_delete
on public.workout_items for delete to authenticated
using (public.can_manage_workout_plan(public.workout_plan_id_from_block(block_id)));

-- -----------------------------------------------------------------------------
-- 7. STORAGE PARA DEMONSTRAÇÕES DE EXERCÍCIOS
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-media',
  'exercise-media',
  true,
  15728640,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists exercise_media_insert on storage.objects;
create policy exercise_media_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'exercise-media'
  and (public.is_admin() or public.trainer_has_permission('manage_exercise_library'))
);

drop policy if exists exercise_media_update on storage.objects;
create policy exercise_media_update
on storage.objects for update to authenticated
using (
  bucket_id = 'exercise-media'
  and (public.is_admin() or public.trainer_has_permission('manage_exercise_library'))
)
with check (
  bucket_id = 'exercise-media'
  and (public.is_admin() or public.trainer_has_permission('manage_exercise_library'))
);

drop policy if exists exercise_media_delete on storage.objects;
create policy exercise_media_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'exercise-media'
  and (public.is_admin() or public.trainer_has_permission('manage_exercise_library'))
);

-- -----------------------------------------------------------------------------
-- 8. GRANTS + FEATURE FLAGS
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on public.exercise_library to authenticated;
grant select, insert, update, delete on public.workout_plans to authenticated;
grant select, insert, update, delete on public.workout_sessions to authenticated;
grant select, insert, update, delete on public.workout_blocks to authenticated;
grant select, insert, update, delete on public.workout_items to authenticated;

grant execute on function public.can_manage_workout_student(uuid) to authenticated;
grant execute on function public.can_view_workout_plan(uuid) to authenticated;
grant execute on function public.can_manage_workout_plan(uuid) to authenticated;
grant execute on function public.workout_plan_id_from_session(uuid) to authenticated;
grant execute on function public.workout_plan_id_from_block(uuid) to authenticated;
grant execute on function public.save_workout_plan(jsonb) to authenticated;
grant execute on function public.archive_workout_plan(uuid) to authenticated;

insert into public.feature_flags (feature_key, is_enabled, allowed_roles, updated_by)
values
  ('workout_plans', true, array['admin','trainer','student']::public.app_role[], auth.uid()),
  ('exercise_library', true, array['admin','trainer','student']::public.app_role[], auth.uid())
on conflict (feature_key) do update
set is_enabled = excluded.is_enabled,
    allowed_roles = excluded.allowed_roles,
    updated_by = excluded.updated_by,
    updated_at = now();

commit;
