-- ULTIMATE FIT APP
-- Migration 010: taxonomia visual da biblioteca + séries especiais configuráveis
-- + importação consolidada Tecnofit/anexo 3 em PT-PT.
-- Data: 2026-08-08
-- Requer Migration 009.

begin;

-- 1. Normalização / deduplicação
create or replace function public.normalise_exercise_name(input_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare v text;
begin
  v := lower(coalesce(input_text,''));
  v := translate(v,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  );
  v := replace(v, 'desenvolvimento', 'press');
  v := replace(v, 'rosca', 'curl');
  v := replace(v, 'esteira', 'passadeira');
  v := replace(v, 'panturrilha', 'gemeos');
  v := replace(v, 'levantamento terra', 'peso morto');
  v := replace(v, 'levant. terra', 'peso morto');
  v := replace(v, 'pegada', 'pega');
  v := replace(v, 'halteres', 'halter');
  v := replace(v, 'flexoes', 'flexao');
  v := replace(v, 'flexao de bracos', 'flexao');
  v := replace(v, 'flexao de braco', 'flexao');
  v := replace(v, 'remada serrote', 'remada unilateral com halter');
  v := replace(v, 'supino reto', 'supino com barra');
  v := replace(v, 'supino plano', 'supino com barra');
  v := replace(v, 'agachamento livre barra', 'agachamento com barra');
  v := replace(v, 'agachamento barra', 'agachamento com barra');
  if btrim(v) = 'agachamento livre' then v := 'agachamento com barra'; end if;
  if btrim(v) = 'elevacoes na barra' then v := 'barra fixa'; end if;
  if btrim(v) = 'curl biceps' then v := 'curl de biceps'; end if;
  v := regexp_replace(v, '[^a-z0-9]+', ' ', 'g');
  v := regexp_replace(v, '\s+', ' ', 'g');
  return btrim(v);
end;
$$;

alter table public.exercise_library
  add column if not exists dedupe_key text,
  add column if not exists aliases text[] not null default '{}'::text[],
  add column if not exists source_refs jsonb not null default '{}'::jsonb;

update public.exercise_library
set source_refs = '{}'::jsonb
where source_refs is null or jsonb_typeof(source_refs) <> 'object';

with renames(old_name, new_name) as (
  values
  ('Agachamento Livre', 'Agachamento com barra'),
('Curl Femoral', 'Curl femoral'),
('Afundo Caminhado', 'Afundo caminhado'),
('Supino Plano', 'Supino com barra'),
('Crucifixo na Polia', 'Aberturas na polia'),
('Remada Curvada', 'Remada curvada'),
('Puxada Frontal', 'Puxada frontal'),
('Elevações na Barra', 'Barra fixa'),
('Desenvolvimento Militar', 'Press militar'),
('Elevação Lateral', 'Elevação lateral'),
('Curl Bíceps', 'Curl de bíceps'),
('Curl Martelo', 'Curl martelo'),
('Corrida em Passadeira', 'Corrida na passadeira'),
('Alongamento Flexores da Anca', 'Alongamento dos flexores da anca'),
('Flexão de braço (peito)', 'Flexões'),
('Remada serrote', 'Remada unilateral com halter'),
('Crucifixo Inverso', 'Voos posteriores'),
('Crucifixo Inverso na Máquina', 'Voos posteriores na máquina')
)
update public.exercise_library e
set name = r.new_name
from renames r
where lower(e.name) = lower(r.old_name);

-- Uniformiza grupos antigos da seed inicial.
update public.exercise_library
set muscle_group = case muscle_group
  when 'Peito' then 'Peitoral'
  when 'Core' then 'Abdominais'
  when 'Posteriores' then 'Isquiotibiais'
  when 'Corpo inteiro' then 'Funcional'
  else muscle_group
end;

update public.exercise_library
set dedupe_key = public.normalise_exercise_name(name)
where dedupe_key is null or dedupe_key = '';

-- Consolida duplicados existentes sem perder exercícios já usados em planos.
with ranked as (
  select id, dedupe_key,
         first_value(id) over (partition by dedupe_key order by created_at, id) as keep_id
  from public.exercise_library
),
dupes as (
  select id, keep_id from ranked where id <> keep_id and dedupe_key <> ''
)
update public.workout_items wi
set exercise_id = d.keep_id
from dupes d
where wi.exercise_id = d.id;

with ranked as (
  select id, dedupe_key,
         first_value(id) over (partition by dedupe_key order by created_at, id) as keep_id
  from public.exercise_library
)
delete from public.exercise_library e
using ranked r
where e.id = r.id and r.id <> r.keep_id and r.dedupe_key <> '';

create unique index if not exists exercise_library_dedupe_uidx
  on public.exercise_library (dedupe_key)
  where dedupe_key is not null and dedupe_key <> '';

create or replace function public.exercise_library_set_dedupe_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.dedupe_key := public.normalise_exercise_name(new.name);
  if new.dedupe_key = '' then raise exception 'O exercício precisa de um nome válido.'; end if;
  return new;
end;
$$;

drop trigger if exists exercise_library_dedupe_trigger on public.exercise_library;
create trigger exercise_library_dedupe_trigger
before insert or update of name on public.exercise_library
for each row execute function public.exercise_library_set_dedupe_key();

-- 2. Grupos musculares configuráveis
create table if not exists public.exercise_muscle_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  icon_key text not null default 'default',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_muscle_groups_name_check check (char_length(btrim(name)) between 2 and 80),
  constraint exercise_muscle_groups_slug_check check (slug ~ '^[a-z0-9-]+$')
);
create unique index if not exists exercise_muscle_groups_name_uidx on public.exercise_muscle_groups (lower(name));
create unique index if not exists exercise_muscle_groups_slug_uidx on public.exercise_muscle_groups (slug);

drop trigger if exists exercise_muscle_groups_set_updated_at on public.exercise_muscle_groups;
create trigger exercise_muscle_groups_set_updated_at
before update on public.exercise_muscle_groups
for each row execute function public.set_updated_at();

insert into public.exercise_muscle_groups (name, slug, icon_key, sort_order, is_system)
values
('Abdominais', 'abdominais', 'abdominals', 10, true),
('Cardio', 'cardio', 'cardio', 20, true),
('Antebraço', 'antebraco', 'forearm', 30, true),
('Bíceps', 'biceps', 'biceps', 40, true),
('Costas', 'costas', 'back', 50, true),
('Glúteos', 'gluteos', 'glutes', 60, true),
('Mobilidade', 'mobilidade', 'mobility', 70, true),
('Ombros', 'ombros', 'shoulders', 80, true),
('Peitoral', 'peitoral', 'chest', 90, true),
('Pernas', 'pernas', 'legs', 100, true),
('Alongamentos', 'alongamentos', 'stretching', 110, true),
('Trapézio', 'trapezio', 'traps', 120, true),
('Tríceps', 'triceps', 'triceps', 130, true),
('Quadríceps', 'quadriceps', 'quads', 140, true),
('Isquiotibiais', 'isquiotibiais', 'hamstrings', 150, true),
('Lombar', 'lombar', 'lower-back', 160, true),
('Gémeos', 'gemeos', 'calves', 170, true),
('Funcional', 'funcional', 'functional', 180, true),
('Adutores', 'adutores', 'adductors', 190, true),
('Abdutores', 'abdutores', 'abductors', 200, true)
on conflict (slug) do update
set name=excluded.name, icon_key=excluded.icon_key, sort_order=excluded.sort_order, is_active=true;

insert into public.exercise_muscle_groups (name, slug, icon_key, sort_order, is_system)
select distinct btrim(e.muscle_group),
       regexp_replace(public.normalise_exercise_name(e.muscle_group), '\s+', '-', 'g'),
       'default', 900, false
from public.exercise_library e
where btrim(coalesce(e.muscle_group,'')) <> ''
on conflict (slug) do nothing;

alter table public.exercise_library
  add column if not exists muscle_group_id uuid references public.exercise_muscle_groups(id) on delete restrict;

update public.exercise_library e
set muscle_group_id = g.id, muscle_group = g.name
from public.exercise_muscle_groups g
where lower(g.name)=lower(e.muscle_group) and e.muscle_group_id is null;

create index if not exists exercise_library_muscle_group_id_idx on public.exercise_library (muscle_group_id);

create or replace function public.sync_exercise_muscle_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare resolved_id uuid; resolved_name text;
begin
  if new.muscle_group_id is not null then
    select g.id,g.name into resolved_id,resolved_name
    from public.exercise_muscle_groups g
    where g.id=new.muscle_group_id and g.is_active=true;
  elsif btrim(coalesce(new.muscle_group,'')) <> '' then
    select g.id,g.name into resolved_id,resolved_name
    from public.exercise_muscle_groups g
    where lower(g.name)=lower(btrim(new.muscle_group)) and g.is_active=true limit 1;
  end if;
  if resolved_id is null then raise exception 'Seleciona um grupo muscular válido.'; end if;
  new.muscle_group_id := resolved_id;
  new.muscle_group := resolved_name;
  return new;
end;
$$;

drop trigger if exists exercise_library_group_sync_trigger on public.exercise_library;
create trigger exercise_library_group_sync_trigger
before insert or update of muscle_group_id, muscle_group on public.exercise_library
for each row execute function public.sync_exercise_muscle_group();

create or replace function public.propagate_muscle_group_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    update public.exercise_library
    set muscle_group = new.name
    where muscle_group_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists exercise_muscle_groups_propagate_name on public.exercise_muscle_groups;
create trigger exercise_muscle_groups_propagate_name
after update of name on public.exercise_muscle_groups
for each row execute function public.propagate_muscle_group_name();

-- 3. Tipos de série configuráveis
create table if not exists public.workout_block_types (
  code text primary key,
  name text not null,
  description text,
  icon_key text not null default 'layers',
  supports_rounds boolean not null default true,
  is_special boolean not null default true,
  is_system boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_block_types_code_check check (code ~ '^[a-z0-9-]+$'),
  constraint workout_block_types_name_check check (char_length(btrim(name)) between 2 and 80)
);
create unique index if not exists workout_block_types_name_uidx on public.workout_block_types (lower(name));

drop trigger if exists workout_block_types_set_updated_at on public.workout_block_types;
create trigger workout_block_types_set_updated_at
before update on public.workout_block_types
for each row execute function public.set_updated_at();

insert into public.workout_block_types
(code,name,description,icon_key,supports_rounds,is_special,is_system,is_active,sort_order)
values
('standard','Série normal','Série convencional de um ou mais exercícios.','plus',false,false,true,true,10),
('superset','Supersérie','Dois ou mais exercícios executados em sequência.','layers',true,true,true,true,20),
('circuit','Circuito','Conjunto de exercícios executado por voltas.','play',true,true,true,true,30)
on conflict (code) do update
set name=excluded.name,description=excluded.description,icon_key=excluded.icon_key,
    supports_rounds=excluded.supports_rounds,is_special=excluded.is_special,
    is_system=true,is_active=true,sort_order=excluded.sort_order;

alter table public.workout_blocks drop constraint if exists workout_blocks_type_valid;
alter table public.workout_blocks drop constraint if exists workout_blocks_block_type_fkey;
alter table public.workout_blocks
  add constraint workout_blocks_block_type_fkey
  foreign key (block_type) references public.workout_block_types(code)
  on update cascade on delete restrict;

create or replace function public.slugify_library_label(input_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(public.normalise_exercise_name(input_text), '\s+', '-', 'g'));
$$;

create or replace function public.workout_block_types_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare base_code text;
begin
  if tg_op='INSERT' and btrim(coalesce(new.code,''))='' then
    base_code := public.slugify_library_label(new.name);
    if base_code in ('standard','superset','circuit') then base_code := 'custom-'||base_code; end if;
    new.code := base_code;
  end if;
  if tg_op='UPDATE' and old.is_system=true then
    new.code := old.code; new.is_system := true;
  end if;
  return new;
end;
$$;
drop trigger if exists workout_block_types_prepare_trigger on public.workout_block_types;
create trigger workout_block_types_prepare_trigger
before insert or update on public.workout_block_types
for each row execute function public.workout_block_types_prepare();

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


-- 4. Importação consolidada e deduplicada (619 registos Excel + 134 do anexo 3 + biblioteca inicial)
-- Resultado canónico preparado: 693 exercícios, 515 com demonstração.
with incoming (
  name, group_name, equipment, category, difficulty, description,
  external_media_url, media_kind, aliases, source_refs
) as (
  values
('Ab Wheel', 'Abdominais', null, 'Estabilidade', null, null, null, null, ARRAY['Ab Wheel']::text[], '{"sources": ["annex3"], "original_names": ["Ab Wheel"]}'::jsonb),
('Ab Wheel em pé', 'Abdominais', null, 'Estabilidade', null, null, null, null, ARRAY['Ab Wheel em pé']::text[], '{"sources": ["annex3"], "original_names": ["Ab Wheel em pé"]}'::jsonb),
('Abdominal em banco inclinado', 'Abdominais', null, 'Estabilidade', null, null, null, null, ARRAY['Abdominal em banco inclinado']::text[], '{"sources": ["annex3"], "original_names": ["Abdominal em banco inclinado"]}'::jsonb),
('Abdominal na polia alta', 'Abdominais', 'Polia', 'Estabilidade', null, null, null, null, ARRAY['Abdominal na polia alta']::text[], '{"sources": ["annex3"], "original_names": ["Abdominal na polia alta"]}'::jsonb),
('Alternating Leg V-UP', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/akzTs3xuOIg', 'external', ARRAY['ALTERNATING LEG V-UP']::text[], '{"sources": ["tecnofit"], "original_names": ["ALTERNATING LEG V-UP"]}'::jsonb),
('Balanço', 'Abdominais', null, 'Estabilidade', null, null, 'https://youtu.be/3bXADQy3DTU', 'external', ARRAY['BALANÇO']::text[], '{"sources": ["tecnofit"], "original_names": ["BALANÇO"]}'::jsonb),
('Balanço + Peito na Barra com Uma Perna na Caixa', 'Abdominais', 'Barra', 'Estabilidade', null, null, 'https://youtu.be/o6b9jKL-5f4', 'external', ARRAY['BALANÇO + PEITO NA BARRA COM UMA PERNA NA CAIXA']::text[], '{"sources": ["tecnofit"], "original_names": ["BALANÇO + PEITO NA BARRA COM UMA PERNA NA CAIXA"]}'::jsonb),
('Balanço Hollow', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/GB9erBrlWSs', 'external', ARRAY['BALANÇO HOLLOW']::text[], '{"sources": ["tecnofit"], "original_names": ["BALANÇO HOLLOW"]}'::jsonb),
('Banco Lombar', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475585579.sd.mp4?s=872b7c5fe964ffea7a126935082b13a05cfd2c0b&profile_id=164', 'external', ARRAY['BANCO LOMBAR']::text[], '{"sources": ["tecnofit"], "original_names": ["BANCO LOMBAR"]}'::jsonb),
('Banco Vertical', 'Abdominais', null, 'Estabilidade', null, null, null, null, ARRAY['BANCO VERTICAL']::text[], '{"sources": ["tecnofit"], "original_names": ["BANCO VERTICAL"]}'::jsonb),
('Barbell Rollout', 'Abdominais', 'Barra', 'Estabilidade', null, null, 'https://youtu.be/ZcjXRhOsX1c', 'external', ARRAY['BARBELL ROLLOUT']::text[], '{"sources": ["tecnofit"], "original_names": ["BARBELL ROLLOUT"]}'::jsonb),
('Barra Balanço com 1 Perna na Caixa', 'Abdominais', 'Barra', 'Estabilidade', null, null, 'https://youtu.be/bL7LPMwPNAg', 'external', ARRAY['BARRA BALANÇO COM 1 PERNA NA CAIXA']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA BALANÇO COM 1 PERNA NA CAIXA"]}'::jsonb),
('Barra com Caixa', 'Abdominais', 'Barra', 'Estabilidade', null, null, 'https://youtu.be/Lguseq0ho5Y', 'external', ARRAY['BARRA COM CAIXA']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA COM CAIXA"]}'::jsonb),
('Box Aux. Hollow Strength', 'Abdominais', 'Caixa', 'Estabilidade', null, null, 'https://youtu.be/4yu5h_UQ_lA', 'external', ARRAY['BOX AUX. HOLLOW STRENGTH']::text[], '{"sources": ["tecnofit"], "original_names": ["BOX AUX. HOLLOW STRENGTH"]}'::jsonb),
('Caminhada para Prancha (Minhoca)', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/508be6c1-115e-4ba1-b86e-ddcc036705b7/playlist.m3u8', 'external', ARRAY['Caminhada para Prancha (Minhoca)']::text[], '{"sources": ["tecnofit"], "original_names": ["Caminhada para Prancha (Minhoca)"]}'::jsonb),
('Canivete', 'Abdominais', null, 'Estabilidade', null, null, null, null, ARRAY['CANIVETE']::text[], '{"sources": ["tecnofit"], "original_names": ["CANIVETE"]}'::jsonb),
('Chutes Alternados', 'Abdominais', null, 'Estabilidade', null, null, 'https://youtu.be/U1uA62V0MtM', 'external', ARRAY['CHUTES ALTERNADOS']::text[], '{"sources": ["tecnofit"], "original_names": ["CHUTES ALTERNADOS"]}'::jsonb),
('Circular Bola', 'Abdominais', 'Bola', 'Estabilidade', null, null, 'https://player.vimeo.com/external/475593942.sd.mp4?s=74dfcb0166cf81723ee5d00bed53b748b6edf6d3&profile_id=165', 'external', ARRAY['CIRCULAR BOLA']::text[], '{"sources": ["tecnofit"], "original_names": ["CIRCULAR BOLA"]}'::jsonb),
('Dead Bug', 'Abdominais', 'Peso corporal', 'Estabilidade', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://youtu.be/g_BYB0R-4Ws?si=mXy9Xo-tVDGEmSgS', 'external', ARRAY['Dead Bug']::text[], '{"sources": ["seed", "tecnofit"], "original_names": ["Dead Bug"]}'::jsonb),
('Dead Hang L-SIT Hold', 'Abdominais', null, 'Estabilidade', null, null, 'https://youtu.be/JQ_uBL9_3HQ', 'external', ARRAY['DEAD HANG L-SIT HOLD']::text[], '{"sources": ["tecnofit"], "original_names": ["DEAD HANG L-SIT HOLD"]}'::jsonb),
('Dragão Flag com Pernas Dobradas', 'Abdominais', null, 'Estabilidade', null, null, 'https://youtu.be/OlzlRKjOUr4', 'external', ARRAY['DRAGÃO FLAG COM PERNAS DOBRADAS']::text[], '{"sources": ["tecnofit"], "original_names": ["DRAGÃO FLAG COM PERNAS DOBRADAS"]}'::jsonb),
('Elevação de Pernas', 'Abdominais', null, 'Estabilidade', null, null, 'https://youtu.be/akzTs3xuOIg', 'external', ARRAY['ELEVAÇÃO DE PERNAS']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÃO DE PERNAS"]}'::jsonb),
('Elevação de pernas suspenso na barra', 'Abdominais', 'Barra', 'Estabilidade', null, null, null, null, ARRAY['Elevação de pernas suspenso na barra']::text[], '{"sources": ["annex3"], "original_names": ["Elevação de pernas suspenso na barra"]}'::jsonb),
('Encolhido na Paralela', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475602207.sd.mp4?s=e97c4c7244fb59b711e464748805bf4aa7eaae05&profile_id=165', 'external', ARRAY['ENCOLHIDO NA PARALELA']::text[], '{"sources": ["tecnofit"], "original_names": ["ENCOLHIDO NA PARALELA"]}'::jsonb),
('Estendido na Paralela', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475604855.sd.mp4?s=66efd056a6019497701216cf77faf04e19fb763b&profile_id=165', 'external', ARRAY['ESTENDIDO NA PARALELA']::text[], '{"sources": ["tecnofit"], "original_names": ["ESTENDIDO NA PARALELA"]}'::jsonb),
('Estrela', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475619014.sd.mp4?s=ed81003ad38b4cf1c6f90b163d386a8f1225e2ab&profile_id=164', 'external', ARRAY['ESTRELA']::text[], '{"sources": ["tecnofit"], "original_names": ["ESTRELA"]}'::jsonb),
('Extensao Lombar Bola', 'Abdominais', 'Bola', 'Estabilidade', null, null, 'https://player.vimeo.com/external/475619171.sd.mp4?s=825c94b843fe1f1ff2c8f328447e0a2f5c743a30&profile_id=164', 'external', ARRAY['EXTENSAO LOMBAR BOLA']::text[], '{"sources": ["tecnofit"], "original_names": ["EXTENSAO LOMBAR BOLA"]}'::jsonb),
('Extensão Lombar', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475585607.sd.mp4?s=a06bd917d478a99761b1f4172887a4c458e633fe&profile_id=164', 'external', ARRAY['EXTENSÃO LOMBAR']::text[], '{"sources": ["tecnofit"], "original_names": ["EXTENSÃO LOMBAR"]}'::jsonb),
('Flexão da anca em banco inclinado', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, null, null, ARRAY['Flexão da anca em banco inclinado']::text[], '{"sources": ["annex3"], "original_names": ["Flexão da anca em banco inclinado"]}'::jsonb),
('Flexão da anca em banco plano', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, null, null, ARRAY['Flexão da anca em banco plano']::text[], '{"sources": ["annex3"], "original_names": ["Flexão da anca em banco plano"]}'::jsonb),
('Flutter Kicks', 'Abdominais', null, 'Estabilidade', null, null, 'https://youtu.be/U1uA62V0MtM', 'external', ARRAY['FLUTTER KICKS','Flutter Kicks']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["FLUTTER KICKS", "Flutter Kicks"]}'::jsonb),
('Hang Hollow Hold', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/F678ZtrEF00', 'external', ARRAY['HANG HOLLOW HOLD']::text[], '{"sources": ["tecnofit"], "original_names": ["HANG HOLLOW HOLD"]}'::jsonb),
('High Plank', 'Abdominais', null, 'Estabilidade', null, null, 'https://youtu.be/8BhjWtNrZP0', 'external', ARRAY['HIGH PLANK']::text[], '{"sources": ["tecnofit"], "original_names": ["HIGH PLANK"]}'::jsonb),
('Hollow', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/Wt-7KqXLJCQ', 'external', ARRAY['HOLLOW']::text[], '{"sources": ["tecnofit"], "original_names": ["HOLLOW"]}'::jsonb),
('Hollow Body Plate Pull Over', 'Abdominais', 'Anilha', 'Estabilidade', null, null, 'https://youtu.be/GGlrZa4vdE0', 'external', ARRAY['HOLLOW BODY PLATE PULL OVER']::text[], '{"sources": ["tecnofit"], "original_names": ["HOLLOW BODY PLATE PULL OVER"]}'::jsonb),
('Hollow com Barra', 'Abdominais', 'Barra', 'Estabilidade', null, null, 'https://youtu.be/c2obJJGTjPM', 'external', ARRAY['HOLLOW COM BARRA']::text[], '{"sources": ["tecnofit"], "original_names": ["HOLLOW COM BARRA"]}'::jsonb),
('Hollow Hold', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/Wt-7KqXLJCQ', 'external', ARRAY['HOLLOW HOLD']::text[], '{"sources": ["tecnofit"], "original_names": ["HOLLOW HOLD"]}'::jsonb),
('Hollow Hold + Arch Hold', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/VyEyDfapuSg', 'external', ARRAY['HOLLOW HOLD + ARCH HOLD']::text[], '{"sources": ["tecnofit"], "original_names": ["HOLLOW HOLD + ARCH HOLD"]}'::jsonb),
('Hollow Hold com Anilha', 'Abdominais', 'Anilha', 'Estabilidade', null, null, 'https://youtu.be/qxK9ZuLTvNY', 'external', ARRAY['HOLLOW HOLD COM ANILHA']::text[], '{"sources": ["tecnofit"], "original_names": ["HOLLOW HOLD COM ANILHA"]}'::jsonb),
('Hollow Hold With Plate', 'Abdominais', 'Anilha', 'Estabilidade', null, null, 'https://youtu.be/qxK9ZuLTvNY', 'external', ARRAY['HOLLOW HOLD WITH PLATE']::text[], '{"sources": ["tecnofit"], "original_names": ["HOLLOW HOLD WITH PLATE"]}'::jsonb),
('Hollow Pendurado', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/F678ZtrEF00', 'external', ARRAY['HOLLOW PENDURADO']::text[], '{"sources": ["tecnofit"], "original_names": ["HOLLOW PENDURADO"]}'::jsonb),
('Hollow Rock', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/GB9erBrlWSs', 'external', ARRAY['HOLLOW ROCK']::text[], '{"sources": ["tecnofit"], "original_names": ["HOLLOW ROCK"]}'::jsonb),
('Hollow Superman Hollow Superman', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/VyEyDfapuSg', 'external', ARRAY['HOLLOW SUPERMAN HOLLOW SUPERMAN']::text[], '{"sources": ["tecnofit"], "original_names": ["HOLLOW SUPERMAN HOLLOW SUPERMAN"]}'::jsonb),
('Hollow With PVC', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/c2obJJGTjPM', 'external', ARRAY['HOLLOW WITH PVC']::text[], '{"sources": ["tecnofit"], "original_names": ["HOLLOW WITH PVC"]}'::jsonb),
('Infra', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475615633.sd.mp4?s=6de4c02481d0784a4c466e2f22fe454f79753f2f&profile_id=164', 'external', ARRAY['INFRA']::text[], '{"sources": ["tecnofit"], "original_names": ["INFRA"]}'::jsonb),
('Infra (versão Variada)', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475615597.sd.mp4?s=30407cf5ecc47ac706703521b48b38c4aa4e14d9&profile_id=164', 'external', ARRAY['INFRA (VERSÃO VARIADA)']::text[], '{"sources": ["tecnofit"], "original_names": ["INFRA (VERSÃO VARIADA)"]}'::jsonb),
('Infra Alternado', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475596150.sd.mp4?s=c0d47a8711ce93fffd940078bcc00ddd6f934c63&profile_id=164', 'external', ARRAY['INFRA ALTERNADO']::text[], '{"sources": ["tecnofit"], "original_names": ["INFRA ALTERNADO"]}'::jsonb),
('Infra Banco', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475607061.sd.mp4?s=018d389a5dac88b401d75f6b19d71ff627951740&profile_id=164', 'external', ARRAY['INFRA BANCO']::text[], '{"sources": ["tecnofit"], "original_names": ["INFRA BANCO"]}'::jsonb),
('Infra Banco Declinado', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475608336.sd.mp4?s=12f0a70ea299c0df8abb6dbd7f811cf8592268bf&profile_id=164', 'external', ARRAY['INFRA BANCO DECLINADO']::text[], '{"sources": ["tecnofit"], "original_names": ["INFRA BANCO DECLINADO"]}'::jsonb),
('Infra Bicicleta', 'Abdominais', 'Bicicleta', 'Estabilidade', null, null, 'https://player.vimeo.com/external/475591288.sd.mp4?s=7bd3329b3ee6fd323a4ecfae4c558c64435a23d4&profile_id=164', 'external', ARRAY['INFRA BICICLETA']::text[], '{"sources": ["tecnofit"], "original_names": ["INFRA BICICLETA"]}'::jsonb),
('Infra Bola', 'Abdominais', 'Bola', 'Estabilidade', null, null, 'https://player.vimeo.com/external/475619628.sd.mp4?s=d3dddcdeaccff66a6e63ed5caf42b7e1c48f94b4&profile_id=165', 'external', ARRAY['INFRA BOLA']::text[], '{"sources": ["tecnofit"], "original_names": ["INFRA BOLA"]}'::jsonb),
('Infra Paralela', 'Abdominais', null, 'Estabilidade', null, null, null, null, ARRAY['INFRA PARALELA']::text[], '{"sources": ["tecnofit"], "original_names": ["INFRA PARALELA"]}'::jsonb),
('Infra Prancha', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://player.vimeo.com/external/475612857.sd.mp4?s=8bcab98babc61e299ffcab458f0c34d2d400c678&profile_id=164', 'external', ARRAY['INFRA PRANCHA']::text[], '{"sources": ["tecnofit"], "original_names": ["INFRA PRANCHA"]}'::jsonb),
('Infra Solo', 'Abdominais', null, 'Estabilidade', null, null, null, null, ARRAY['INFRA SOLO']::text[], '{"sources": ["tecnofit"], "original_names": ["INFRA SOLO"]}'::jsonb),
('KB Plank Pull Through', 'Abdominais', 'Kettlebell', 'Estabilidade', null, null, 'https://youtu.be/XlK2gf9cAPM', 'external', ARRAY['KB PLANK PULL THROUGH']::text[], '{"sources": ["tecnofit"], "original_names": ["KB PLANK PULL THROUGH"]}'::jsonb),
('Kip Swing + C2B One Leg On The Box', 'Abdominais', 'Caixa', 'Estabilidade', null, null, 'https://youtu.be/o6b9jKL-5f4', 'external', ARRAY['KIP SWING + C2B ONE LEG ON THE BOX']::text[], '{"sources": ["tecnofit"], "original_names": ["KIP SWING + C2B ONE LEG ON THE BOX"]}'::jsonb),
('Kip Swing One Leg On The Box', 'Abdominais', 'Caixa', 'Estabilidade', null, null, 'https://youtu.be/bL7LPMwPNAg', 'external', ARRAY['KIP SWING ONE LEG ON THE BOX']::text[], '{"sources": ["tecnofit"], "original_names": ["KIP SWING ONE LEG ON THE BOX"]}'::jsonb),
('Kipping', 'Abdominais', null, 'Estabilidade', null, null, 'https://youtu.be/3bXADQy3DTU', 'external', ARRAY['KIPPING']::text[], '{"sources": ["tecnofit"], "original_names": ["KIPPING"]}'::jsonb),
('Kipping On Box', 'Abdominais', 'Caixa', 'Estabilidade', null, null, 'https://youtu.be/Lguseq0ho5Y', 'external', ARRAY['KIPPING ON BOX']::text[], '{"sources": ["tecnofit"], "original_names": ["KIPPING ON BOX"]}'::jsonb),
('L-SIT', 'Abdominais', null, 'Estabilidade', null, null, 'https://youtu.be/JQ_uBL9_3HQ', 'external', ARRAY['L-SIT']::text[], '{"sources": ["tecnofit"], "original_names": ["L-SIT"]}'::jsonb),
('Lateral Sentado', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475620611.sd.mp4?s=87220eb74743529a4684ff7f948835e74afaaa29&profile_id=165', 'external', ARRAY['LATERAL SENTADO']::text[], '{"sources": ["tecnofit"], "original_names": ["LATERAL SENTADO"]}'::jsonb),
('Leg Raise', 'Abdominais', null, 'Estabilidade', null, null, 'https://youtube.com/watch?v=fbGDQGHxvHk?si=eKOIol_HV0uUC3we', 'external', ARRAY['Leg Raise']::text[], '{"sources": ["tecnofit"], "original_names": ["Leg Raise"]}'::jsonb),
('Medball Hollow Hold', 'Abdominais', 'Halteres', 'Estabilidade', null, null, 'https://youtu.be/haF9zLUsHfg', 'external', ARRAY['MEDBALL HOLLOW HOLD']::text[], '{"sources": ["tecnofit"], "original_names": ["MEDBALL HOLLOW HOLD"]}'::jsonb),
('Medball V-UPS', 'Abdominais', 'Halteres', 'Estabilidade', null, null, 'https://youtu.be/OsLCHgLjsYM', 'external', ARRAY['MEDBALL V-UPS']::text[], '{"sources": ["tecnofit"], "original_names": ["MEDBALL V-UPS"]}'::jsonb),
('Obliquo Bola', 'Abdominais', 'Bola', 'Estabilidade', null, null, 'https://player.vimeo.com/external/475619578.sd.mp4?s=f4a93880181c885427b53cd11c1c0c5114957243&profile_id=164', 'external', ARRAY['OBLIQUO BOLA']::text[], '{"sources": ["tecnofit"], "original_names": ["OBLIQUO BOLA"]}'::jsonb),
('Obliquo Maq', 'Abdominais', null, 'Estabilidade', null, null, null, null, ARRAY['OBLIQUO MAQ']::text[], '{"sources": ["tecnofit"], "original_names": ["OBLIQUO MAQ"]}'::jsonb),
('Obliquo Paralela', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475604863.sd.mp4?s=9196cb722257507062a50c7e7a2379eb7b5d99da&profile_id=164', 'external', ARRAY['OBLIQUO PARALELA']::text[], '{"sources": ["tecnofit"], "original_names": ["OBLIQUO PARALELA"]}'::jsonb),
('Obliquo Prancha', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, null, null, ARRAY['OBLIQUO PRANCHA']::text[], '{"sources": ["tecnofit"], "original_names": ["OBLIQUO PRANCHA"]}'::jsonb),
('Obliquo Solo', 'Abdominais', null, 'Estabilidade', null, null, null, null, ARRAY['OBLIQUO SOLO']::text[], '{"sources": ["tecnofit"], "original_names": ["OBLIQUO SOLO"]}'::jsonb),
('Oblíquo Banco', 'Abdominais', null, 'Estabilidade', null, null, null, null, ARRAY['OBLÍQUO BANCO']::text[], '{"sources": ["tecnofit"], "original_names": ["OBLÍQUO BANCO"]}'::jsonb),
('Oblíquo Unilateral', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475594017.sd.mp4?s=148258c3c717e9206909deed0dc7a1466f2169fe&profile_id=165', 'external', ARRAY['OBLÍQUO UNILATERAL']::text[], '{"sources": ["tecnofit"], "original_names": ["OBLÍQUO UNILATERAL"]}'::jsonb),
('OH Sit Up', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/l8pVn5nH_nI', 'external', ARRAY['OH SIT UP']::text[], '{"sources": ["tecnofit"], "original_names": ["OH SIT UP"]}'::jsonb),
('Pallof Press', 'Abdominais', 'Polia/Banda', 'Estabilidade', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Pallof Press']::text[], '{"sources": ["seed"], "original_names": ["Pallof Press"]}'::jsonb),
('Plank Straight Arms On The Ring', 'Abdominais', 'Argolas', 'Estabilidade', null, null, 'https://youtu.be/3dIBbGcMm7c', 'external', ARRAY['PLANK STRAIGHT ARMS ON THE RING']::text[], '{"sources": ["tecnofit"], "original_names": ["PLANK STRAIGHT ARMS ON THE RING"]}'::jsonb),
('Plank Up Down', 'Abdominais', null, 'Estabilidade', null, null, 'https://youtu.be/ScOOeWLLdMk', 'external', ARRAY['PLANK UP DOWN']::text[], '{"sources": ["tecnofit"], "original_names": ["PLANK UP DOWN"]}'::jsonb),
('Prancha', 'Abdominais', 'Peso corporal', 'Estabilidade', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/475612857.sd.mp4?s=8bcab98babc61e299ffcab458f0c34d2d400c678&profile_id=164', 'external', ARRAY['PRANCHA','PRANCHA ISOMETRICA','PRANCHA VENTRAL','Prancha','Prancha (Apoio Antebraço)']::text[], '{"sources": ["annex3", "seed", "tecnofit"], "original_names": ["PRANCHA", "PRANCHA ISOMETRICA", "PRANCHA VENTRAL", "Prancha", "Prancha (Apoio Antebraço)"]}'::jsonb),
('Prancha Alta', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/8BhjWtNrZP0', 'external', ARRAY['PRANCHA ALTA']::text[], '{"sources": ["tecnofit"], "original_names": ["PRANCHA ALTA"]}'::jsonb),
('Prancha Andando', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://player.vimeo.com/external/475612853.sd.mp4?s=57adf6f456c3ad7c8e0f75e84683f33dc5425657&profile_id=165', 'external', ARRAY['PRANCHA ANDANDO']::text[], '{"sources": ["tecnofit"], "original_names": ["PRANCHA ANDANDO"]}'::jsonb),
('Prancha com Anilha', 'Abdominais', 'Anilha', 'Estabilidade', null, null, 'https://youtu.be/_Ds21fwcULo', 'external', ARRAY['PRANCHA COM ANILHA']::text[], '{"sources": ["tecnofit"], "original_names": ["PRANCHA COM ANILHA"]}'::jsonb),
('Prancha com Braços Extendidos', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://vimeo.com/896527918/d2be8f4ce5', 'external', ARRAY['Prancha com Braços Extendidos']::text[], '{"sources": ["tecnofit"], "original_names": ["Prancha com Braços Extendidos"]}'::jsonb),
('Prancha com Passagem de Halter', 'Abdominais', 'Halteres', 'Estabilidade', null, null, 'https://youtu.be/XlK2gf9cAPM', 'external', ARRAY['PRANCHA COM PASSAGEM DE HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["PRANCHA COM PASSAGEM DE HALTER"]}'::jsonb),
('Prancha com Remada', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/5156ac50-4a3f-49e4-aa49-9c78a031a490/playlist.m3u8', 'external', ARRAY['Prancha com Remada']::text[], '{"sources": ["tecnofit"], "original_names": ["Prancha com Remada"]}'::jsonb),
('Prancha com Subida e Descida', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/ScOOeWLLdMk', 'external', ARRAY['PRANCHA COM SUBIDA E DESCIDA']::text[], '{"sources": ["tecnofit"], "original_names": ["PRANCHA COM SUBIDA E DESCIDA"]}'::jsonb),
('Prancha Dinâmica Up/Down', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://vimeo.com/820145864/cfff98ff53', 'external', ARRAY['Prancha Dinâmica Up/Down']::text[], '{"sources": ["tecnofit"], "original_names": ["Prancha Dinâmica Up/Down"]}'::jsonb),
('Prancha Dorsal', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, null, null, ARRAY['PRANCHA DORSAL']::text[], '{"sources": ["tecnofit"], "original_names": ["PRANCHA DORSAL"]}'::jsonb),
('Prancha Dorsal Isométrica', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/3bc9249f-60ef-47ac-b6ec-7d36caab0921/playlist.m3u8', 'external', ARRAY['Prancha Dorsal Isométrica']::text[], '{"sources": ["tecnofit"], "original_names": ["Prancha Dorsal Isométrica"]}'::jsonb),
('Prancha Estrela', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/7A9HMemhxyA', 'external', ARRAY['PRANCHA ESTRELA']::text[], '{"sources": ["tecnofit"], "original_names": ["PRANCHA ESTRELA"]}'::jsonb),
('Prancha Frontal (cotovelo/mão)', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://player.vimeo.com/external/475612083.sd.mp4?s=fa272006c20578920e7dd4f3465c68f85db10264&profile_id=164', 'external', ARRAY['PRANCHA FRONTAL (COTOVELO/MÃO)']::text[], '{"sources": ["tecnofit"], "original_names": ["PRANCHA FRONTAL (COTOVELO/MÃO)"]}'::jsonb),
('Prancha lateral', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/D8sJhVOht-0', 'external', ARRAY['PRANCHA LATERAL','Prancha lateral']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["PRANCHA LATERAL", "Prancha lateral"]}'::jsonb),
('Prancha Lateral Dinâmica', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://player.vimeo.com/external/475617430.sd.mp4?s=839dd37ed7d1e66d5d030a4cf910de0ebd3d50e4&profile_id=164', 'external', ARRAY['PRANCHA LATERAL DINÂMICA']::text[], '{"sources": ["tecnofit"], "original_names": ["PRANCHA LATERAL DINÂMICA"]}'::jsonb),
('Prancha Nas Argolas', 'Abdominais', 'Argolas', 'Estabilidade', null, null, 'https://youtu.be/3dIBbGcMm7c', 'external', ARRAY['PRANCHA NAS ARGOLAS']::text[], '{"sources": ["tecnofit"], "original_names": ["PRANCHA NAS ARGOLAS"]}'::jsonb),
('Prancha Tocando Os Ombros', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://player.vimeo.com/external/475617224.sd.mp4?s=852be97273749d48ae40c6bd14c2b35a5f141591&profile_id=164', 'external', ARRAY['PRANCHA TOCANDO OS OMBROS']::text[], '{"sources": ["tecnofit"], "original_names": ["PRANCHA TOCANDO OS OMBROS"]}'::jsonb),
('Pull Over', 'Abdominais', null, 'Estabilidade', null, null, 'https://vimeo.com/820144040/aed2b70dc6', 'external', ARRAY['PULL OVER']::text[], '{"sources": ["tecnofit"], "original_names": ["PULL OVER"]}'::jsonb),
('Reverse Crunch', 'Abdominais', null, 'Estabilidade', null, null, 'https://youtu.be/M8dbzkbfEtM', 'external', ARRAY['REVERSE CRUNCH']::text[], '{"sources": ["tecnofit"], "original_names": ["REVERSE CRUNCH"]}'::jsonb),
('Ring Rollout', 'Abdominais', 'Argolas', 'Estabilidade', null, null, 'https://youtu.be/cVpFUulYVAI', 'external', ARRAY['RING ROLLOUT']::text[], '{"sources": ["tecnofit"], "original_names": ["RING ROLLOUT"]}'::jsonb),
('Rolamento com Barra', 'Abdominais', 'Barra', 'Estabilidade', null, null, 'https://youtu.be/ZcjXRhOsX1c', 'external', ARRAY['ROLAMENTO COM BARRA']::text[], '{"sources": ["tecnofit"], "original_names": ["ROLAMENTO COM BARRA"]}'::jsonb),
('Rolamento Nas Argolas', 'Abdominais', 'Argolas', 'Estabilidade', null, null, 'https://youtu.be/cVpFUulYVAI', 'external', ARRAY['ROLAMENTO NAS ARGOLAS']::text[], '{"sources": ["tecnofit"], "original_names": ["ROLAMENTO NAS ARGOLAS"]}'::jsonb),
('Rotação do tronco com bastão', 'Abdominais', null, 'Estabilidade', null, null, null, null, ARRAY['Rotação do tronco com bastão']::text[], '{"sources": ["annex3"], "original_names": ["Rotação do tronco com bastão"]}'::jsonb),
('Russian Twist', 'Abdominais', 'Peso corporal/Halter', 'Funcional', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/475616887.sd.mp4?s=bf2ea1cd49441504033e468d4e000fcfb8dd675a&profile_id=164', 'external', ARRAY['RUSSO','Russian Twist']::text[], '{"sources": ["annex3", "seed", "tecnofit"], "original_names": ["RUSSO", "Russian Twist"]}'::jsonb),
('Side Plank', 'Abdominais', null, 'Estabilidade', null, null, 'https://youtu.be/D8sJhVOht-0', 'external', ARRAY['SIDE PLANK']::text[], '{"sources": ["tecnofit"], "original_names": ["SIDE PLANK"]}'::jsonb),
('Sit Up', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://player.vimeo.com/external/475617624.sd.mp4?s=91271a50d081b5feca6aca35e6121ddc3f352c72&profile_id=164', 'external', ARRAY['SIT UP']::text[], '{"sources": ["tecnofit"], "original_names": ["SIT UP"]}'::jsonb),
('Six Inches', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475617665.sd.mp4?s=dc85b088ba78fcbf1747be8726ee0fc8b385ffaa&profile_id=164', 'external', ARRAY['SIX INCHES']::text[], '{"sources": ["tecnofit"], "original_names": ["SIX INCHES"]}'::jsonb),
('Spell Caster', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475617755.sd.mp4?s=10432cce67b85f921e87478db0c61a8217eb2880&profile_id=165', 'external', ARRAY['SPELL CASTER']::text[], '{"sources": ["tecnofit"], "original_names": ["SPELL CASTER"]}'::jsonb),
('Star Plank Hold', 'Abdominais', null, 'Estabilidade', null, null, 'https://youtu.be/7A9HMemhxyA', 'external', ARRAY['STAR PLANK HOLD']::text[], '{"sources": ["tecnofit"], "original_names": ["STAR PLANK HOLD"]}'::jsonb),
('Supra', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475594128.sd.mp4?s=262410029b9a0ee9f6c172d0b60c78288a42cfb6&profile_id=165', 'external', ARRAY['SUPRA']::text[], '{"sources": ["tecnofit"], "original_names": ["SUPRA"]}'::jsonb),
('Supra Banco Declinado', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/537375300.sd.mp4?s=6cc1aa4e1f11252846d648014bdfde520a3d6517&profile_id=164', 'external', ARRAY['SUPRA BANCO DECLINADO']::text[], '{"sources": ["tecnofit"], "original_names": ["SUPRA BANCO DECLINADO"]}'::jsonb),
('Supra Bola', 'Abdominais', 'Bola', 'Estabilidade', null, null, 'https://player.vimeo.com/external/475619536.sd.mp4?s=3aca6d86150fce8cab1c743ec5923d9e5cb26738&profile_id=165', 'external', ARRAY['SUPRA BOLA']::text[], '{"sources": ["tecnofit"], "original_names": ["SUPRA BOLA"]}'::jsonb),
('Supra Maquina', 'Abdominais', 'Máquina', 'Estabilidade', null, null, null, null, ARRAY['SUPRA MAQUINA']::text[], '{"sources": ["tecnofit"], "original_names": ["SUPRA MAQUINA"]}'::jsonb),
('Supra Pernas Elevadas', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475589835.sd.mp4?s=c2d39338e43a2cde3afd89d05e60892412acfb56&profile_id=165', 'external', ARRAY['SUPRA PERNAS ELEVADAS']::text[], '{"sources": ["tecnofit"], "original_names": ["SUPRA PERNAS ELEVADAS"]}'::jsonb),
('Supra Prancha', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://player.vimeo.com/external/475612857.sd.mp4?s=8bcab98babc61e299ffcab458f0c34d2d400c678&profile_id=164', 'external', ARRAY['SUPRA PRANCHA']::text[], '{"sources": ["tecnofit"], "original_names": ["SUPRA PRANCHA"]}'::jsonb),
('Supra Pulley', 'Abdominais', null, 'Estabilidade', null, null, null, null, ARRAY['SUPRA PULLEY']::text[], '{"sources": ["tecnofit"], "original_names": ["SUPRA PULLEY"]}'::jsonb),
('Supra Solo', 'Abdominais', null, 'Estabilidade', null, null, null, null, ARRAY['SUPRA SOLO']::text[], '{"sources": ["tecnofit"], "original_names": ["SUPRA SOLO"]}'::jsonb),
('Sustentação Hollow com Apoio de Caixa', 'Abdominais', 'Caixa', 'Estabilidade', null, null, 'https://youtu.be/4yu5h_UQ_lA', 'external', ARRAY['SUSTENTAÇÃO HOLLOW COM APOIO DE CAIXA']::text[], '{"sources": ["tecnofit"], "original_names": ["SUSTENTAÇÃO HOLLOW COM APOIO DE CAIXA"]}'::jsonb),
('Sustentação Hollow com Medball', 'Abdominais', 'Halteres', 'Estabilidade', null, null, 'https://youtu.be/haF9zLUsHfg', 'external', ARRAY['SUSTENTAÇÃO HOLLOW COM MEDBALL']::text[], '{"sources": ["tecnofit"], "original_names": ["SUSTENTAÇÃO HOLLOW COM MEDBALL"]}'::jsonb),
('Tesoura', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475616927.sd.mp4?s=11edd5d723dc7e750c5775caf788efac65ca4290&profile_id=164', 'external', ARRAY['TESOURA']::text[], '{"sources": ["tecnofit"], "original_names": ["TESOURA"]}'::jsonb),
('Tuck Dragon Flag Rise', 'Abdominais', null, 'Estabilidade', null, null, 'https://youtu.be/OlzlRKjOUr4', 'external', ARRAY['TUCK DRAGON FLAG RISE']::text[], '{"sources": ["tecnofit"], "original_names": ["TUCK DRAGON FLAG RISE"]}'::jsonb),
('V Punch', 'Abdominais', null, 'Estabilidade', null, null, 'https://player.vimeo.com/external/475620634.sd.mp4?s=7ce56001e43fc7c7e7eb4dbb977fad573205f898&profile_id=165', 'external', ARRAY['V PUNCH']::text[], '{"sources": ["tecnofit"], "original_names": ["V PUNCH"]}'::jsonb),
('V-UPS', 'Abdominais', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/odoC-JLepfE', 'external', ARRAY['V-UPS']::text[], '{"sources": ["tecnofit"], "original_names": ["V-UPS"]}'::jsonb),
('Weighted Plank', 'Abdominais', null, 'Estabilidade', null, null, 'https://youtu.be/_Ds21fwcULo', 'external', ARRAY['WEIGHTED PLANK']::text[], '{"sources": ["tecnofit"], "original_names": ["WEIGHTED PLANK"]}'::jsonb),
('Abdução da anca no chão', 'Abdutores', null, 'Força', null, null, null, null, ARRAY['Abdução da anca no chão']::text[], '{"sources": ["annex3"], "original_names": ["Abdução da anca no chão"]}'::jsonb),
('Abdução na polia baixa', 'Abdutores', 'Polia', 'Força', null, null, null, null, ARRAY['Abdução na polia baixa']::text[], '{"sources": ["annex3"], "original_names": ["Abdução na polia baixa"]}'::jsonb),
('Máquina abdutora', 'Abdutores', 'Máquina', 'Força', null, null, null, null, ARRAY['Máquina abdutora']::text[], '{"sources": ["annex3"], "original_names": ["Máquina abdutora"]}'::jsonb),
('Adução na polia baixa', 'Adutores', 'Polia', 'Força', null, null, null, null, ARRAY['Adução na polia baixa']::text[], '{"sources": ["annex3"], "original_names": ["Adução na polia baixa"]}'::jsonb),
('Máquina adutora', 'Adutores', 'Máquina', 'Força', null, null, null, null, ARRAY['Máquina adutora']::text[], '{"sources": ["annex3"], "original_names": ["Máquina adutora"]}'::jsonb),
('Peso morto sumô', 'Adutores', null, 'Força', null, null, null, null, ARRAY['Peso morto sumô']::text[], '{"sources": ["annex3"], "original_names": ["Peso morto sumô"]}'::jsonb),
('Alongamento dos flexores da anca', 'Alongamentos', 'Peso corporal', 'Alongamento', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Alongamento Flexores da Anca']::text[], '{"sources": ["seed"], "original_names": ["Alongamento Flexores da Anca"]}'::jsonb),
('Alongamento Peitoral na Parede', 'Alongamentos', 'Parede', 'Alongamento', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Alongamento Peitoral na Parede']::text[], '{"sources": ["seed"], "original_names": ["Alongamento Peitoral na Parede"]}'::jsonb),
('Child''s Pose Breathing', 'Alongamentos', 'Peso corporal', 'Alongamento', null, null, 'https://www.youtube.com/watch?v=bbs3cNSTUQI', 'external', ARRAY['Child''s Pose Breathing']::text[], '{"sources": ["tecnofit"], "original_names": ["Child''s Pose Breathing"]}'::jsonb),
('Child’s Pose', 'Alongamentos', 'Peso corporal', 'Alongamento', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Child’s Pose']::text[], '{"sources": ["seed"], "original_names": ["Child’s Pose"]}'::jsonb),
('Dynamic Frog Stretch', 'Alongamentos', null, 'Alongamento', null, null, 'https://www.youtube.com/watch?v=K0ciUcMzqr0', 'external', ARRAY['Dynamic Frog Stretch']::text[], '{"sources": ["tecnofit"], "original_names": ["Dynamic Frog Stretch"]}'::jsonb),
('Dynamic Half Kneeling Hip Flexor Stretch with Side', 'Alongamentos', null, 'Alongamento', null, null, 'https://www.youtube.com/watch?v=__NovLzDX9Y', 'external', ARRAY['Dynamic Half Kneeling Hip Flexor Stretch with Side']::text[], '{"sources": ["tecnofit"], "original_names": ["Dynamic Half Kneeling Hip Flexor Stretch with Side"]}'::jsonb),
('Mobilidade Torácica Open Book', 'Alongamentos', 'Peso corporal', 'Alongamento', null, null, 'https://youtu.be/tme41YNa-Z0?feature=shared', 'external', ARRAY['Mobilidade Torácica Open Book']::text[], '{"sources": ["tecnofit"], "original_names": ["Mobilidade Torácica Open Book"]}'::jsonb),
('Prone YTW', 'Alongamentos', null, 'Alongamento', null, null, null, null, ARRAY['Prone YTW']::text[], '{"sources": ["tecnofit"], "original_names": ["Prone YTW"]}'::jsonb),
('Scapular Activation W', 'Alongamentos', null, 'Alongamento', null, null, 'https://www.youtube.com/watch?v=p_9Tm62iUEI', 'external', ARRAY['Scapular Activation W']::text[], '{"sources": ["tecnofit"], "original_names": ["Scapular Activation W"]}'::jsonb),
('Thread The Needle', 'Alongamentos', null, 'Alongamento', null, null, 'https://youtube.com/watch?v=ds3umIYJDrE?si=RIr3ivGHb2gK5vHo', 'external', ARRAY['Thread The Needle']::text[], '{"sources": ["tecnofit"], "original_names": ["Thread The Needle"]}'::jsonb),
('Around The World Plate Pinch', 'Antebraço', 'Anilha', 'Força', null, null, 'https://youtu.be/ro34C9OZmEI', 'external', ARRAY['AROUND THE WORLD PLATE PINCH']::text[], '{"sources": ["tecnofit"], "original_names": ["AROUND THE WORLD PLATE PINCH"]}'::jsonb),
('Barbell Behind Back Wrist Curl,', 'Antebraço', 'Barra', 'Força', null, null, 'https://youtu.be/fdSnFI7N2Cg', 'external', ARRAY['BARBELL BEHIND BACK WRIST CURL,']::text[], '{"sources": ["tecnofit"], "original_names": ["BARBELL BEHIND BACK WRIST CURL,"]}'::jsonb),
('Caminhada com Halter', 'Antebraço', 'Halteres', 'Força', null, null, 'https://youtu.be/RFK2wr94-2k', 'external', ARRAY['CAMINHADA COM HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["CAMINHADA COM HALTER"]}'::jsonb),
('Curl de punhos com barra atrás das costas', 'Antebraço', 'Barra', 'Força', null, null, 'https://youtu.be/fdSnFI7N2Cg', 'external', ARRAY['ROSCA DE PUNHO COM BARRA ATRÁS DAS COSTAS,']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA DE PUNHO COM BARRA ATRÁS DAS COSTAS,"]}'::jsonb),
('DB Grip Hold', 'Antebraço', 'Halteres', 'Força', null, null, 'https://youtu.be/Qv3XtaHLgvk', 'external', ARRAY['DB GRIP HOLD']::text[], '{"sources": ["tecnofit"], "original_names": ["DB GRIP HOLD"]}'::jsonb),
('Dead Hang', 'Antebraço', null, 'Força', null, null, 'https://youtu.be/7NNa4DXQyfw', 'external', ARRAY['DEAD HANG']::text[], '{"sources": ["tecnofit"], "original_names": ["DEAD HANG"]}'::jsonb),
('Extensão de punhos com barra — pronado', 'Antebraço', 'Barra', 'Força', null, null, null, null, ARRAY['Extensão de punhos com barra — pronado']::text[], '{"sources": ["annex3"], "original_names": ["Extensão de punhos com barra — pronado"]}'::jsonb),
('Extensão de punhos com barra — supinado', 'Antebraço', 'Barra', 'Força', null, null, null, null, ARRAY['Extensão de punhos com barra — supinado']::text[], '{"sources": ["annex3"], "original_names": ["Extensão de punhos com barra — supinado"]}'::jsonb),
('Extensão de punhos com halter — pronado', 'Antebraço', 'Halteres', 'Força', null, null, null, null, ARRAY['Extensão de punhos com halter — pronado']::text[], '{"sources": ["annex3"], "original_names": ["Extensão de punhos com halter — pronado"]}'::jsonb),
('Farmer Walk', 'Antebraço', 'Halteres/Kettlebell', 'Funcional', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://youtu.be/l1bl29-NuAY', 'external', ARRAY['FARM CARRY','Farmer Walk']::text[], '{"sources": ["seed", "tecnofit"], "original_names": ["FARM CARRY", "Farmer Walk"]}'::jsonb),
('KB Farm Carry', 'Antebraço', 'Kettlebell', 'Força', null, null, 'https://youtu.be/RFK2wr94-2k', 'external', ARRAY['KB FARM CARRY']::text[], '{"sources": ["tecnofit"], "original_names": ["KB FARM CARRY"]}'::jsonb),
('KB Farm Hold', 'Antebraço', 'Kettlebell', 'Força', null, null, 'https://youtu.be/l1bl29-NuAY', 'external', ARRAY['KB FARM HOLD']::text[], '{"sources": ["tecnofit"], "original_names": ["KB FARM HOLD"]}'::jsonb),
('pega COM HALTER', 'Antebraço', 'Halteres', 'Força', null, null, 'https://youtu.be/Qv3XtaHLgvk', 'external', ARRAY['PEGADA COM HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["PEGADA COM HALTER"]}'::jsonb),
('pega ESTÁTICA COM HALTERES', 'Antebraço', 'Halteres', 'Força', null, null, 'https://youtu.be/Qv3XtaHLgvk', 'external', ARRAY['PEGADA ESTÁTICA COM HALTERES']::text[], '{"sources": ["tecnofit"], "original_names": ["PEGADA ESTÁTICA COM HALTERES"]}'::jsonb),
('Pendurar', 'Antebraço', null, 'Força', null, null, 'https://youtu.be/7NNa4DXQyfw', 'external', ARRAY['PENDURAR']::text[], '{"sources": ["tecnofit"], "original_names": ["PENDURAR"]}'::jsonb),
('Pinch Grip Hold', 'Antebraço', null, 'Força', null, null, 'https://youtu.be/wnZiXOAEUt0', 'external', ARRAY['PINCH GRIP HOLD']::text[], '{"sources": ["tecnofit"], "original_names": ["PINCH GRIP HOLD"]}'::jsonb),
('Pinça', 'Antebraço', null, 'Força', null, null, 'https://youtu.be/wnZiXOAEUt0', 'external', ARRAY['PINÇA']::text[], '{"sources": ["tecnofit"], "original_names": ["PINÇA"]}'::jsonb),
('Pinça com Anilha ao Redor do Mundo', 'Antebraço', 'Anilha', 'Força', null, null, 'https://youtu.be/ro34C9OZmEI', 'external', ARRAY['PINÇA COM ANILHA AO REDOR DO MUNDO']::text[], '{"sources": ["tecnofit"], "original_names": ["PINÇA COM ANILHA AO REDOR DO MUNDO"]}'::jsonb),
('Barbell Curls', 'Bíceps', 'Barra', 'Força', null, null, 'https://youtu.be/kJDrDLeQmuI', 'external', ARRAY['BARBELL CURLS']::text[], '{"sources": ["tecnofit"], "original_names": ["BARBELL CURLS"]}'::jsonb),
('Barbell Reverse Curl', 'Bíceps', 'Barra', 'Força', null, null, 'https://youtu.be/I7MEsHDiZXs', 'external', ARRAY['BARBELL REVERSE CURL']::text[], '{"sources": ["tecnofit"], "original_names": ["BARBELL REVERSE CURL"]}'::jsonb),
('Curl alternado', 'Bíceps', null, 'Força', null, null, 'https://player.vimeo.com/external/475589921.sd.mp4?s=fa41dca5788487ad19a9f969f722b5bfc494395f&profile_id=164', 'external', ARRAY['Curl alternado','ROSCA ALTERNADA']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["Curl alternado", "ROSCA ALTERNADA"]}'::jsonb),
('Curl alternado com halteres', 'Bíceps', 'Halteres', 'Força', null, null, 'https://youtu.be/sj7KB4dQC00', 'external', ARRAY['ROSCA ALTERNADA COM HALTERES']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA ALTERNADA COM HALTERES"]}'::jsonb),
('curl COM ANILHA', 'Bíceps', 'Anilha', 'Força', null, null, 'https://youtu.be/Y40yTpkGIQg', 'external', ARRAY['ROSCA COM ANILHA']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA COM ANILHA"]}'::jsonb),
('curl com Halteres no Banco', 'Bíceps', 'Halteres', 'Força', null, null, 'https://vimeo.com/896526219/375c00f2c7', 'external', ARRAY['Rosca com Halteres no Banco']::text[], '{"sources": ["tecnofit"], "original_names": ["Rosca com Halteres no Banco"]}'::jsonb),
('Curl com press de ombros neutro', 'Bíceps', null, 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/bd77578d-e509-4cdb-b32b-0257adfdbe2a/playlist.m3u8', 'external', ARRAY['Rosca Direta com Desenvolvimento Neutro','curl Direta com press de ombros Neutro']::text[], '{"sources": ["tecnofit"], "original_names": ["Rosca Direta com Desenvolvimento Neutro", "curl Direta com press de ombros Neutro"]}'::jsonb),
('Curl concentrado', 'Bíceps', null, 'Força', null, null, 'https://player.vimeo.com/external/537382251.sd.mp4?s=f16e4770becd12289bce7c2ad416034aa92c9d57&profile_id=164', 'external', ARRAY['Curl concentrado','ROSCA CONCENTRADA']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["Curl concentrado", "ROSCA CONCENTRADA"]}'::jsonb),
('Curl concentrado em pé', 'Bíceps', null, 'Força', null, null, null, null, ARRAY['Curl concentrado em pé']::text[], '{"sources": ["annex3"], "original_names": ["Curl concentrado em pé"]}'::jsonb),
('curl CROSS', 'Bíceps', 'Polia', 'Força', null, null, 'https://vimeo.com/896526149/bc04aea7a6', 'external', ARRAY['ROSCA CROSS']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA CROSS"]}'::jsonb),
('curl CROSS 90', 'Bíceps', 'Polia', 'Força', null, null, null, null, ARRAY['ROSCA CROSS 90']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA CROSS 90"]}'::jsonb),
('Curl de bíceps', 'Bíceps', 'Halteres', 'Hipertrofia', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://youtube.com/watch?v=cXk2mUsUsxg?si=lRHU7-ttRnM8mh2O', 'external', ARRAY['Curl Bíceps','ROSCA DIRETA']::text[], '{"sources": ["seed", "tecnofit"], "original_names": ["Curl Bíceps", "ROSCA DIRETA"]}'::jsonb),
('Curl de bíceps com barra', 'Bíceps', 'Barra', 'Força', null, null, 'https://youtu.be/kJDrDLeQmuI', 'external', ARRAY['Curl de bíceps com barra','ROSCA COM BARRA','ROSCA DIRETA BARRA']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["Curl de bíceps com barra", "ROSCA COM BARRA", "ROSCA DIRETA BARRA"]}'::jsonb),
('Curl de bíceps com halteres', 'Bíceps', 'Halteres', 'Força', null, null, 'https://vimeo.com/896526191/db4c417d97', 'external', ARRAY['Curl de bíceps com halteres','ROSCA DIRETA HALTER','Rosca Direta com Halteres']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["Curl de bíceps com halteres", "ROSCA DIRETA HALTER", "Rosca Direta com Halteres"]}'::jsonb),
('Curl de bíceps na máquina', 'Bíceps', 'Máquina', 'Força', null, null, null, null, ARRAY['ROSCA MAQUINA']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA MAQUINA"]}'::jsonb),
('Curl de bíceps na polia', 'Bíceps', 'Polia', 'Força', null, null, 'https://player.vimeo.com/external/475589908.sd.mp4?s=f4057cff419554325b040fd5c3c913967d3d7cd4&profile_id=164', 'external', ARRAY['ROSCA DIRETA NA POLIA']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA DIRETA NA POLIA"]}'::jsonb),
('Curl de bíceps na polia alta', 'Bíceps', 'Polia', 'Força', null, null, null, null, ARRAY['Curl de bíceps na polia alta']::text[], '{"sources": ["annex3"], "original_names": ["Curl de bíceps na polia alta"]}'::jsonb),
('Curl de bíceps na polia baixa', 'Bíceps', 'Polia', 'Força', null, null, null, null, ARRAY['Curl de bíceps na polia baixa']::text[], '{"sources": ["annex3"], "original_names": ["Curl de bíceps na polia baixa"]}'::jsonb),
('Curl de punhos', 'Bíceps', null, 'Força', null, null, null, null, ARRAY['ROSCA PUNHO']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA PUNHO"]}'::jsonb),
('Curl de punhos com barra', 'Bíceps', 'Barra', 'Força', null, null, 'https://player.vimeo.com/external/475589700.sd.mp4?s=36187690db6c023a8d37692e84cfc7508aba0fc7&profile_id=165', 'external', ARRAY['ROSCA PUNHO BARRA']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA PUNHO BARRA"]}'::jsonb),
('Curl de punhos com barra no banco', 'Bíceps', 'Barra', 'Força', null, null, 'https://vimeo.com/896526335/c092f8a0b3', 'external', ARRAY['Rosca Punho Barra no Banco']::text[], '{"sources": ["tecnofit"], "original_names": ["Rosca Punho Barra no Banco"]}'::jsonb),
('curl Direta Alternada com Halteres', 'Bíceps', 'Halteres', 'Força', null, null, 'https://vimeo.com/896664408/0e84f71d93', 'external', ARRAY['Rosca Direta Alternada com Halteres']::text[], '{"sources": ["tecnofit"], "original_names": ["Rosca Direta Alternada com Halteres"]}'::jsonb),
('curl Direta Banco Inclinado (costas)', 'Bíceps', null, 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/ba7e2151-6842-4fff-b8a1-69b78b776df7/playlist.m3u8', 'external', ARRAY['Rosca Direta Banco Inclinado (costas)']::text[], '{"sources": ["tecnofit"], "original_names": ["Rosca Direta Banco Inclinado (costas)"]}'::jsonb),
('curl Direta Banco Inclinado (peito)', 'Bíceps', null, 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/cf71d43b-cec6-41f8-8dcf-c096c4842197/playlist.m3u8', 'external', ARRAY['Rosca Direta Banco Inclinado (peito)']::text[], '{"sources": ["tecnofit"], "original_names": ["Rosca Direta Banco Inclinado (peito)"]}'::jsonb),
('curl DIRETA BARRA W', 'Bíceps', 'Barra', 'Força', null, null, 'https://player.vimeo.com/external/475587571.sd.mp4?s=049940e137c7727ebd5b8a6faed3b31d800f0e18&profile_id=165', 'external', ARRAY['ROSCA DIRETA BARRA W']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA DIRETA BARRA W"]}'::jsonb),
('curl Direta com Rotação', 'Bíceps', null, 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/482c1637-7957-4b9b-97d3-8143398949b8/playlist.m3u8', 'external', ARRAY['Rosca Direta com Rotação']::text[], '{"sources": ["tecnofit"], "original_names": ["Rosca Direta com Rotação"]}'::jsonb),
('curl Direta Supinada Banco', 'Bíceps', null, 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/9bf90efe-9936-42ab-9023-7cfe8a3c1d31/playlist.m3u8', 'external', ARRAY['Rosca Direta Supinada Banco']::text[], '{"sources": ["tecnofit"], "original_names": ["Rosca Direta Supinada Banco"]}'::jsonb),
('Curl inverso', 'Bíceps', null, 'Força', null, null, null, null, ARRAY['ROSCA INVERSA']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA INVERSA"]}'::jsonb),
('Curl inverso com barra', 'Bíceps', 'Barra', 'Força', null, null, 'https://youtu.be/I7MEsHDiZXs', 'external', ARRAY['ROSCA REVERSA COM BARRA']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA REVERSA COM BARRA"]}'::jsonb),
('Curl martelo', 'Bíceps', 'Halteres', 'Hipertrofia', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/475602161.sd.mp4?s=ee9ffef6d5e22cd2f51c754e79510917b09317c7&profile_id=164', 'external', ARRAY['Curl Martelo','Curl martelo','ROSCA MARTELO']::text[], '{"sources": ["annex3", "seed", "tecnofit"], "original_names": ["Curl Martelo", "Curl martelo", "ROSCA MARTELO"]}'::jsonb),
('curl MARTELO ALTERNADA HALTER', 'Bíceps', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475602181.sd.mp4?s=aec1cab23c538cd5b62d3e073f1d40854592fe26&profile_id=164', 'external', ARRAY['ROSCA MARTELO ALTERNADA HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA MARTELO ALTERNADA HALTER"]}'::jsonb),
('curl MARTELO BANCO', 'Bíceps', null, 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/943024bc-5d65-4398-96e0-2d31627e85f0/playlist.m3u8', 'external', ARRAY['ROSCA MARTELO BANCO']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA MARTELO BANCO"]}'::jsonb),
('Curl martelo com halteres', 'Bíceps', 'Halteres', 'Força', null, null, 'https://youtu.be/myJqgXZWvsU', 'external', ARRAY['ROSCA MARTELO COM HALTERES']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA MARTELO COM HALTERES"]}'::jsonb),
('Curl Scott', 'Bíceps', null, 'Força', null, null, null, null, ARRAY['ROSCA SCOTH']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA SCOTH"]}'::jsonb),
('Curl Scott com barra', 'Bíceps', 'Barra', 'Força', null, null, null, null, ARRAY['Curl Scott com barra']::text[], '{"sources": ["annex3"], "original_names": ["Curl Scott com barra"]}'::jsonb),
('Curl Scott com barra W', 'Bíceps', 'Barra', 'Força', null, null, 'https://player.vimeo.com/external/475612908.sd.mp4?s=a6d43fe4826c3833962ef312a773aca944f5022d&profile_id=165', 'external', ARRAY['ROSCA SCOTT BARRA W']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA SCOTT BARRA W"]}'::jsonb),
('Curl Scott com halter', 'Bíceps', 'Halteres', 'Força', null, null, null, null, ARRAY['Curl Scott com halter','ROSCA SCOTH HALTER']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["Curl Scott com halter", "ROSCA SCOTH HALTER"]}'::jsonb),
('Curl Scott em máquina', 'Bíceps', 'Máquina', 'Força', null, null, null, null, ARRAY['Curl Scott em máquina']::text[], '{"sources": ["annex3"], "original_names": ["Curl Scott em máquina"]}'::jsonb),
('Curl Zottman com halteres', 'Bíceps', 'Halteres', 'Força', null, null, 'https://youtu.be/qHTkCNWFpgQ', 'external', ARRAY['ROSCA ZOTTMAN COM HALTERES']::text[], '{"sources": ["tecnofit"], "original_names": ["ROSCA ZOTTMAN COM HALTERES"]}'::jsonb),
('DB Alternating Curls', 'Bíceps', 'Halteres', 'Força', null, null, 'https://youtu.be/sj7KB4dQC00', 'external', ARRAY['DB ALTERNATING CURLS']::text[], '{"sources": ["tecnofit"], "original_names": ["DB ALTERNATING CURLS"]}'::jsonb),
('DB Hammer Curls', 'Bíceps', 'Halteres', 'Força', null, null, 'https://youtu.be/myJqgXZWvsU', 'external', ARRAY['DB HAMMER CURLS']::text[], '{"sources": ["tecnofit"], "original_names": ["DB HAMMER CURLS"]}'::jsonb),
('DB Zottman Curl', 'Bíceps', 'Halteres', 'Força', null, null, 'https://youtu.be/qHTkCNWFpgQ', 'external', ARRAY['DB ZOTTMAN CURL']::text[], '{"sources": ["tecnofit"], "original_names": ["DB ZOTTMAN CURL"]}'::jsonb),
('Plate Curls', 'Bíceps', 'Anilha', 'Força', null, null, 'https://youtu.be/Y40yTpkGIQg', 'external', ARRAY['PLATE CURLS']::text[], '{"sources": ["tecnofit"], "original_names": ["PLATE CURLS"]}'::jsonb),
('Air Ski', 'Cardio', null, 'Cardio', null, null, 'https://www.youtube.com/watch?v=P0ArDw_GX3w', 'external', ARRAY['Air Ski']::text[], '{"sources": ["tecnofit"], "original_names": ["Air Ski"]}'::jsonb),
('Bicicleta', 'Cardio', 'Bicicleta', 'Cardio', null, null, 'https://player.vimeo.com/external/475591351.sd.mp4?s=4da6a7202b91aee9f0a711cb4193e131911cdae0&profile_id=165', 'external', ARRAY['BICICLETA']::text[], '{"sources": ["tecnofit"], "original_names": ["BICICLETA"]}'::jsonb),
('Bike Erg', 'Cardio', 'Bicicleta', 'Cardio', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Bike Erg']::text[], '{"sources": ["seed"], "original_names": ["Bike Erg"]}'::jsonb),
('Box Jump', 'Cardio', 'Caixa', 'Pliometria', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/475591366.sd.mp4?s=70b88e7b15abad609b9daf50f534ebda6b81808a&profile_id=164', 'external', ARRAY['Box Jump','SALTO CAIXOTE']::text[], '{"sources": ["seed", "tecnofit"], "original_names": ["Box Jump", "SALTO CAIXOTE"]}'::jsonb),
('Burpee', 'Cardio', 'Peso corporal', 'Condicionamento', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/475593424.sd.mp4?s=fac4a5155679ab08d6a93aadedfd9d76d36d27cf&profile_id=165', 'external', ARRAY['BURPEE','Burpee']::text[], '{"sources": ["seed", "tecnofit"], "original_names": ["BURPEE", "Burpee"]}'::jsonb),
('Burpee com flexão', 'Cardio', 'Peso corporal', 'Cardio', null, null, 'https://player.vimeo.com/external/475593327.sd.mp4?s=fbde0d9aa97100b5134c03cd29653b52dd5fb22a&profile_id=165', 'external', ARRAY['BURPEE FLEXÃO DE BRAÇO','Burpee Flexão de Braço']::text[], '{"sources": ["tecnofit"], "original_names": ["BURPEE FLEXÃO DE BRAÇO", "Burpee Flexão de Braço"]}'::jsonb),
('Burpee Halter', 'Cardio', 'Halteres', 'Cardio', null, null, 'https://player.vimeo.com/external/475618423.sd.mp4?s=56100cb6f732a07e0bd31e2d36f150be20fd1154&profile_id=164', 'external', ARRAY['BURPEE HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["BURPEE HALTER"]}'::jsonb),
('Caminhada Estacionária', 'Cardio', 'Peso corporal', 'Cardio', null, null, 'https://player.vimeo.com/external/475621334.sd.mp4?s=1e76b3fa2e0287710f17d12a2b78def61dabb2e0&profile_id=164', 'external', ARRAY['CAMINHADA ESTACIONÁRIA']::text[], '{"sources": ["tecnofit"], "original_names": ["CAMINHADA ESTACIONÁRIA"]}'::jsonb),
('Caminhada Halter', 'Cardio', 'Halteres', 'Cardio', null, null, 'https://player.vimeo.com/external/475621347.sd.mp4?s=da3be6f46268cc5e6a2ae90b5874cfa59870586a&profile_id=164', 'external', ARRAY['CAMINHADA HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["CAMINHADA HALTER"]}'::jsonb),
('Caminhada na passadeira', 'Cardio', 'Passadeira', 'Cardio', null, null, 'https://player.vimeo.com/external/475619739.sd.mp4?s=6b40eacd7cbb802d9dd4c98de1aef147a659906e&profile_id=164', 'external', ARRAY['CAMINHADA NA ESTEIRA']::text[], '{"sources": ["tecnofit"], "original_names": ["CAMINHADA NA ESTEIRA"]}'::jsonb),
('Corrida', 'Cardio', 'Peso corporal', 'Cardio', null, null, 'https://player.vimeo.com/external/475608451.sd.mp4?s=9ba4bea20fc3f15dccd29a418a7fc46ec18dd00d&profile_id=165', 'external', ARRAY['CORRIDA']::text[], '{"sources": ["tecnofit"], "original_names": ["CORRIDA"]}'::jsonb),
('Corrida em Círculos', 'Cardio', 'Peso corporal', 'Cardio', null, null, 'https://player.vimeo.com/external/475608362.sd.mp4?s=77c289f85ac2ab6952220054f866d56b4def73c3&profile_id=165', 'external', ARRAY['CORRIDA EM CÍRCULOS']::text[], '{"sources": ["tecnofit"], "original_names": ["CORRIDA EM CÍRCULOS"]}'::jsonb),
('Corrida na passadeira', 'Cardio', 'Passadeira', 'Cardio', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/475619661.sd.mp4?s=a64e1804e9b742916da58a9e736173eab0f5904e&profile_id=164', 'external', ARRAY['CORRIDA NA PASSADEIRA','Corrida em Passadeira']::text[], '{"sources": ["seed", "tecnofit"], "original_names": ["CORRIDA NA PASSADEIRA", "Corrida em Passadeira"]}'::jsonb),
('Crawling (engatinhar)', 'Cardio', null, 'Cardio', null, null, 'https://player.vimeo.com/external/475594461.sd.mp4?s=c24e7cf24420d13900e82043343246bf3defc0c4&profile_id=165', 'external', ARRAY['CRAWLING (ENGATINHAR)']::text[], '{"sources": ["tecnofit"], "original_names": ["CRAWLING (ENGATINHAR)"]}'::jsonb),
('Elíptica', 'Cardio', 'Elíptica', 'Cardio', null, null, 'https://www.youtube.com/watch?v=I-ri-jafGqs', 'external', ARRAY['Elíptica','Elíptico']::text[], '{"sources": ["tecnofit"], "original_names": ["Elíptica", "Elíptico"]}'::jsonb),
('Jumping Jacks', 'Cardio', 'Peso corporal', 'Cardio', null, null, 'https://player.vimeo.com/external/475608493.sd.mp4?s=29687e561428d1d73da83673f52a07c3fbb0976b&profile_id=164', 'external', ARRAY['POLICHINELO']::text[], '{"sources": ["tecnofit"], "original_names": ["POLICHINELO"]}'::jsonb),
('Pular Corda', 'Cardio', 'Corda', 'Cardio', null, null, 'https://player.vimeo.com/external/475608510.sd.mp4?s=3b183b18c862f65d16f5bc7813e924de8f914be1&profile_id=165', 'external', ARRAY['PULAR CORDA']::text[], '{"sources": ["tecnofit"], "original_names": ["PULAR CORDA"]}'::jsonb),
('Remo', 'Cardio', null, 'Cardio', null, null, null, null, ARRAY['Remo']::text[], '{"sources": ["tecnofit"], "original_names": ["Remo"]}'::jsonb),
('Remo Ergómetro', 'Cardio', 'Remo', 'Cardio', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Remo Ergómetro']::text[], '{"sources": ["seed"], "original_names": ["Remo Ergómetro"]}'::jsonb),
('Saltos 360º', 'Cardio', null, 'Cardio', null, null, 'https://player.vimeo.com/external/475580522.sd.mp4?s=663a373379ebdae8537d61f31d40425a8a85336c&profile_id=164', 'external', ARRAY['SALTOS 360º']::text[], '{"sources": ["tecnofit"], "original_names": ["SALTOS 360º"]}'::jsonb),
('Saltos Laterais', 'Cardio', null, 'Cardio', null, null, 'https://player.vimeo.com/external/475617318.sd.mp4?s=82e2ba69b7c66b3b31e626e0ddac043897af4105&profile_id=165', 'external', ARRAY['SALTOS LATERAIS']::text[], '{"sources": ["tecnofit"], "original_names": ["SALTOS LATERAIS"]}'::jsonb),
('Saltos Verticais', 'Cardio', null, 'Cardio', null, null, 'https://player.vimeo.com/external/475620684.sd.mp4?s=088c7eb3e76f1b0f2aa6e1e1f58138d1f5ed4748&profile_id=164', 'external', ARRAY['SALTOS VERTICAIS']::text[], '{"sources": ["tecnofit"], "original_names": ["SALTOS VERTICAIS"]}'::jsonb),
('Side to side shuffle taps', 'Cardio', null, 'Cardio', null, null, 'https://www.youtube.com/watch?v=MWhq7PKgq2s&t=5s&ab_channel=MarcDressen', 'external', ARRAY['Side to side shuffle taps']::text[], '{"sources": ["tecnofit"], "original_names": ["Side to side shuffle taps"]}'::jsonb),
('Skatista', 'Cardio', null, 'Cardio', null, null, 'https://player.vimeo.com/external/475617673.sd.mp4?s=016d525f644d7dfb6dd0bb6c3c77f807c887dc3c&profile_id=164', 'external', ARRAY['SKATISTA']::text[], '{"sources": ["tecnofit"], "original_names": ["SKATISTA"]}'::jsonb),
('Slow Burpee', 'Cardio', 'Peso corporal', 'Cardio', null, null, 'https://vimeo.com/815848991/5397724982', 'external', ARRAY['SLOW BURPEE']::text[], '{"sources": ["tecnofit"], "original_names": ["SLOW BURPEE"]}'::jsonb),
('Stairmaster', 'Cardio', 'Stairmaster', 'Cardio', null, null, 'https://media.tenor.com/6pYS5fU7yS0AAAPo/immersiva-stairmaster.mp4', 'external', ARRAY['Stairmaster']::text[], '{"sources": ["tecnofit"], "original_names": ["Stairmaster"]}'::jsonb),
('Step-up no banco', 'Cardio', 'Peso corporal', 'Cardio', null, null, 'https://player.vimeo.com/external/475593815.sd.mp4?s=ea1cc7c8b219bf431e1e7fa5043f562e43513dda&profile_id=164', 'external', ARRAY['SUBIDA NO BANCO']::text[], '{"sources": ["tecnofit"], "original_names": ["SUBIDA NO BANCO"]}'::jsonb),
('Subida Lateral Alternada', 'Cardio', null, 'Cardio', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/1f7d6648-883f-4f69-9f7d-fc2cdb7d4fce/playlist.m3u8', 'external', ARRAY['Subida Lateral Alternada']::text[], '{"sources": ["tecnofit"], "original_names": ["Subida Lateral Alternada"]}'::jsonb),
('Alongamento Lats no Banco', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/r4DBNmnxxcY', 'external', ARRAY['ALONGAMENTO LATS NO BANCO']::text[], '{"sources": ["tecnofit"], "original_names": ["ALONGAMENTO LATS NO BANCO"]}'::jsonb),
('Arch Raises', 'Costas', null, 'Força', null, null, 'https://youtu.be/6tniRGI359s', 'external', ARRAY['ARCH RAISES']::text[], '{"sources": ["tecnofit"], "original_names": ["ARCH RAISES"]}'::jsonb),
('Arch Rock', 'Costas', null, 'Força', null, null, 'https://youtu.be/bhQDwG03uHY', 'external', ARRAY['ARCH ROCK']::text[], '{"sources": ["tecnofit"], "original_names": ["ARCH ROCK"]}'::jsonb),
('Back Extension With PVC Overhead', 'Costas', null, 'Força', null, null, 'https://youtu.be/KqNCTe83I2g', 'external', ARRAY['BACK EXTENSION WITH PVC OVERHEAD']::text[], '{"sources": ["tecnofit"], "original_names": ["BACK EXTENSION WITH PVC OVERHEAD"]}'::jsonb),
('Balanço + Peito na Barra com Apoio na Caixa', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/6DkoF-FKbNw', 'external', ARRAY['BALANÇO + PEITO NA BARRA COM APOIO NA CAIXA']::text[], '{"sources": ["tecnofit"], "original_names": ["BALANÇO + PEITO NA BARRA COM APOIO NA CAIXA"]}'::jsonb),
('Balanço Superman', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/bhQDwG03uHY', 'external', ARRAY['BALANÇO SUPERMAN']::text[], '{"sources": ["tecnofit"], "original_names": ["BALANÇO SUPERMAN"]}'::jsonb),
('Barbell Bent Over Row', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/qzMlVp3g4cY', 'external', ARRAY['BARBELL BENT OVER ROW']::text[], '{"sources": ["tecnofit"], "original_names": ["BARBELL BENT OVER ROW"]}'::jsonb),
('Barra + Arco + Hollow', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/3v6F8Jkexpg', 'external', ARRAY['BARRA + ARCO + HOLLOW']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA + ARCO + HOLLOW"]}'::jsonb),
('Barra Até O Peito', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/iYiCyD4gDhw', 'external', ARRAY['BARRA ATÉ O PEITO']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA ATÉ O PEITO"]}'::jsonb),
('Barra Até O Peito + 1 Arco + 1 Hollow', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/KVek4HK5EdY', 'external', ARRAY['BARRA ATÉ O PEITO + 1 ARCO + 1 HOLLOW']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA ATÉ O PEITO + 1 ARCO + 1 HOLLOW"]}'::jsonb),
('Barra Até O Quadril', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/bvOjmw9fZmI', 'external', ARRAY['BARRA ATÉ O QUADRIL']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA ATÉ O QUADRIL"]}'::jsonb),
('Barra Balanço + Sustentação 5''''', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/c6p2b80SM6I', 'external', ARRAY['BARRA BALANÇO + SUSTENTAÇÃO 5''''']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA BALANÇO + SUSTENTAÇÃO 5''''"]}'::jsonb),
('Barra Butterfly com Duas Pernas na Caixa', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/5gN-HsauFpE', 'external', ARRAY['BARRA BUTTERFLY COM DUAS PERNAS NA CAIXA']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA BUTTERFLY COM DUAS PERNAS NA CAIXA"]}'::jsonb),
('Barra Butterfly com Uma Perna na Caixa', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/CdnYQiGSdYQ', 'external', ARRAY['BARRA BUTTERFLY COM UMA PERNA NA CAIXA']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA BUTTERFLY COM UMA PERNA NA CAIXA"]}'::jsonb),
('Barra com Caixa + Puxada Para Baixo', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/Spmy7RfYl94', 'external', ARRAY['BARRA COM CAIXA + PUXADA PARA BAIXO']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA COM CAIXA + PUXADA PARA BAIXO"]}'::jsonb),
('Barra com Impulso (parcial)', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/vNFgNTGnFyU', 'external', ARRAY['BARRA COM IMPULSO (PARCIAL)']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA COM IMPULSO (PARCIAL)"]}'::jsonb),
('Barra em Balanço', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/zHxfSAURxyU', 'external', ARRAY['BARRA EM BALANÇO']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA EM BALANÇO"]}'::jsonb),
('Barra fixa', 'Costas', 'Peso corporal', 'Força', 'Avançado', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/475612963.sd.mp4?s=21a09e7e61da5c5c6e2ca2b37d9ae950dee85e45&profile_id=164', 'external', ARRAY['BARRA FIXA','Elevações na Barra']::text[], '{"sources": ["seed", "tecnofit"], "original_names": ["BARRA FIXA", "Elevações na Barra"]}'::jsonb),
('Barra Fixa Inversa', 'Costas', 'Barra', 'Força', null, null, 'https://player.vimeo.com/external/475615648.sd.mp4?s=23b458f587c87ef11f099584bda52b8f0aff45c0&profile_id=165', 'external', ARRAY['BARRA FIXA INVERSA']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA FIXA INVERSA"]}'::jsonb),
('Barra fixa pronada', 'Costas', 'Barra', 'Força', null, null, 'https://vimeo.com/896528368/4ed72ff221', 'external', ARRAY['Barra Fixa Pronada','Barra fixa pronada']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["Barra Fixa Pronada", "Barra fixa pronada"]}'::jsonb),
('Barra fixa supinada', 'Costas', 'Barra', 'Força', null, null, 'https://vimeo.com/896528386/d0801860fb', 'external', ARRAY['Barra Fixa Supinada','Barra fixa supinada']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["Barra Fixa Supinada", "Barra fixa supinada"]}'::jsonb),
('Barra Graviton', 'Costas', 'Barra', 'Força', null, null, null, null, ARRAY['BARRA GRAVITON']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA GRAVITON"]}'::jsonb),
('Barra Isométrica Supinada', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/jjf7RVkW1F8', 'external', ARRAY['BARRA ISOMÉTRICA SUPINADA']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA ISOMÉTRICA SUPINADA"]}'::jsonb),
('Barra Negativa Pronada', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/QYdd47egiq0', 'external', ARRAY['BARRA NEGATIVA PRONADA']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA NEGATIVA PRONADA"]}'::jsonb),
('Barra Pronada Até O Peito', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/1AKNcHobapk', 'external', ARRAY['BARRA PRONADA ATÉ O PEITO']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA PRONADA ATÉ O PEITO"]}'::jsonb),
('Barra Pronada Até O Quadril', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/z5xjW79A2y8', 'external', ARRAY['BARRA PRONADA ATÉ O QUADRIL']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA PRONADA ATÉ O QUADRIL"]}'::jsonb),
('Bench Lat Stretch W/ PVC', 'Costas', null, 'Força', null, null, 'https://youtu.be/r4DBNmnxxcY', 'external', ARRAY['BENCH LAT STRETCH W/ PVC']::text[], '{"sources": ["tecnofit"], "original_names": ["BENCH LAT STRETCH W/ PVC"]}'::jsonb),
('Bent Over Row Supinated', 'Costas', null, 'Força', null, null, 'https://youtu.be/PW9c-tyuiRA', 'external', ARRAY['BENT OVER ROW SUPINATED']::text[], '{"sources": ["tecnofit"], "original_names": ["BENT OVER ROW SUPINATED"]}'::jsonb),
('Box Aux. Arch Strength', 'Costas', 'Caixa', 'Força', null, null, 'https://youtu.be/5y0HhPrdflA', 'external', ARRAY['BOX AUX. ARCH STRENGTH']::text[], '{"sources": ["tecnofit"], "original_names": ["BOX AUX. ARCH STRENGTH"]}'::jsonb),
('Buterfly Pull Up Small Circles', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/8RunU_cqe-k', 'external', ARRAY['BUTERFLY PULL UP SMALL CIRCLES']::text[], '{"sources": ["tecnofit"], "original_names": ["BUTERFLY PULL UP SMALL CIRCLES"]}'::jsonb),
('Butterfly em Balanço com As Duas Pernas na Caixa', 'Costas', 'Caixa', 'Força', null, null, 'https://youtu.be/5gN-HsauFpE', 'external', ARRAY['BUTTERFLY EM BALANÇO COM AS DUAS PERNAS NA CAIXA']::text[], '{"sources": ["tecnofit"], "original_names": ["BUTTERFLY EM BALANÇO COM AS DUAS PERNAS NA CAIXA"]}'::jsonb),
('Butterfly Kipping - Two Legs On Box', 'Costas', 'Caixa', 'Força', null, null, 'https://youtu.be/5gN-HsauFpE', 'external', ARRAY['BUTTERFLY KIPPING - TWO LEGS ON BOX','BUTTERFLY KIPPING TWO LEGS ON BOX']::text[], '{"sources": ["tecnofit"], "original_names": ["BUTTERFLY KIPPING - TWO LEGS ON BOX", "BUTTERFLY KIPPING TWO LEGS ON BOX"]}'::jsonb),
('Butterfly Kipping One Leg On Box', 'Costas', 'Caixa', 'Força', null, null, 'https://youtu.be/CdnYQiGSdYQ', 'external', ARRAY['BUTTERFLY KIPPING ONE LEG ON BOX']::text[], '{"sources": ["tecnofit"], "original_names": ["BUTTERFLY KIPPING ONE LEG ON BOX"]}'::jsonb),
('Chin Up + Arch + Hollow', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/3v6F8Jkexpg', 'external', ARRAY['CHIN UP + ARCH + HOLLOW']::text[], '{"sources": ["tecnofit"], "original_names": ["CHIN UP + ARCH + HOLLOW"]}'::jsonb),
('Chin Up Hold', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/jjf7RVkW1F8', 'external', ARRAY['CHIN UP HOLD']::text[], '{"sources": ["tecnofit"], "original_names": ["CHIN UP HOLD"]}'::jsonb),
('Chin Up Negative', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/QYdd47egiq0', 'external', ARRAY['CHIN UP NEGATIVE']::text[], '{"sources": ["tecnofit"], "original_names": ["CHIN UP NEGATIVE"]}'::jsonb),
('Cobra', 'Costas', null, 'Força', null, null, 'https://youtu.be/Z-VD1cf4zfg', 'external', ARRAY['COBRA']::text[], '{"sources": ["tecnofit"], "original_names": ["COBRA"]}'::jsonb),
('Commando Pull Ups', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/W2FGRLDCT_w', 'external', ARRAY['COMMANDO PULL UPS']::text[], '{"sources": ["tecnofit"], "original_names": ["COMMANDO PULL UPS"]}'::jsonb),
('Deficit Inverted Suspension Ring Row', 'Costas', 'Argolas', 'Força', null, null, 'https://youtu.be/IcVwiuPWNGo', 'external', ARRAY['DEFICIT INVERTED SUSPENSION RING ROW']::text[], '{"sources": ["tecnofit"], "original_names": ["DEFICIT INVERTED SUSPENSION RING ROW"]}'::jsonb),
('Dorsal Nadador', 'Costas', null, 'Força', null, null, null, null, ARRAY['DORSAL NADADOR']::text[], '{"sources": ["tecnofit"], "original_names": ["DORSAL NADADOR"]}'::jsonb),
('Extensão de Costas com Barra Acima da Cabeça', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/KqNCTe83I2g', 'external', ARRAY['EXTENSÃO DE COSTAS COM BARRA ACIMA DA CABEÇA']::text[], '{"sources": ["tecnofit"], "original_names": ["EXTENSÃO DE COSTAS COM BARRA ACIMA DA CABEÇA"]}'::jsonb),
('Half Kipping Pull Ups', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/vNFgNTGnFyU', 'external', ARRAY['HALF KIPPING PULL UPS']::text[], '{"sources": ["tecnofit"], "original_names": ["HALF KIPPING PULL UPS"]}'::jsonb),
('Hanging - Arch Hold 3 + Hollow Hold 3 + Strict C2B', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/kn1FKzaMldA', 'external', ARRAY['HANGING - ARCH HOLD 3 + HOLLOW HOLD 3 + STRICT C2B']::text[], '{"sources": ["tecnofit"], "original_names": ["HANGING - ARCH HOLD 3 + HOLLOW HOLD 3 + STRICT C2B"]}'::jsonb),
('Hips To Bar', 'Costas', null, 'Força', null, null, 'https://youtu.be/bvOjmw9fZmI', 'external', ARRAY['HIPS TO BAR']::text[], '{"sources": ["tecnofit"], "original_names": ["HIPS TO BAR"]}'::jsonb),
('Inverted Suspension Ring Row', 'Costas', 'Argolas', 'Força', null, null, 'https://youtu.be/46lAObg5s4k', 'external', ARRAY['INVERTED SUSPENSION RING ROW']::text[], '{"sources": ["tecnofit"], "original_names": ["INVERTED SUSPENSION RING ROW"]}'::jsonb),
('Kip Swing + Jump C2B On The Box', 'Costas', 'Caixa', 'Funcional', null, null, 'https://youtu.be/6DkoF-FKbNw', 'external', ARRAY['KIP SWING + JUMP C2B ON THE BOX']::text[], '{"sources": ["tecnofit"], "original_names": ["KIP SWING + JUMP C2B ON THE BOX"]}'::jsonb),
('Kipping Chest To Bar', 'Costas', null, 'Força', null, null, 'https://youtu.be/1AKNcHobapk', 'external', ARRAY['KIPPING CHEST TO BAR']::text[], '{"sources": ["tecnofit"], "original_names": ["KIPPING CHEST TO BAR"]}'::jsonb),
('Kipping Hips To Bar', 'Costas', null, 'Força', null, null, 'https://youtu.be/z5xjW79A2y8', 'external', ARRAY['KIPPING HIPS TO BAR']::text[], '{"sources": ["tecnofit"], "original_names": ["KIPPING HIPS TO BAR"]}'::jsonb),
('Kipping On Box + Pull Down', 'Costas', 'Caixa', 'Força', null, null, 'https://youtu.be/Spmy7RfYl94', 'external', ARRAY['KIPPING ON BOX + PULL DOWN']::text[], '{"sources": ["tecnofit"], "original_names": ["KIPPING ON BOX + PULL DOWN"]}'::jsonb),
('Kipping Pull Down With Objects Btw Feets', 'Costas', null, 'Força', null, null, 'https://youtu.be/JKVYGsgc7II', 'external', ARRAY['KIPPING PULL DOWN WITH OBJECTS BTW FEETS']::text[], '{"sources": ["tecnofit"], "original_names": ["KIPPING PULL DOWN WITH OBJECTS BTW FEETS"]}'::jsonb),
('Kipping Pull Up', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/zHxfSAURxyU', 'external', ARRAY['KIPPING PULL UP']::text[], '{"sources": ["tecnofit"], "original_names": ["KIPPING PULL UP"]}'::jsonb),
('Kipping Pull Up + 5'''' Hold', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/c6p2b80SM6I', 'external', ARRAY['KIPPING PULL UP + 5'''' HOLD']::text[], '{"sources": ["tecnofit"], "original_names": ["KIPPING PULL UP + 5'''' HOLD"]}'::jsonb),
('Mini Butterfly com Objetos Entre Os Pés', 'Costas', null, 'Força', null, null, 'https://youtu.be/XD5LXp1ikVQ', 'external', ARRAY['MINI BUTTERFLY COM OBJETOS ENTRE OS PÉS']::text[], '{"sources": ["tecnofit"], "original_names": ["MINI BUTTERFLY COM OBJETOS ENTRE OS PÉS"]}'::jsonb),
('Mini Butterfly With Objects Btw Feets', 'Costas', null, 'Força', null, null, 'https://youtu.be/XD5LXp1ikVQ', 'external', ARRAY['MINI BUTTERFLY WITH OBJECTS BTW FEETS']::text[], '{"sources": ["tecnofit"], "original_names": ["MINI BUTTERFLY WITH OBJECTS BTW FEETS"]}'::jsonb),
('One Leg Box Hips To Bar', 'Costas', 'Caixa', 'Força', null, null, 'https://youtu.be/WHOPV1KTd_c', 'external', ARRAY['ONE LEG BOX HIPS TO BAR']::text[], '{"sources": ["tecnofit"], "original_names": ["ONE LEG BOX HIPS TO BAR"]}'::jsonb),
('One Leg Kipping Pull Down On Box', 'Costas', 'Caixa', 'Força', null, null, 'https://youtu.be/HAYHCESpv8M', 'external', ARRAY['ONE LEG KIPPING PULL DOWN ON BOX']::text[], '{"sources": ["tecnofit"], "original_names": ["ONE LEG KIPPING PULL DOWN ON BOX"]}'::jsonb),
('Pandlay Row Pronated', 'Costas', null, 'Força', null, null, 'https://youtu.be/V07rsPBm6E0', 'external', ARRAY['PANDLAY ROW PRONATED']::text[], '{"sources": ["tecnofit"], "original_names": ["PANDLAY ROW PRONATED"]}'::jsonb),
('Peso morto', 'Costas', null, 'Força', null, null, 'https://player.vimeo.com/external/475594241.sd.mp4?s=4a3da4d8c67be7e42f0c2ef9549681207d6926ff&profile_id=164', 'external', ARRAY['LEVANT. TERRA','LEVANTAMENTO TERRA']::text[], '{"sources": ["tecnofit"], "original_names": ["LEVANT. TERRA", "LEVANTAMENTO TERRA"]}'::jsonb),
('Plate Pull Over', 'Costas', 'Anilha', 'Força', null, null, 'https://youtu.be/8h2cHIYdLdM', 'external', ARRAY['PLATE PULL OVER']::text[], '{"sources": ["tecnofit"], "original_names": ["PLATE PULL OVER"]}'::jsonb),
('Pronated Inverted Row', 'Costas', null, 'Força', null, null, 'https://youtu.be/i-Xq7r82eRk', 'external', ARRAY['PRONATED INVERTED ROW']::text[], '{"sources": ["tecnofit"], "original_names": ["PRONATED INVERTED ROW"]}'::jsonb),
('Pull Down', 'Costas', null, 'Força', null, null, 'https://player.vimeo.com/external/537381160.sd.mp4?s=5ce63735c62a0a0fc4be6a2a9c0b121ecc7bbb5f&profile_id=164', 'external', ARRAY['PULL DOWN','Pull Down']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["PULL DOWN", "Pull Down"]}'::jsonb),
('PULL UP SUPINADO (pega AMPLA E FECHADA)', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/QGMhbA6h0vk', 'external', ARRAY['PULL UP SUPINADO (PEGADA AMPLA E FECHADA)']::text[], '{"sources": ["tecnofit"], "original_names": ["PULL UP SUPINADO (PEGADA AMPLA E FECHADA)"]}'::jsonb),
('Puxada Atrás', 'Costas', null, 'Força', null, null, null, null, ARRAY['PUXADA ATRÁS']::text[], '{"sources": ["tecnofit"], "original_names": ["PUXADA ATRÁS"]}'::jsonb),
('Puxada Balanço com Objeto Entre Os Pés', 'Costas', null, 'Força', null, null, 'https://youtu.be/JKVYGsgc7II', 'external', ARRAY['PUXADA BALANÇO COM OBJETO ENTRE OS PÉS']::text[], '{"sources": ["tecnofit"], "original_names": ["PUXADA BALANÇO COM OBJETO ENTRE OS PÉS"]}'::jsonb),
('Puxada com Anilha no Banco', 'Costas', 'Anilha', 'Força', null, null, 'https://youtu.be/8h2cHIYdLdM', 'external', ARRAY['PUXADA COM ANILHA NO BANCO']::text[], '{"sources": ["tecnofit"], "original_names": ["PUXADA COM ANILHA NO BANCO"]}'::jsonb),
('Puxada Corda', 'Costas', 'Corda', 'Força', null, null, null, null, ARRAY['PUXADA CORDA']::text[], '{"sources": ["tecnofit"], "original_names": ["PUXADA CORDA"]}'::jsonb),
('Puxada Cross Over', 'Costas', 'Polia', 'Força', null, null, null, null, ARRAY['PUXADA CROSS OVER']::text[], '{"sources": ["tecnofit"], "original_names": ["PUXADA CROSS OVER"]}'::jsonb),
('Puxada dorsal na polia alta — pega aberta', 'Costas', 'Polia', 'Força', null, null, null, null, ARRAY['Puxada dorsal na polia alta — pega aberta']::text[], '{"sources": ["annex3"], "original_names": ["Puxada dorsal na polia alta — pega aberta"]}'::jsonb),
('Puxada dorsal na polia alta — pega fechada', 'Costas', 'Polia', 'Força', null, null, null, null, ARRAY['Puxada dorsal na polia alta — pega fechada']::text[], '{"sources": ["annex3"], "original_names": ["Puxada dorsal na polia alta — pega fechada"]}'::jsonb),
('Puxada dorsal na polia alta — pega larga', 'Costas', 'Polia', 'Força', null, null, null, null, ARRAY['Puxada dorsal na polia alta — pega larga']::text[], '{"sources": ["annex3"], "original_names": ["Puxada dorsal na polia alta — pega larga"]}'::jsonb),
('Puxada dorsal na polia alta — pega supinada', 'Costas', 'Polia', 'Força', null, null, null, null, ARRAY['Puxada dorsal na polia alta — pega supinada']::text[], '{"sources": ["annex3"], "original_names": ["Puxada dorsal na polia alta — pega supinada"]}'::jsonb),
('Puxada em Balanço com Uma Perna na Caixa', 'Costas', 'Caixa', 'Força', null, null, 'https://youtu.be/HAYHCESpv8M', 'external', ARRAY['PUXADA EM BALANÇO COM UMA PERNA NA CAIXA']::text[], '{"sources": ["tecnofit"], "original_names": ["PUXADA EM BALANÇO COM UMA PERNA NA CAIXA"]}'::jsonb),
('Puxada Estrita Escalada', 'Costas', null, 'Força', null, null, 'https://youtu.be/9EpMfGAljEQ', 'external', ARRAY['PUXADA ESTRITA ESCALADA']::text[], '{"sources": ["tecnofit"], "original_names": ["PUXADA ESTRITA ESCALADA"]}'::jsonb),
('Puxada Fechado', 'Costas', null, 'Força', null, null, null, null, ARRAY['PUXADA FECHADO']::text[], '{"sources": ["tecnofit"], "original_names": ["PUXADA FECHADO"]}'::jsonb),
('Puxada Frente Barra Menor', 'Costas', 'Barra', 'Força', null, null, null, null, ARRAY['PUXADA FRENTE BARRA MENOR']::text[], '{"sources": ["tecnofit"], "original_names": ["PUXADA FRENTE BARRA MENOR"]}'::jsonb),
('Puxada Frente Fechado', 'Costas', null, 'Força', null, null, null, null, ARRAY['PUXADA FRENTE FECHADO']::text[], '{"sources": ["tecnofit"], "original_names": ["PUXADA FRENTE FECHADO"]}'::jsonb),
('Puxada frontal', 'Costas', 'Polia', 'Hipertrofia', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/475612920.sd.mp4?s=fefe967ddb90f309a08916a8902e3a2049380005&profile_id=164', 'external', ARRAY['PUXADA FRENTE','Puxada Frontal']::text[], '{"sources": ["seed", "tecnofit"], "original_names": ["PUXADA FRENTE", "Puxada Frontal"]}'::jsonb),
('Puxada frontal na máquina', 'Costas', 'Máquina', 'Força', null, null, 'https://vimeo.com/896526473/0045ce7204', 'external', ARRAY['Puxada Frente na Máquina']::text[], '{"sources": ["tecnofit"], "original_names": ["Puxada Frente na Máquina"]}'::jsonb),
('Puxada Lateral Uni', 'Costas', null, 'Força', null, null, null, null, ARRAY['PUXADA LATERAL UNI']::text[], '{"sources": ["tecnofit"], "original_names": ["PUXADA LATERAL UNI"]}'::jsonb),
('Puxada na Barra', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/4rXDvoprVeQ', 'external', ARRAY['PUXADA NA BARRA']::text[], '{"sources": ["tecnofit"], "original_names": ["PUXADA NA BARRA"]}'::jsonb),
('Puxada Smith', 'Costas', 'Máquina Smith', 'Força', null, null, null, null, ARRAY['PUXADA SMITH']::text[], '{"sources": ["tecnofit"], "original_names": ["PUXADA SMITH"]}'::jsonb),
('Puxada Supinada Sentado (nas Argolas)', 'Costas', 'Argolas', 'Força', null, null, 'https://youtu.be/TTDNUl0xYXM', 'external', ARRAY['PUXADA SUPINADA SENTADO (NAS ARGOLAS)']::text[], '{"sources": ["tecnofit"], "original_names": ["PUXADA SUPINADA SENTADO (NAS ARGOLAS)"]}'::jsonb),
('Puxada TRAS/FRENTE', 'Costas', null, 'Força', null, null, null, null, ARRAY['PUXADA TRAS/FRENTE']::text[], '{"sources": ["tecnofit"], "original_names": ["PUXADA TRAS/FRENTE"]}'::jsonb),
('Puxada Trás na Máquina', 'Costas', 'Máquina', 'Força', null, null, 'https://vimeo.com/896526491/3b851948b0', 'external', ARRAY['Puxada Trás na Máquina']::text[], '{"sources": ["tecnofit"], "original_names": ["Puxada Trás na Máquina"]}'::jsonb),
('Puxadas Commando', 'Costas', null, 'Força', null, null, 'https://youtu.be/W2FGRLDCT_w', 'external', ARRAY['PUXADAS COMMANDO']::text[], '{"sources": ["tecnofit"], "original_names": ["PUXADAS COMMANDO"]}'::jsonb),
('Quadril na Barra com 1 Perna na Caixa', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/WHOPV1KTd_c', 'external', ARRAY['QUADRIL NA BARRA COM 1 PERNA NA CAIXA']::text[], '{"sources": ["tecnofit"], "original_names": ["QUADRIL NA BARRA COM 1 PERNA NA CAIXA"]}'::jsonb),
('Remada Aberta', 'Costas', null, 'Força', null, null, null, null, ARRAY['REMADA ABERTA']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA ABERTA"]}'::jsonb),
('Remada Aberta TRX', 'Costas', 'TRX', 'Força', null, null, 'https://player.vimeo.com/external/537381516.sd.mp4?s=96fe5ca405ed3d4165a7ba37ad1ac633c3d89d90&profile_id=164', 'external', ARRAY['REMADA ABERTA TRX']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA ABERTA TRX"]}'::jsonb),
('Remada Baixa', 'Costas', 'Polia', 'Hipertrofia', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Remada Baixa']::text[], '{"sources": ["seed"], "original_names": ["Remada Baixa"]}'::jsonb),
('Remada Baixa Pronada', 'Costas', null, 'Força', null, null, 'https://vimeo.com/896526549/063e881444', 'external', ARRAY['Remada Baixa Pronada']::text[], '{"sources": ["tecnofit"], "original_names": ["Remada Baixa Pronada"]}'::jsonb),
('Remada Baixa Triângulo', 'Costas', null, 'Força', null, null, 'https://vimeo.com/896526512/0619189907', 'external', ARRAY['Remada Baixa Triângulo']::text[], '{"sources": ["tecnofit"], "original_names": ["Remada Baixa Triângulo"]}'::jsonb),
('Remada Baixa Unilateral', 'Costas', null, 'Força', null, null, 'https://vimeo.com/896526564/6bb46b7025', 'external', ARRAY['Remada Baixa Unilateral']::text[], '{"sources": ["tecnofit"], "original_names": ["Remada Baixa Unilateral"]}'::jsonb),
('Remada comboio', 'Costas', null, 'Força', null, null, null, null, ARRAY['Remada comboio']::text[], '{"sources": ["annex3"], "original_names": ["Remada comboio"]}'::jsonb),
('Remada curvada', 'Costas', 'Barra', 'Força', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/537381817.sd.mp4?s=79828b3e8c5120497b101d8a1b4e7668a7b40060&profile_id=164', 'external', ARRAY['REMADA CURVADA','Remada Curvada']::text[], '{"sources": ["seed", "tecnofit"], "original_names": ["REMADA CURVADA", "Remada Curvada"]}'::jsonb),
('Remada curvada com barra', 'Costas', 'Barra', 'Força', null, null, 'https://youtu.be/qzMlVp3g4cY', 'external', ARRAY['REMADA CURVADA COM BARRA','Remada curvada com barra']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["REMADA CURVADA COM BARRA", "Remada curvada com barra"]}'::jsonb),
('Remada Curvada com Halteres', 'Costas', 'Halteres', 'Força', null, null, 'https://vimeo.com/896528171/3f8485b5f1', 'external', ARRAY['Remada Curvada com Halteres']::text[], '{"sources": ["tecnofit"], "original_names": ["Remada Curvada com Halteres"]}'::jsonb),
('Remada Curvada Pronada', 'Costas', null, 'Força', null, null, 'https://vimeo.com/896528051/178e88fdd9', 'external', ARRAY['Remada Curvada Pronada']::text[], '{"sources": ["tecnofit"], "original_names": ["Remada Curvada Pronada"]}'::jsonb),
('Remada Curvada Supinada', 'Costas', null, 'Força', null, null, 'https://youtu.be/PW9c-tyuiRA', 'external', ARRAY['REMADA CURVADA SUPINADA']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA CURVADA SUPINADA"]}'::jsonb),
('Remada em barra T', 'Costas', 'Barra', 'Força', null, null, null, null, ARRAY['Remada em barra T']::text[], '{"sources": ["annex3"], "original_names": ["Remada em barra T"]}'::jsonb),
('Remada em máquina Hammer Row', 'Costas', 'Máquina', 'Força', null, null, null, null, ARRAY['Remada em máquina Hammer Row']::text[], '{"sources": ["annex3"], "original_names": ["Remada em máquina Hammer Row"]}'::jsonb),
('Remada em polia baixa sentada unilateral', 'Costas', 'Polia', 'Força', null, null, null, null, ARRAY['Remada em polia baixa sentada unilateral']::text[], '{"sources": ["annex3"], "original_names": ["Remada em polia baixa sentada unilateral"]}'::jsonb),
('Remada Fechada', 'Costas', null, 'Força', null, null, null, null, ARRAY['REMADA FECHADA']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA FECHADA"]}'::jsonb),
('Remada Fechada TRX', 'Costas', 'TRX', 'Força', null, null, 'https://player.vimeo.com/external/537381969.sd.mp4?s=2f3641b6fa8349b4905fe3dc7dc09f30dd6c1315&profile_id=164', 'external', ARRAY['REMADA FECHADA TRX']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA FECHADA TRX"]}'::jsonb),
('Remada Invertida', 'Costas', null, 'Força', null, null, null, null, ARRAY['REMADA INVERTIDA']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA INVERTIDA"]}'::jsonb),
('Remada Invertida Pronada', 'Costas', null, 'Força', null, null, 'https://youtu.be/i-Xq7r82eRk', 'external', ARRAY['REMADA INVERTIDA PRONADA']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA INVERTIDA PRONADA"]}'::jsonb),
('Remada Máquina (pega Neutra)', 'Costas', 'Máquina', 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/97098f7f-8f60-4474-aa8d-09d38bf729f4/playlist.m3u8', 'external', ARRAY['Remada Máquina (Pegada Neutra)']::text[], '{"sources": ["tecnofit"], "original_names": ["Remada Máquina (Pegada Neutra)"]}'::jsonb),
('Remada Máquina (pega Pronada)', 'Costas', 'Máquina', 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/909e2698-4700-4f40-a2e8-5dc7a753509b/playlist.m3u8', 'external', ARRAY['Remada Máquina (Pegada Pronada)']::text[], '{"sources": ["tecnofit"], "original_names": ["Remada Máquina (Pegada Pronada)"]}'::jsonb),
('Remada Máquina (pega Supinada)', 'Costas', 'Máquina', 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/edc81795-e075-4d2b-bc93-3813373511ef/playlist.m3u8', 'external', ARRAY['Remada Máquina (Pegada Supinada)']::text[], '{"sources": ["tecnofit"], "original_names": ["Remada Máquina (Pegada Supinada)"]}'::jsonb),
('Remada Nas Argolas', 'Costas', 'Argolas', 'Força', null, null, 'https://youtu.be/46lAObg5s4k', 'external', ARRAY['REMADA NAS ARGOLAS']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA NAS ARGOLAS"]}'::jsonb),
('Remada Nas Argolas (com Deficit)', 'Costas', 'Argolas', 'Força', null, null, 'https://youtu.be/IcVwiuPWNGo', 'external', ARRAY['REMADA NAS ARGOLAS (COM DEFICIT)']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA NAS ARGOLAS (COM DEFICIT)"]}'::jsonb),
('Remada Nas Argolas A 0º', 'Costas', 'Argolas', 'Força', null, null, 'https://youtu.be/bO8TuGupHAg', 'external', ARRAY['REMADA NAS ARGOLAS A 0º']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA NAS ARGOLAS A 0º"]}'::jsonb),
('Remada Nas Argolas A 45° com Um Braço', 'Costas', 'Argolas', 'Força', null, null, 'https://youtu.be/IUeDV6ri46U', 'external', ARRAY['REMADA NAS ARGOLAS A 45° COM UM BRAÇO']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA NAS ARGOLAS A 45° COM UM BRAÇO"]}'::jsonb),
('Remada Nas Argolas A 45º com Pausa de 3''''', 'Costas', 'Argolas', 'Força', null, null, 'https://youtu.be/FR_ylGD22Nc', 'external', ARRAY['REMADA NAS ARGOLAS A 45º COM PAUSA DE 3''''']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA NAS ARGOLAS A 45º COM PAUSA DE 3''''"]}'::jsonb),
('Remada Pendlay Pronada', 'Costas', null, 'Força', null, null, 'https://youtu.be/V07rsPBm6E0', 'external', ARRAY['REMADA PENDLAY PRONADA']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA PENDLAY PRONADA"]}'::jsonb),
('Remada Supinada', 'Costas', null, 'Força', null, null, 'https://vimeo.com/896526532/e176ad2d1c', 'external', ARRAY['Remada Supinada']::text[], '{"sources": ["tecnofit"], "original_names": ["Remada Supinada"]}'::jsonb),
('Remada Supinada Nas Argolas', 'Costas', 'Argolas', 'Força', null, null, 'https://youtu.be/oxKRakIboHw', 'external', ARRAY['REMADA SUPINADA NAS ARGOLAS']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA SUPINADA NAS ARGOLAS"]}'::jsonb),
('Remada T-Bar', 'Costas', null, 'Força', null, null, 'https://player.vimeo.com/external/537381673.sd.mp4?s=a9b94a299ffa828882b88fb69128b390083a4d35&profile_id=164', 'external', ARRAY['REMADA CAVALINHO']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA CAVALINHO"]}'::jsonb),
('Remada unilateral com halter', 'Costas', null, 'Força', null, null, null, null, ARRAY['Remada serrote']::text[], '{"sources": ["annex3"], "original_names": ["Remada serrote"]}'::jsonb),
('Remanda Invertida Smith - Supinada', 'Costas', 'Máquina Smith', 'Força', null, null, 'https://vimeo.com/896526581/1f467643f2', 'external', ARRAY['Remanda Invertida Smith - Supinada']::text[], '{"sources": ["tecnofit"], "original_names": ["Remanda Invertida Smith - Supinada"]}'::jsonb),
('Ring Row 0º', 'Costas', 'Argolas', 'Força', null, null, 'https://youtu.be/bO8TuGupHAg', 'external', ARRAY['RING ROW 0º']::text[], '{"sources": ["tecnofit"], "original_names": ["RING ROW 0º"]}'::jsonb),
('Ring Row 45° One Arm', 'Costas', 'Argolas', 'Força', null, null, 'https://youtu.be/IUeDV6ri46U', 'external', ARRAY['RING ROW 45° ONE ARM']::text[], '{"sources": ["tecnofit"], "original_names": ["RING ROW 45° ONE ARM"]}'::jsonb),
('Ring Row 45º With Pause 3''''', 'Costas', 'Argolas', 'Força', null, null, 'https://youtu.be/FR_ylGD22Nc', 'external', ARRAY['RING ROW 45º WITH PAUSE 3''''']::text[], '{"sources": ["tecnofit"], "original_names": ["RING ROW 45º WITH PAUSE 3''''"]}'::jsonb),
('Rotação de Tronco', 'Costas', null, 'Força', null, null, 'https://player.vimeo.com/external/475617531.sd.mp4?s=dcb9d00909db9b4840728d2ab3a7945f650c93f6&profile_id=165', 'external', ARRAY['ROTAÇÃO DE TRONCO']::text[], '{"sources": ["tecnofit"], "original_names": ["ROTAÇÃO DE TRONCO"]}'::jsonb),
('Serrote', 'Costas', null, 'Força', null, null, null, null, ARRAY['SERROTE']::text[], '{"sources": ["tecnofit"], "original_names": ["SERROTE"]}'::jsonb),
('Serrote Cross', 'Costas', 'Polia', 'Força', null, null, null, null, ARRAY['SERROTE CROSS']::text[], '{"sources": ["tecnofit"], "original_names": ["SERROTE CROSS"]}'::jsonb),
('Strict C2B', 'Costas', null, 'Força', null, null, 'https://youtu.be/iYiCyD4gDhw', 'external', ARRAY['STRICT C2B']::text[], '{"sources": ["tecnofit"], "original_names": ["STRICT C2B"]}'::jsonb),
('Strict C2B + 1 Arch + 1 Hollow', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/KVek4HK5EdY', 'external', ARRAY['STRICT C2B + 1 ARCH + 1 HOLLOW']::text[], '{"sources": ["tecnofit"], "original_names": ["STRICT C2B + 1 ARCH + 1 HOLLOW"]}'::jsonb),
('Strict Pull Up', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/lCAJ71YmtOs', 'external', ARRAY['STRICT PULL UP']::text[], '{"sources": ["tecnofit"], "original_names": ["STRICT PULL UP"]}'::jsonb),
('Strict Pull Up Scale', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/9EpMfGAljEQ', 'external', ARRAY['STRICT PULL UP SCALE']::text[], '{"sources": ["tecnofit"], "original_names": ["STRICT PULL UP SCALE"]}'::jsonb),
('Superman Alternado', 'Costas', 'Peso corporal', 'Força', null, null, 'https://player.vimeo.com/external/475580528.sd.mp4?s=c607e96a88f3456398b220e901e36757a282168f&profile_id=164', 'external', ARRAY['SUPERMAN ALTERNADO']::text[], '{"sources": ["tecnofit"], "original_names": ["SUPERMAN ALTERNADO"]}'::jsonb),
('Supinated Ring Pull Up Seated Assisted', 'Costas', 'Argolas', 'Força', null, null, 'https://youtu.be/TTDNUl0xYXM', 'external', ARRAY['SUPINATED RING PULL UP SEATED ASSISTED']::text[], '{"sources": ["tecnofit"], "original_names": ["SUPINATED RING PULL UP SEATED ASSISTED"]}'::jsonb),
('Supinated Ring Row', 'Costas', 'Argolas', 'Força', null, null, 'https://youtu.be/oxKRakIboHw', 'external', ARRAY['SUPINATED RING ROW']::text[], '{"sources": ["tecnofit"], "original_names": ["SUPINATED RING ROW"]}'::jsonb),
('Supine Pull Up Wide Close Grip', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/QGMhbA6h0vk', 'external', ARRAY['SUPINE PULL UP WIDE CLOSE GRIP']::text[], '{"sources": ["tecnofit"], "original_names": ["SUPINE PULL UP WIDE CLOSE GRIP"]}'::jsonb),
('Sustentação Arco 3'''' + Hollow 3'''' + 1 Peito na Bar', 'Costas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/kn1FKzaMldA', 'external', ARRAY['SUSTENTAÇÃO ARCO 3'''' + HOLLOW 3'''' + 1 PEITO NA BAR']::text[], '{"sources": ["tecnofit"], "original_names": ["SUSTENTAÇÃO ARCO 3'''' + HOLLOW 3'''' + 1 PEITO NA BAR"]}'::jsonb),
('Sustentação Arqueiro com Apoio de Caixa', 'Costas', 'Caixa', 'Força', null, null, 'https://youtu.be/5y0HhPrdflA', 'external', ARRAY['SUSTENTAÇÃO ARQUEIRO COM APOIO DE CAIXA']::text[], '{"sources": ["tecnofit"], "original_names": ["SUSTENTAÇÃO ARQUEIRO COM APOIO DE CAIXA"]}'::jsonb),
('Sustentação Butterfly (pescoço em Círculos)', 'Costas', null, 'Força', null, null, 'https://youtu.be/8RunU_cqe-k', 'external', ARRAY['SUSTENTAÇÃO BUTTERFLY (PESCOÇO EM CÍRCULOS)']::text[], '{"sources": ["tecnofit"], "original_names": ["SUSTENTAÇÃO BUTTERFLY (PESCOÇO EM CÍRCULOS)"]}'::jsonb),
('Thoracic Openener W/ Medball', 'Costas', 'Halteres', 'Força', null, null, 'https://youtu.be/Bk4ZaJRb8rk', 'external', ARRAY['THORACIC OPENENER W/ MEDBALL']::text[], '{"sources": ["tecnofit"], "original_names": ["THORACIC OPENENER W/ MEDBALL"]}'::jsonb),
('Voos posteriores', 'Ombros', null, 'Força', null, null, 'https://player.vimeo.com/external/475615593.sd.mp4?s=df9d8115f2fa66fad6ead0927f149c790d6ab3c8&profile_id=165', 'external', ARRAY['CRUCIFIXO INVERSO','Crucifixo Inverso']::text[], '{"sources": ["tecnofit"], "original_names": ["CRUCIFIXO INVERSO", "Crucifixo Inverso"]}'::jsonb),
('Voos posteriores na máquina', 'Ombros', 'Máquina', 'Força', null, null, 'https://vimeo.com/896526451/d69aa02c37', 'external', ARRAY['Crucifixo Inverso na Máquina']::text[], '{"sources": ["tecnofit"], "original_names": ["Crucifixo Inverso na Máquina"]}'::jsonb),
('Sled Push', 'Funcional', 'Sled', 'Condicionamento', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Sled Push']::text[], '{"sources": ["seed"], "original_names": ["Sled Push"]}'::jsonb),
('Thruster', 'Funcional', 'Barra/Halteres', 'Cross Training', 'Avançado', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Thruster']::text[], '{"sources": ["seed"], "original_names": ["Thruster"]}'::jsonb),
('Wall Ball', 'Funcional', 'Bola medicinal', 'Cross Training', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Wall Ball']::text[], '{"sources": ["seed"], "original_names": ["Wall Ball"]}'::jsonb),
('Bom dia', 'Glúteos', null, 'Força', null, null, 'https://player.vimeo.com/external/475596361.sd.mp4?s=8981720236654717cfd62607bf75a56c2709ee29&profile_id=165', 'external', ARRAY['BOM DIA']::text[], '{"sources": ["tecnofit"], "original_names": ["BOM DIA"]}'::jsonb),
('Deslocamento lateral com mini band', 'Glúteos', 'Elástico', 'Força', null, null, 'https://youtu.be/9SQ3EOot_sg?si=9auAW5jWsVioDXa9', 'external', ARRAY['Deslocamento lateral com mini band']::text[], '{"sources": ["tecnofit"], "original_names": ["Deslocamento lateral com mini band"]}'::jsonb),
('Elevação Pélvica Medball em Isometria', 'Glúteos', 'Halteres', 'Força', null, null, 'https://youtu.be/4jpHQqkGRnU', 'external', ARRAY['Elevação Pélvica Medball em Isometria']::text[], '{"sources": ["tecnofit"], "original_names": ["Elevação Pélvica Medball em Isometria"]}'::jsonb),
('Elevação Pélvica na Máquina', 'Glúteos', 'Máquina', 'Força', null, null, 'https://vimeo.com/896526949/73a25b28e7', 'external', ARRAY['Elevação Pélvica na Máquina']::text[], '{"sources": ["tecnofit"], "original_names": ["Elevação Pélvica na Máquina"]}'::jsonb),
('Elevação Pélvica Unilateral no Banco', 'Glúteos', null, 'Força', null, null, 'https://youtube.com/watch?v=IKxApSnQeRI?si=yTEmmqM47r54glkO', 'external', ARRAY['Elevação Pélvica Unilateral no Banco']::text[], '{"sources": ["tecnofit"], "original_names": ["Elevação Pélvica Unilateral no Banco"]}'::jsonb),
('Extensão de glúteos em quatro apoios', 'Glúteos', null, 'Força', null, null, 'https://player.vimeo.com/external/475594393.sd.mp4?s=b87814f028e7e59731e1df98cb539da7faf37822&profile_id=164', 'external', ARRAY['GLÚTEO 4 APOIOS']::text[], '{"sources": ["tecnofit"], "original_names": ["GLÚTEO 4 APOIOS"]}'::jsonb),
('Extensão de glúteos em quatro apoios com caneleiras', 'Glúteos', null, 'Força', null, null, null, null, ARRAY['Extensão de glúteos em quatro apoios com caneleiras']::text[], '{"sources": ["annex3"], "original_names": ["Extensão de glúteos em quatro apoios com caneleiras"]}'::jsonb),
('Extensão de glúteos na polia', 'Glúteos', 'Polia', 'Força', null, null, 'https://player.vimeo.com/external/475593512.sd.mp4?s=19474db12db5268e97b96bf71be8b1bc5e7fdd7e&profile_id=165', 'external', ARRAY['Extensão de glúteos na polia baixa','GLUTEO ESTENDIDO NA POLIA']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["Extensão de glúteos na polia baixa", "GLUTEO ESTENDIDO NA POLIA"]}'::jsonb),
('Extensão de Quadril com Impulso', 'Glúteos', null, 'Força', null, null, 'https://youtu.be/rH5pWBXvZJ4', 'external', ARRAY['EXTENSÃO DE QUADRIL COM IMPULSO']::text[], '{"sources": ["tecnofit"], "original_names": ["EXTENSÃO DE QUADRIL COM IMPULSO"]}'::jsonb),
('Extensão de Quadril com Perna Reta e Banco', 'Glúteos', null, 'Força', null, null, 'https://youtu.be/Vm35-G1YCK4', 'external', ARRAY['EXTENSÃO DE QUADRIL COM PERNA RETA E BANCO']::text[], '{"sources": ["tecnofit"], "original_names": ["EXTENSÃO DE QUADRIL COM PERNA RETA E BANCO"]}'::jsonb),
('Glúteo 4 Apoios Perna Estendida', 'Glúteos', null, 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/e7fd07d7-b923-4948-a52c-5c3767ff79ce/playlist.m3u8', 'external', ARRAY['Glúteo 4 Apoios Perna Estendida']::text[], '{"sources": ["tecnofit"], "original_names": ["Glúteo 4 Apoios Perna Estendida"]}'::jsonb),
('Glúteos em máquina', 'Glúteos', 'Máquina', 'Força', null, null, null, null, ARRAY['Glúteos em máquina']::text[], '{"sources": ["annex3"], "original_names": ["Glúteos em máquina"]}'::jsonb),
('Hip Pop On The Floor (hip Extension From Floor)', 'Glúteos', null, 'Força', null, null, 'https://youtu.be/rH5pWBXvZJ4', 'external', ARRAY['HIP POP ON THE FLOOR (HIP EXTENSION FROM FLOOR)']::text[], '{"sources": ["tecnofit"], "original_names": ["HIP POP ON THE FLOOR (HIP EXTENSION FROM FLOOR)"]}'::jsonb),
('Hip Thrust', 'Glúteos', 'Barra', 'Hipertrofia', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/475606112.sd.mp4?s=d9310ff984913d02531b7a42546bb4bd66e015ea&profile_id=164', 'external', ARRAY['ELEVAÇÃO PÉLVICA','Hip Thrust','Hip thrust']::text[], '{"sources": ["seed", "tecnofit"], "original_names": ["ELEVAÇÃO PÉLVICA", "Hip Thrust", "Hip thrust"]}'::jsonb),
('Hip Thrust com barra', 'Glúteos', 'Barra', 'Força', null, null, 'https://player.vimeo.com/external/475587634.sd.mp4?s=c52eb4c0172c37a28a4d599f90df9216425359d4&profile_id=165', 'external', ARRAY['ELEVAÇÃO PÉLVICA BARRA']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÃO PÉLVICA BARRA"]}'::jsonb),
('Hip Thrust com barra no banco', 'Glúteos', 'Barra', 'Força', null, null, 'https://player.vimeo.com/external/475587642.sd.mp4?s=b7fbc4e03a445132e654c5ad2300baaba80ccd9a&profile_id=165', 'external', ARRAY['ELEVAÇÃO PÉLVICA BANCO BARRA']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÃO PÉLVICA BANCO BARRA"]}'::jsonb),
('Hip Thrust unilateral', 'Glúteos', null, 'Força', null, null, 'https://player.vimeo.com/external/475604938.sd.mp4?s=941c5cd05f1254402de47488e858df659c57ce73&profile_id=164', 'external', ARRAY['ELEVACAO PÉLVICA UNILATERAL']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVACAO PÉLVICA UNILATERAL"]}'::jsonb),
('Lunge Smith pé à frente elevado', 'Glúteos', 'Máquina Smith', 'Força', null, null, 'https://youtu.be/ZWDaPXULFPY?si=ocySW_jYz1fOdR8g', 'external', ARRAY['Lunge Smith pé à frente elevado']::text[], '{"sources": ["tecnofit"], "original_names": ["Lunge Smith pé à frente elevado"]}'::jsonb),
('Medball Glute Bridges Hold On The Floor', 'Glúteos', 'Halteres', 'Força', null, null, 'https://youtu.be/4jpHQqkGRnU', 'external', ARRAY['MEDBALL GLUTE BRIDGES HOLD ON THE FLOOR']::text[], '{"sources": ["tecnofit"], "original_names": ["MEDBALL GLUTE BRIDGES HOLD ON THE FLOOR"]}'::jsonb),
('Passada com halteres (andando)', 'Glúteos', 'Halteres', 'Força', null, null, 'https://vimeo.com/896528156/93cf09a53d', 'external', ARRAY['Passada com halteres (andando)']::text[], '{"sources": ["tecnofit"], "original_names": ["Passada com halteres (andando)"]}'::jsonb),
('Ponte de glúteos', 'Glúteos', null, 'Força', null, null, 'https://vimeo.com/896527834/ccfd6ca1e9', 'external', ARRAY['Elevação de Quadril']::text[], '{"sources": ["tecnofit"], "original_names": ["Elevação de Quadril"]}'::jsonb),
('Ponte de Glúteos com Medball', 'Glúteos', 'Halteres', 'Força', null, null, 'https://youtu.be/4jpHQqkGRnU', 'external', ARRAY['PONTE DE GLÚTEOS COM MEDBALL']::text[], '{"sources": ["tecnofit"], "original_names": ["PONTE DE GLÚTEOS COM MEDBALL"]}'::jsonb),
('Ponte de glúteos com pés no banco', 'Glúteos', null, 'Força', null, null, null, null, ARRAY['Ponte de glúteos com pés no banco']::text[], '{"sources": ["annex3"], "original_names": ["Ponte de glúteos com pés no banco"]}'::jsonb),
('Ponte de glúteos no chão', 'Glúteos', null, 'Força', null, null, null, null, ARRAY['Ponte de glúteos no chão']::text[], '{"sources": ["annex3"], "original_names": ["Ponte de glúteos no chão"]}'::jsonb),
('Step-up', 'Glúteos', 'Peso corporal', 'Cardio', null, null, 'https://player.vimeo.com/external/475604929.sd.mp4?s=86442fbb50255144cc22c0b12faf734aad23b363&profile_id=164', 'external', ARRAY['SUBIDA NO STEP','Step-up']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["SUBIDA NO STEP", "Step-up"]}'::jsonb),
('Straight Leg Hip Extension W/ Bench', 'Glúteos', null, 'Força', null, null, 'https://youtu.be/Vm35-G1YCK4', 'external', ARRAY['STRAIGHT LEG HIP EXTENSION W/ BENCH']::text[], '{"sources": ["tecnofit"], "original_names": ["STRAIGHT LEG HIP EXTENSION W/ BENCH"]}'::jsonb),
('Elevação de Gémeos', 'Gémeos', 'Máquina/Halteres', 'Hipertrofia', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Elevação de Gémeos']::text[], '{"sources": ["seed"], "original_names": ["Elevação de Gémeos"]}'::jsonb),
('Elevação de gémeos em pé na máquina', 'Gémeos', 'Máquina', 'Força', null, null, null, null, ARRAY['Elevação de gémeos em pé na máquina']::text[], '{"sources": ["annex3"], "original_names": ["Elevação de gémeos em pé na máquina"]}'::jsonb),
('Elevação de gémeos em pé no step', 'Gémeos', null, 'Força', null, null, null, null, ARRAY['Elevação de gémeos em pé no step']::text[], '{"sources": ["annex3"], "original_names": ["Elevação de gémeos em pé no step"]}'::jsonb),
('Elevação de gémeos sentado com halteres', 'Gémeos', 'Halteres', 'Força', null, null, null, null, ARRAY['Elevação de gémeos sentado com halteres']::text[], '{"sources": ["annex3"], "original_names": ["Elevação de gémeos sentado com halteres"]}'::jsonb),
('Elevação de gémeos sentado na máquina', 'Gémeos', 'Máquina', 'Força', null, null, null, null, ARRAY['Elevação de gémeos sentado na máquina']::text[], '{"sources": ["annex3"], "original_names": ["Elevação de gémeos sentado na máquina"]}'::jsonb),
('Bom dia com barra', 'Isquiotibiais', 'Barra', 'Força', null, null, null, null, ARRAY['Bom dia com barra']::text[], '{"sources": ["annex3"], "original_names": ["Bom dia com barra"]}'::jsonb),
('Curl femoral', 'Isquiotibiais', 'Máquina', 'Hipertrofia', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Curl Femoral','FLEXOR']::text[], '{"sources": ["seed", "tecnofit"], "original_names": ["Curl Femoral", "FLEXOR"]}'::jsonb),
('Curl femoral deitado', 'Isquiotibiais', null, 'Força', null, null, 'https://player.vimeo.com/external/537381026.sd.mp4?s=3ae35a5e83af14e775c623db9eb1225e610eaa9c&profile_id=164', 'external', ARRAY['Curl femoral deitado','MESA FLEXORA']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["Curl femoral deitado", "MESA FLEXORA"]}'::jsonb),
('Curl femoral em pé', 'Isquiotibiais', null, 'Força', null, null, null, null, ARRAY['Curl femoral em pé']::text[], '{"sources": ["annex3"], "original_names": ["Curl femoral em pé"]}'::jsonb),
('Nordic Lower', 'Isquiotibiais', null, 'Força', null, null, null, null, ARRAY['Nordic Lower']::text[], '{"sources": ["annex3"], "original_names": ["Nordic Lower"]}'::jsonb),
('Peso Morto Romeno', 'Isquiotibiais', 'Barra/Halteres', 'Força', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Peso Morto Romeno']::text[], '{"sources": ["seed"], "original_names": ["Peso Morto Romeno"]}'::jsonb),
('Stiff', 'Isquiotibiais', null, 'Força', null, null, 'https://player.vimeo.com/external/475615731.sd.mp4?s=1a91ea3d7f93a81c25c3ced67124f633107c83cb&profile_id=164', 'external', ARRAY['STIFF','Stiff']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["STIFF", "Stiff"]}'::jsonb),
('Bird Dog', 'Lombar', 'Peso corporal', 'Estabilidade', null, null, 'https://youtu.be/ozrVNN71aEg', 'external', ARRAY['Bird Dog','PRANCHA PERDIGUEIRO']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["Bird Dog", "PRANCHA PERDIGUEIRO"]}'::jsonb),
('Elevação alternada de braços e pernas', 'Lombar', null, 'Estabilidade', null, null, null, null, ARRAY['Elevação alternada de braços e pernas']::text[], '{"sources": ["annex3"], "original_names": ["Elevação alternada de braços e pernas"]}'::jsonb),
('Hiperextensões em banco 90°', 'Lombar', null, 'Estabilidade', null, null, null, null, ARRAY['Hiperextensões em banco 90°']::text[], '{"sources": ["annex3"], "original_names": ["Hiperextensões em banco 90°"]}'::jsonb),
('Hiperextensões em banco inclinado', 'Lombar', null, 'Estabilidade', null, null, null, null, ARRAY['Hiperextensões em banco inclinado']::text[], '{"sources": ["annex3"], "original_names": ["Hiperextensões em banco inclinado"]}'::jsonb),
('Hiperextensões em máquina', 'Lombar', 'Máquina', 'Estabilidade', null, null, null, null, ARRAY['Hiperextensões em máquina']::text[], '{"sources": ["annex3"], "original_names": ["Hiperextensões em máquina"]}'::jsonb),
('Superman', 'Lombar', 'Peso corporal', 'Força', null, null, 'https://player.vimeo.com/external/475619146.sd.mp4?s=f7dfe9a3fab66602fd5b670335852174b8b44cd5&profile_id=164', 'external', ARRAY['SUPERMAN','Superman']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["SUPERMAN", "Superman"]}'::jsonb),
('90/90 da Anca', 'Mobilidade', 'Peso corporal', 'Mobilidade', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['90/90 da Anca']::text[], '{"sources": ["seed"], "original_names": ["90/90 da Anca"]}'::jsonb),
('Alternating Groiners', 'Mobilidade', 'Peso corporal', 'Mobilidade', null, null, 'https://www.youtube.com/watch?v=V3xTlIMlGL8', 'external', ARRAY['ALTERNATING GROINERS']::text[], '{"sources": ["tecnofit"], "original_names": ["ALTERNATING GROINERS"]}'::jsonb),
('Groiner with Rotation Worlds Greatest Stretch', 'Mobilidade', 'Peso corporal', 'Mobilidade', null, null, 'https://www.youtube.com/watch?v=Cf2yIdoETH4', 'external', ARRAY['Groiner with Rotation Worlds Greatest Stretch']::text[], '{"sources": ["tecnofit"], "original_names": ["Groiner with Rotation Worlds Greatest Stretch"]}'::jsonb),
('Mobilidade Cintura Escapular em Decubito Lateral', 'Mobilidade', 'Peso corporal', 'Mobilidade', null, null, 'https://www.youtube.com/watch?v=wIZSTuPfY0U', 'external', ARRAY['Mobilidade Cintura Escapular em Decubito Lateral']::text[], '{"sources": ["tecnofit"], "original_names": ["Mobilidade Cintura Escapular em Decubito Lateral"]}'::jsonb),
('Mobilidade de Tornozelo', 'Mobilidade', 'Peso corporal', 'Mobilidade', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Mobilidade de Tornozelo']::text[], '{"sources": ["seed"], "original_names": ["Mobilidade de Tornozelo"]}'::jsonb),
('Mobilidade Escapular na Parede', 'Mobilidade', 'Peso corporal', 'Mobilidade', null, null, 'https://www.youtube.com/watch?v=i90y_1kuWtk', 'external', ARRAY['Mobilidade Escapular na Parede']::text[], '{"sources": ["tecnofit"], "original_names": ["Mobilidade Escapular na Parede"]}'::jsonb),
('Rotação Torácica', 'Mobilidade', 'Peso corporal', 'Mobilidade', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Rotação Torácica']::text[], '{"sources": ["seed"], "original_names": ["Rotação Torácica"]}'::jsonb),
('Wall Lat Stretch', 'Mobilidade', null, 'Mobilidade', null, null, 'https://www.youtube.com/watch?v=HtVSiJ94JUE', 'external', ARRAY['Wall Lat Stretch']::text[], '{"sources": ["tecnofit"], "original_names": ["Wall Lat Stretch"]}'::jsonb),
('Anjo na Neve', 'Ombros', null, 'Força', null, null, 'https://youtu.be/s15T9DPggkQ', 'external', ARRAY['ANJO NA NEVE']::text[], '{"sources": ["tecnofit"], "original_names": ["ANJO NA NEVE"]}'::jsonb),
('Barbell Upright Row', 'Ombros', 'Barra', 'Força', null, null, 'https://youtu.be/D1wqhTKowJ4', 'external', ARRAY['BARBELL UPRIGHT ROW']::text[], '{"sources": ["tecnofit"], "original_names": ["BARBELL UPRIGHT ROW"]}'::jsonb),
('Blackburn', 'Ombros', 'Kettlebell', 'Força', null, null, 'https://youtu.be/pnZ42DOPm2E', 'external', ARRAY['BLACKBURN']::text[], '{"sources": ["tecnofit"], "original_names": ["BLACKBURN"]}'::jsonb),
('Cuban Press com Haltere Ou Anilha', 'Ombros', 'Halteres', 'Força', null, null, 'https://youtu.be/vrOQlj2ayaM', 'external', ARRAY['CUBAN PRESS COM HALTERE OU ANILHA']::text[], '{"sources": ["tecnofit"], "original_names": ["CUBAN PRESS COM HALTERE OU ANILHA"]}'::jsonb),
('DB Arnold Press', 'Ombros', 'Halteres', 'Força', null, null, 'https://youtu.be/4XfZ2IYilzw', 'external', ARRAY['DB ARNOLD PRESS']::text[], '{"sources": ["tecnofit"], "original_names": ["DB ARNOLD PRESS"]}'::jsonb),
('DB Cuban Press', 'Ombros', 'Halteres', 'Força', null, null, 'https://youtu.be/vrOQlj2ayaM', 'external', ARRAY['DB CUBAN PRESS']::text[], '{"sources": ["tecnofit"], "original_names": ["DB CUBAN PRESS"]}'::jsonb),
('DB Lateral + Frontal', 'Ombros', 'Halteres', 'Força', null, null, 'https://youtu.be/HNXAbZ3Bwyc', 'external', ARRAY['DB LATERAL + FRONTAL']::text[], '{"sources": ["tecnofit"], "original_names": ["DB LATERAL + FRONTAL"]}'::jsonb),
('DB Or Plate Cuban Press', 'Ombros', 'Halteres', 'Força', null, null, 'https://youtu.be/vrOQlj2ayaM', 'external', ARRAY['DB OR PLATE CUBAN PRESS']::text[], '{"sources": ["tecnofit"], "original_names": ["DB OR PLATE CUBAN PRESS"]}'::jsonb),
('DB Single Arm', 'Ombros', 'Halteres', 'Força', null, null, 'https://youtu.be/3hX6qdopEU8', 'external', ARRAY['DB SINGLE ARM']::text[], '{"sources": ["tecnofit"], "original_names": ["DB SINGLE ARM"]}'::jsonb),
('Deltoid Fly', 'Ombros', null, 'Força', null, null, null, null, ARRAY['Deltoid Fly']::text[], '{"sources": ["annex3"], "original_names": ["Deltoid Fly"]}'::jsonb),
('Elevação Cross Cruzada', 'Ombros', 'Polia', 'Força', null, null, null, null, ARRAY['ELEVAÇÃO CROSS CRUZADA']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÃO CROSS CRUZADA"]}'::jsonb),
('Elevação de Haltere no Banco com 1 Braço', 'Ombros', 'Halteres', 'Força', null, null, 'https://youtu.be/3hX6qdopEU8', 'external', ARRAY['ELEVAÇÃO DE HALTERE NO BANCO COM 1 BRAÇO']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÃO DE HALTERE NO BANCO COM 1 BRAÇO"]}'::jsonb),
('Elevação Front Sentado', 'Ombros', null, 'Força', null, null, null, null, ARRAY['ELEVAÇÃO FRONT SENTADO']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÃO FRONT SENTADO"]}'::jsonb),
('Elevação Frontal', 'Ombros', null, 'Força', null, null, null, null, ARRAY['ELEVAÇÃO FRONTAL']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÃO FRONTAL"]}'::jsonb),
('Elevação Frontal Alternada Halter', 'Ombros', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475596284.sd.mp4?s=574a13b6b47f855296e4b8ed9e67a12820ac2506&profile_id=164', 'external', ARRAY['ELEVAÇÃO FRONTAL ALTERNADA HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÃO FRONTAL ALTERNADA HALTER"]}'::jsonb),
('Elevação Frontal com Anilha', 'Ombros', 'Anilha', 'Força', null, null, 'https://vimeo.com/896528298/de938dd605', 'external', ARRAY['Elevação Frontal com Anilha']::text[], '{"sources": ["tecnofit"], "original_names": ["Elevação Frontal com Anilha"]}'::jsonb),
('Elevação frontal com barra', 'Ombros', 'Barra', 'Força', null, null, 'https://youtu.be/D1wqhTKowJ4', 'external', ARRAY['ELEVAÇÃO FRONTAL COM BARRA','Elevação Frontal com Barra','Elevação frontal com barra']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["ELEVAÇÃO FRONTAL COM BARRA", "Elevação Frontal com Barra", "Elevação frontal com barra"]}'::jsonb),
('Elevação Frontal com Corda na Cross', 'Ombros', 'Polia', 'Força', null, null, 'https://vimeo.com/896526119/bab01511bc', 'external', ARRAY['Elevação Frontal com Corda na Cross']::text[], '{"sources": ["tecnofit"], "original_names": ["Elevação Frontal com Corda na Cross"]}'::jsonb),
('Elevação frontal com halteres', 'Ombros', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/537379541.sd.mp4?s=2b386ea9b6efa0c421ce3f71a978f42e8f155fa4&profile_id=164', 'external', ARRAY['ELEVAÇÃO FRONTAL HALTER','Elevação Frontal com Halteres','Elevação frontal com halteres']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["ELEVAÇÃO FRONTAL HALTER", "Elevação Frontal com Halteres", "Elevação frontal com halteres"]}'::jsonb),
('ELEVAÇÃO FRONTAL COM pega NEUTRA', 'Ombros', null, 'Força', null, null, 'https://youtu.be/SkDKS8_E_r0', 'external', ARRAY['ELEVAÇÃO FRONTAL COM PEGADA NEUTRA']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÃO FRONTAL COM PEGADA NEUTRA"]}'::jsonb),
('Elevação Frontal Deitado', 'Ombros', null, 'Força', null, null, null, null, ARRAY['ELEVAÇÃO FRONTAL DEITADO']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÃO FRONTAL DEITADO"]}'::jsonb),
('Elevação Frontal Pronada na Cross', 'Ombros', 'Polia', 'Força', null, null, 'https://vimeo.com/896526096/f9a6629d56', 'external', ARRAY['Elevação Frontal Pronada na Cross']::text[], '{"sources": ["tecnofit"], "original_names": ["Elevação Frontal Pronada na Cross"]}'::jsonb),
('Elevação Frontal Supinada', 'Ombros', null, 'Força', null, null, null, null, ARRAY['ELEVAÇÃO FRONTAL SUPINADA']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÃO FRONTAL SUPINADA"]}'::jsonb),
('Elevação lateral', 'Ombros', 'Halteres', 'Hipertrofia', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/475594539.sd.mp4?s=636b79508816c4ea9cf46677f557fbb1bbc69cf5&profile_id=165', 'external', ARRAY['ELEVAÇÃO LATERAL','Elevação Lateral']::text[], '{"sources": ["seed", "tecnofit"], "original_names": ["ELEVAÇÃO LATERAL", "Elevação Lateral"]}'::jsonb),
('Elevação Lateral + Frontal em T', 'Ombros', null, 'Força', null, null, 'https://youtu.be/HNXAbZ3Bwyc', 'external', ARRAY['Elevação Lateral + Frontal em T']::text[], '{"sources": ["tecnofit"], "original_names": ["Elevação Lateral + Frontal em T"]}'::jsonb),
('Elevação lateral com halteres', 'Ombros', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/537379843.sd.mp4?s=a293ea7bf958def0e3aec69b63e9fc0eb1f77f49&profile_id=164', 'external', ARRAY['ELEVAÇÃO LATERAL HALTER','Elevação lateral com halteres']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["ELEVAÇÃO LATERAL HALTER", "Elevação lateral com halteres"]}'::jsonb),
('Elevação Lateral Cross', 'Ombros', 'Polia', 'Força', null, null, null, null, ARRAY['ELEVAÇÃO LATERAL CROSS']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÃO LATERAL CROSS"]}'::jsonb),
('Elevação Lateral e Frontal com Halteres', 'Ombros', 'Halteres', 'Força', null, null, 'https://youtu.be/HNXAbZ3Bwyc', 'external', ARRAY['ELEVAÇÃO LATERAL E FRONTAL COM HALTERES']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÃO LATERAL E FRONTAL COM HALTERES"]}'::jsonb),
('Elevação lateral na máquina', 'Ombros', 'Máquina', 'Força', null, null, null, null, ARRAY['Elevação lateral na máquina']::text[], '{"sources": ["annex3"], "original_names": ["Elevação lateral na máquina"]}'::jsonb),
('Elevação lateral na polia unilateral', 'Ombros', 'Polia', 'Força', null, null, null, null, ARRAY['Elevação lateral na polia unilateral']::text[], '{"sources": ["annex3"], "original_names": ["Elevação lateral na polia unilateral"]}'::jsonb),
('Elevação Lateral Sentado', 'Ombros', null, 'Força', null, null, 'https://vimeo.com/896528225/2aedd0d239', 'external', ARRAY['Elevação Lateral Sentado']::text[], '{"sources": ["tecnofit"], "original_names": ["Elevação Lateral Sentado"]}'::jsonb),
('Elevação Lateral Tronco Inclinado', 'Ombros', null, 'Força', null, null, 'https://youtu.be/iKsRM-0ot1Q', 'external', ARRAY['Elevação Lateral Tronco Inclinado']::text[], '{"sources": ["tecnofit"], "original_names": ["Elevação Lateral Tronco Inclinado"]}'::jsonb),
('Elevação LATERAL/FRONTAL', 'Ombros', null, 'Força', null, null, 'https://player.vimeo.com/external/475596360.sd.mp4?s=ed804263bf45123fa000e4e4eb1c9a7acf60abef&profile_id=165', 'external', ARRAY['ELEVAÇÃO LATERAL/FRONTAL']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÃO LATERAL/FRONTAL"]}'::jsonb),
('Elevação Posterior', 'Ombros', null, 'Força', null, null, null, null, ARRAY['ELEVAÇÃO POSTERIOR']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÃO POSTERIOR"]}'::jsonb),
('Elevações em T', 'Ombros', null, 'Força', null, null, 'https://youtu.be/PCwsNZ4w_J8', 'external', ARRAY['ELEVAÇÕES EM T']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÕES EM T"]}'::jsonb),
('Elevações em Y', 'Ombros', null, 'Força', null, null, 'https://youtu.be/6RD1wpdhqjY', 'external', ARRAY['ELEVAÇÕES EM Y']::text[], '{"sources": ["tecnofit"], "original_names": ["ELEVAÇÕES EM Y"]}'::jsonb),
('Encolhimento Smith', 'Ombros', 'Máquina Smith', 'Força', null, null, null, null, ARRAY['ENCOLHIMENTO SMITH']::text[], '{"sources": ["tecnofit"], "original_names": ["ENCOLHIMENTO SMITH"]}'::jsonb),
('Extensão de Ombros no Chão', 'Ombros', null, 'Força', null, null, 'https://youtu.be/3bE_p6eO57I', 'external', ARRAY['EXTENSÃO DE OMBROS NO CHÃO']::text[], '{"sources": ["tecnofit"], "original_names": ["EXTENSÃO DE OMBROS NO CHÃO"]}'::jsonb),
('Face Pull', 'Ombros', 'Polia', 'Prevenção', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Face Pull']::text[], '{"sources": ["seed"], "original_names": ["Face Pull"]}'::jsonb),
('KB Sholder Rolls', 'Ombros', 'Kettlebell', 'Força', null, null, 'https://youtu.be/ZxUy4lkUrYA', 'external', ARRAY['KB SHOLDER ROLLS']::text[], '{"sources": ["tecnofit"], "original_names": ["KB SHOLDER ROLLS"]}'::jsonb),
('Neutral Grip Front Raise', 'Ombros', null, 'Força', null, null, 'https://youtu.be/SkDKS8_E_r0', 'external', ARRAY['NEUTRAL GRIP FRONT RAISE']::text[], '{"sources": ["tecnofit"], "original_names": ["NEUTRAL GRIP FRONT RAISE"]}'::jsonb),
('Plate Cuban Press', 'Ombros', 'Anilha', 'Força', null, null, 'https://youtu.be/vrOQlj2ayaM', 'external', ARRAY['PLATE CUBAN PRESS']::text[], '{"sources": ["tecnofit"], "original_names": ["PLATE CUBAN PRESS"]}'::jsonb),
('Plate Reverse Fly', 'Ombros', 'Anilha', 'Força', null, null, 'https://youtu.be/iKsRM-0ot1Q', 'external', ARRAY['PLATE REVERSE FLY']::text[], '{"sources": ["tecnofit"], "original_names": ["PLATE REVERSE FLY"]}'::jsonb),
('Posterior Cross', 'Ombros', 'Polia', 'Força', null, null, null, null, ARRAY['POSTERIOR CROSS']::text[], '{"sources": ["tecnofit"], "original_names": ["POSTERIOR CROSS"]}'::jsonb),
('Press Arnold', 'Ombros', null, 'Força', null, null, 'https://player.vimeo.com/external/475585528.sd.mp4?s=1509f1db8cd8362c99ef8e4e6a1c7a732cd03167&profile_id=165', 'external', ARRAY['DESENVOLVIMENTO ARNOLD']::text[], '{"sources": ["tecnofit"], "original_names": ["DESENVOLVIMENTO ARNOLD"]}'::jsonb),
('Press Arnold com halteres', 'Ombros', 'Halteres', 'Força', null, null, 'https://youtu.be/4XfZ2IYilzw', 'external', ARRAY['PRESS ARNOLD COM HALTERES']::text[], '{"sources": ["tecnofit"], "original_names": ["PRESS ARNOLD COM HALTERES"]}'::jsonb),
('Press Arnold sentado', 'Ombros', null, 'Força', null, null, 'https://player.vimeo.com/external/475616933.sd.mp4?s=117f539dc9abc19d12289f6f09eb27b2fe71c40a&profile_id=164', 'external', ARRAY['DESENVOLVIMENTO ARNOLD SENTADO']::text[], '{"sources": ["tecnofit"], "original_names": ["DESENVOLVIMENTO ARNOLD SENTADO"]}'::jsonb),
('Press Cubano com Anilha', 'Ombros', 'Anilha', 'Força', null, null, 'https://youtu.be/vrOQlj2ayaM', 'external', ARRAY['PRESS CUBANO COM ANILHA']::text[], '{"sources": ["tecnofit"], "original_names": ["PRESS CUBANO COM ANILHA"]}'::jsonb),
('Press Cubano com Halteres', 'Ombros', 'Halteres', 'Força', null, null, 'https://youtu.be/vrOQlj2ayaM', 'external', ARRAY['PRESS CUBANO COM HALTERES']::text[], '{"sources": ["tecnofit"], "original_names": ["PRESS CUBANO COM HALTERES"]}'::jsonb),
('Press de ombros atrás da nuca com barra', 'Ombros', 'Barra', 'Força', null, null, null, null, ARRAY['DESENVOLVIMENTO TRÁS BARRA']::text[], '{"sources": ["tecnofit"], "original_names": ["DESENVOLVIMENTO TRÁS BARRA"]}'::jsonb),
('Press de ombros atrás da nuca na Smith', 'Ombros', 'Máquina Smith', 'Força', null, null, null, null, ARRAY['DESENVOLVIMENTO TRÁS SMITH']::text[], '{"sources": ["tecnofit"], "original_names": ["DESENVOLVIMENTO TRÁS SMITH"]}'::jsonb),
('Press de ombros com barra', 'Ombros', 'Barra', 'Força', null, null, 'https://player.vimeo.com/external/475587697.sd.mp4?s=121a6903e19e2418e4e7117f1aef43d9e2cad46b&profile_id=165', 'external', ARRAY['DESENVOLVIMENTO FRENTE BARRA']::text[], '{"sources": ["tecnofit"], "original_names": ["DESENVOLVIMENTO FRENTE BARRA"]}'::jsonb),
('Press de ombros com curl', 'Ombros', null, 'Força', null, null, 'https://player.vimeo.com/external/475617049.sd.mp4?s=03f48b2baf701d9356db7cefc5f9cfb9c6985465&profile_id=164', 'external', ARRAY['DESENVOLVIMENTO COM ROSCA DIRETA','press de ombros COM curl DIRETA']::text[], '{"sources": ["tecnofit"], "original_names": ["DESENVOLVIMENTO COM ROSCA DIRETA", "press de ombros COM curl DIRETA"]}'::jsonb),
('Press de ombros com halteres', 'Ombros', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475616993.sd.mp4?s=66c484bc30a4a667cce0136e3d048ea7c722041f&profile_id=164', 'external', ARRAY['DESENVOLVIMENTO HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["DESENVOLVIMENTO HALTER"]}'::jsonb),
('Press de ombros com halteres em voo', 'Ombros', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475594948.sd.mp4?s=2650edfec5a16d071f31c17c6d2a99fe67209bfc&profile_id=165', 'external', ARRAY['DESENVOLVIMENTO HALTER VOADOR','press de ombros HALTER VOADOR']::text[], '{"sources": ["tecnofit"], "original_names": ["DESENVOLVIMENTO HALTER VOADOR", "press de ombros HALTER VOADOR"]}'::jsonb),
('Press de ombros com pega neutra', 'Ombros', null, 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/b809ffd7-c145-463e-a4d5-b213da1b3642/playlist.m3u8', 'external', ARRAY['Desenvolvimento Neutro']::text[], '{"sources": ["tecnofit"], "original_names": ["Desenvolvimento Neutro"]}'::jsonb),
('Press de ombros frontal', 'Ombros', null, 'Força', null, null, null, null, ARRAY['DESENVOLVIMENTO FRONTAL']::text[], '{"sources": ["tecnofit"], "original_names": ["DESENVOLVIMENTO FRONTAL"]}'::jsonb),
('Press de ombros na máquina', 'Ombros', 'Máquina', 'Força', null, null, 'https://player.vimeo.com/external/537379027.sd.mp4?s=5d6648dba70c2df0780be62bce018202d3aa4d63&profile_id=164', 'external', ARRAY['DESENVOLVIMENTO MÁQUINA']::text[], '{"sources": ["tecnofit"], "original_names": ["DESENVOLVIMENTO MÁQUINA"]}'::jsonb),
('Press de ombros na máquina Smith', 'Ombros', 'Máquina Smith', 'Força', null, null, null, null, ARRAY['DESENVOLVIMENTO FRENTE SMITH']::text[], '{"sources": ["tecnofit"], "original_names": ["DESENVOLVIMENTO FRENTE SMITH"]}'::jsonb),
('Press militar', 'Ombros', 'Barra/Halteres', 'Força', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Desenvolvimento Militar']::text[], '{"sources": ["seed"], "original_names": ["Desenvolvimento Militar"]}'::jsonb),
('Press militar com barra', 'Ombros', 'Barra', 'Força', null, null, null, null, ARRAY['Press militar com barra']::text[], '{"sources": ["annex3"], "original_names": ["Press militar com barra"]}'::jsonb),
('Press militar com halteres', 'Ombros', 'Halteres', 'Força', null, null, null, null, ARRAY['Press militar com halteres']::text[], '{"sources": ["annex3"], "original_names": ["Press militar com halteres"]}'::jsonb),
('Prone Snow Angels', 'Ombros', null, 'Força', null, null, 'https://youtu.be/s15T9DPggkQ', 'external', ARRAY['PRONE SNOW ANGELS']::text[], '{"sources": ["tecnofit"], "original_names": ["PRONE SNOW ANGELS"]}'::jsonb),
('Remada alta com barra', 'Ombros', 'Barra', 'Força', null, null, 'https://player.vimeo.com/external/475589708.sd.mp4?s=9ec90fedb7704af810781d39fd37dce1ccad4c0f&profile_id=165', 'external', ARRAY['REMADA ALTA BARRA','REMADA EM PÉ BARRA','Remada alta com barra']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["REMADA ALTA BARRA", "REMADA EM PÉ BARRA", "Remada alta com barra"]}'::jsonb),
('Remada Alta Halter', 'Ombros', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475594838.sd.mp4?s=3669b2f7d33c836efd309254e336c4d501ead4ab&profile_id=164', 'external', ARRAY['REMADA ALTA HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA ALTA HALTER"]}'::jsonb),
('Remada deltoide posterior na polia alta com corda', 'Ombros', 'Polia', 'Força', null, null, null, null, ARRAY['Remada deltoide posterior na polia alta com corda']::text[], '{"sources": ["annex3"], "original_names": ["Remada deltoide posterior na polia alta com corda"]}'::jsonb),
('Remada em Pé Cross', 'Ombros', 'Polia', 'Força', null, null, null, null, ARRAY['REMADA EM PÉ CROSS']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA EM PÉ CROSS"]}'::jsonb),
('Remada em Pé Smith', 'Ombros', 'Máquina Smith', 'Força', null, null, null, null, ARRAY['REMADA EM PÉ SMITH']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA EM PÉ SMITH"]}'::jsonb),
('Remada Unilateral', 'Ombros', null, 'Força', null, null, 'https://player.vimeo.com/external/475594997.sd.mp4?s=e7665e37bfb0ad95c883bf9c7e625fd800d195d7&profile_id=165', 'external', ARRAY['REMADA UNILATERAL']::text[], '{"sources": ["tecnofit"], "original_names": ["REMADA UNILATERAL"]}'::jsonb),
('Rotação', 'Ombros', null, 'Força', null, null, 'https://player.vimeo.com/external/475617207.sd.mp4?s=510be083aa01815a6bb5321c86095c0ddd92cacc&profile_id=165', 'external', ARRAY['ROTAÇÃO']::text[], '{"sources": ["tecnofit"], "original_names": ["ROTAÇÃO"]}'::jsonb),
('Rotação de Braços', 'Ombros', null, 'Força', null, null, 'https://player.vimeo.com/external/475580575.sd.mp4?s=199d2fbc6bd48d96ecf7f6867a626b1d1761c88d&profile_id=165', 'external', ARRAY['ROTAÇÃO DE BRAÇOS']::text[], '{"sources": ["tecnofit"], "original_names": ["ROTAÇÃO DE BRAÇOS"]}'::jsonb),
('Rotação de Ombros com Halter', 'Ombros', 'Halteres', 'Força', null, null, 'https://youtu.be/ZxUy4lkUrYA', 'external', ARRAY['ROTAÇÃO DE OMBROS COM HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["ROTAÇÃO DE OMBROS COM HALTER"]}'::jsonb),
('Rotação Externa Sentada', 'Ombros', null, 'Força', null, null, 'https://youtu.be/S9jBgftIikI', 'external', ARRAY['ROTAÇÃO EXTERNA SENTADA']::text[], '{"sources": ["tecnofit"], "original_names": ["ROTAÇÃO EXTERNA SENTADA"]}'::jsonb),
('Seated External Rotation', 'Ombros', null, 'Força', null, null, 'https://youtu.be/S9jBgftIikI', 'external', ARRAY['SEATED EXTERNAL ROTATION']::text[], '{"sources": ["tecnofit"], "original_names": ["SEATED EXTERNAL ROTATION"]}'::jsonb),
('Shoulder Extension Stretch On Floor', 'Ombros', null, 'Força', null, null, 'https://youtu.be/3bE_p6eO57I', 'external', ARRAY['SHOULDER EXTENSION STRETCH ON FLOOR']::text[], '{"sources": ["tecnofit"], "original_names": ["SHOULDER EXTENSION STRETCH ON FLOOR"]}'::jsonb),
('T Raises', 'Ombros', null, 'Força', null, null, 'https://youtu.be/PCwsNZ4w_J8', 'external', ARRAY['T RAISES']::text[], '{"sources": ["tecnofit"], "original_names": ["T RAISES"]}'::jsonb),
('Voo com Anilha', 'Ombros', 'Anilha', 'Força', null, null, 'https://youtu.be/iKsRM-0ot1Q', 'external', ARRAY['VOO COM ANILHA']::text[], '{"sources": ["tecnofit"], "original_names": ["VOO COM ANILHA"]}'::jsonb),
('Voo posterior unilateral', 'Ombros', null, 'Força', null, null, null, null, ARRAY['Crucifixo invertido unilateral']::text[], '{"sources": ["annex3"], "original_names": ["Crucifixo invertido unilateral"]}'::jsonb),
('Voo posterior unilateral inclinado com halter', 'Ombros', 'Halteres', 'Força', null, null, null, null, ARRAY['Crucifixo invertido curvado unilateral com halter']::text[], '{"sources": ["annex3"], "original_names": ["Crucifixo invertido curvado unilateral com halter"]}'::jsonb),
('Voos em máquina', 'Ombros', 'Máquina', 'Força', null, null, null, null, ARRAY['Voos em máquina']::text[], '{"sources": ["annex3"], "original_names": ["Voos em máquina"]}'::jsonb),
('Voos em polia alta', 'Ombros', 'Polia', 'Força', null, null, null, null, ARRAY['Voos em polia alta']::text[], '{"sources": ["annex3"], "original_names": ["Voos em polia alta"]}'::jsonb),
('Voos posteriores a 90º', 'Ombros', null, 'Força', null, null, null, null, ARRAY['CRUCIFIXO 90º','Crucifixo 90º']::text[], '{"sources": ["tecnofit"], "original_names": ["CRUCIFIXO 90º", "Crucifixo 90º"]}'::jsonb),
('Voos posteriores no banco inclinado', 'Ombros', null, 'Força', null, null, null, null, ARRAY['Crucifixo invertido no banco inclinado']::text[], '{"sources": ["annex3"], "original_names": ["Crucifixo invertido no banco inclinado"]}'::jsonb),
('Voos posteriores sentado', 'Ombros', null, 'Força', null, null, null, null, ARRAY['Crucifixo invertido sentado']::text[], '{"sources": ["annex3"], "original_names": ["Crucifixo invertido sentado"]}'::jsonb),
('Y Raises', 'Ombros', null, 'Força', null, null, 'https://youtu.be/6RD1wpdhqjY', 'external', ARRAY['Y RAISES']::text[], '{"sources": ["tecnofit"], "original_names": ["Y RAISES"]}'::jsonb),
('Aberturas com halteres', 'Peitoral', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475589792.sd.mp4?s=32b47aa68814ece2211e8b5fcd985df2f2c7c60c&profile_id=164', 'external', ARRAY['CRUCIFIXO RETO','Crucifixo/aberturas com halteres']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["CRUCIFIXO RETO", "Crucifixo/aberturas com halteres"]}'::jsonb),
('Aberturas declinadas com halteres', 'Peitoral', 'Halteres', 'Força', null, null, null, null, ARRAY['CRUCIFIXO DECLINADO','Crucifixo/aberturas declinado com halteres']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["CRUCIFIXO DECLINADO", "Crucifixo/aberturas declinado com halteres"]}'::jsonb),
('Aberturas deitado na polia baixa', 'Peitoral', 'Polia', 'Força', null, null, null, null, ARRAY['Crucifixo/aberturas deitado em polia baixa']::text[], '{"sources": ["annex3"], "original_names": ["Crucifixo/aberturas deitado em polia baixa"]}'::jsonb),
('Aberturas em pé na polia', 'Peitoral', 'Polia', 'Força', null, null, null, null, ARRAY['Crucifixo/aberturas em pé em polia']::text[], '{"sources": ["annex3"], "original_names": ["Crucifixo/aberturas em pé em polia"]}'::jsonb),
('Aberturas inclinadas com halteres', 'Peitoral', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/537378607.sd.mp4?s=4e728f5578c6c6b0664c8bbe8d3cab301fc22a60&profile_id=164', 'external', ARRAY['CRUCIFIXO INCLINADO','Crucifixo/aberturas inclinado com halteres']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["CRUCIFIXO INCLINADO", "Crucifixo/aberturas inclinado com halteres"]}'::jsonb),
('Aberturas na máquina', 'Peitoral', 'Máquina', 'Força', null, null, 'https://player.vimeo.com/external/475612042.sd.mp4?s=1171eb7d2a272ad7193bec501613747b432f57f8&profile_id=165', 'external', ARRAY['CRUCIFIXO VOADOR MÁQUINA','Crucifixo/aberturas em máquina','VOADOR']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["CRUCIFIXO VOADOR MÁQUINA", "Crucifixo/aberturas em máquina", "VOADOR"]}'::jsonb),
('Aberturas na polia', 'Peitoral', 'Polia', 'Hipertrofia', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Crucifixo na Polia']::text[], '{"sources": ["seed"], "original_names": ["Crucifixo na Polia"]}'::jsonb),
('Alongamento Chão com Braço Dobrado', 'Peitoral', 'Peso corporal', 'Força', null, null, 'https://youtu.be/5EXw25t7n4I', 'external', ARRAY['ALONGAMENTO CHÃO COM BRAÇO DOBRADO']::text[], '{"sources": ["tecnofit"], "original_names": ["ALONGAMENTO CHÃO COM BRAÇO DOBRADO"]}'::jsonb),
('Alongamento de Peito com 1 Braço', 'Peitoral', 'Peso corporal', 'Força', null, null, 'https://youtu.be/3a5ndJo0vio', 'external', ARRAY['ALONGAMENTO DE PEITO COM 1 BRAÇO']::text[], '{"sources": ["tecnofit"], "original_names": ["ALONGAMENTO DE PEITO COM 1 BRAÇO"]}'::jsonb),
('Bar Baixa: Trans. de Músc. na Bar. C 1 Perna e Cx.', 'Peitoral', null, 'Força', null, null, 'https://youtu.be/Tf6UJFnZlyQ', 'external', ARRAY['BAR BAIXA: TRANS. DE MÚSC. NA BAR. C 1 PERNA E CX.']::text[], '{"sources": ["tecnofit"], "original_names": ["BAR BAIXA: TRANS. DE MÚSC. NA BAR. C 1 PERNA E CX."]}'::jsonb),
('Barra Até O Quadril com 1 Pé na Caixa', 'Peitoral', 'Barra', 'Força', null, null, 'https://youtu.be/VpbgLPt3UDA', 'external', ARRAY['BARRA ATÉ O QUADRIL COM 1 PÉ NA CAIXA']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA ATÉ O QUADRIL COM 1 PÉ NA CAIXA"]}'::jsonb),
('Barra Baixa: Transição de Músculo na Barra', 'Peitoral', 'Barra', 'Força', null, null, 'https://youtu.be/OzSdFqE62eU', 'external', ARRAY['BARRA BAIXA: TRANSIÇÃO DE MÚSCULO NA BARRA']::text[], '{"sources": ["tecnofit"], "original_names": ["BARRA BAIXA: TRANSIÇÃO DE MÚSCULO NA BARRA"]}'::jsonb),
('Bent Arm Prone Stretch', 'Peitoral', null, 'Força', null, null, 'https://youtu.be/5EXw25t7n4I', 'external', ARRAY['BENT ARM PRONE STRETCH']::text[], '{"sources": ["tecnofit"], "original_names": ["BENT ARM PRONE STRETCH"]}'::jsonb),
('Box One Leg Bar Muscle Up Transition Drill', 'Peitoral', 'Caixa', 'Força', null, null, 'https://youtu.be/VpbgLPt3UDA', 'external', ARRAY['BOX ONE LEG BAR MUSCLE UP TRANSITION DRILL']::text[], '{"sources": ["tecnofit"], "original_names": ["BOX ONE LEG BAR MUSCLE UP TRANSITION DRILL"]}'::jsonb),
('Close Grip Push Up', 'Peitoral', null, 'Força', null, null, 'https://youtu.be/WNmTJPt-tCw', 'external', ARRAY['Close Grip Push Up']::text[], '{"sources": ["tecnofit"], "original_names": ["Close Grip Push Up"]}'::jsonb),
('Cross Over', 'Peitoral', 'Polia', 'Força', null, null, null, null, ARRAY['CROSS OVER']::text[], '{"sources": ["tecnofit"], "original_names": ["CROSS OVER"]}'::jsonb),
('DB Chest Fly', 'Peitoral', 'Halteres', 'Força', null, null, 'https://youtu.be/EFwqXvDDWq4', 'external', ARRAY['DB Chest Fly']::text[], '{"sources": ["tecnofit"], "original_names": ["DB Chest Fly"]}'::jsonb),
('DB Pull Over', 'Peitoral', 'Halteres', 'Força', null, null, 'https://youtu.be/S-yztq0BloM', 'external', ARRAY['DB Pull Over']::text[], '{"sources": ["tecnofit"], "original_names": ["DB Pull Over"]}'::jsonb),
('Dips na Caixa', 'Peitoral', 'Caixa', 'Força', null, null, 'https://youtu.be/WIWPmFHJpPE', 'external', ARRAY['Dips na Caixa']::text[], '{"sources": ["tecnofit"], "original_names": ["Dips na Caixa"]}'::jsonb),
('Dips On Boxes', 'Peitoral', 'Caixa', 'Força', null, null, 'https://youtu.be/WIWPmFHJpPE', 'external', ARRAY['Dips On Boxes']::text[], '{"sources": ["tecnofit"], "original_names": ["Dips On Boxes"]}'::jsonb),
('Flexão com Remada Unilateral Halter', 'Peitoral', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475612972.sd.mp4?s=05c621285826a1b83c459674a113487d68b84c21&profile_id=164', 'external', ARRAY['FLEXÃO COM REMADA UNILATERAL HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["FLEXÃO COM REMADA UNILATERAL HALTER"]}'::jsonb),
('Flexão em T', 'Peitoral', 'Peso corporal', 'Força', null, null, 'https://player.vimeo.com/external/475619688.sd.mp4?s=d44600e470a9711a9a9bd1c0cfa5ef3134e9f66b&profile_id=164', 'external', ARRAY['FLEXÃO EM T']::text[], '{"sources": ["tecnofit"], "original_names": ["FLEXÃO EM T"]}'::jsonb),
('Flexões', 'Peitoral', 'Peso corporal', 'Força', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/475595003.sd.mp4?s=a5e25f4f4053c45aa727c248e049f1c8d53bee6b&profile_id=165', 'external', ARRAY['Flexão de braço (peito)','FLEXÃO DE BRAÇO','Flexões']::text[], '{"sources": ["annex3", "seed", "tecnofit"], "original_names": ["Flexão de braço (peito)", "FLEXÃO DE BRAÇO", "Flexões"]}'::jsonb),
('Flexões com deslizamento', 'Peitoral', 'Peso corporal', 'Força', null, null, null, null, ARRAY['Flexão de braços com deslizamento']::text[], '{"sources": ["annex3"], "original_names": ["Flexão de braços com deslizamento"]}'::jsonb),
('Flexões com joelhos apoiados', 'Peitoral', null, 'Força', null, null, 'https://player.vimeo.com/external/475609697.sd.mp4?s=7a5ba77f3db86172aeb3b83fb3780e5d1dcaa007&profile_id=164', 'external', ARRAY['FLEXÃO DE BRAÇOS JOELHO APOIADO']::text[], '{"sources": ["tecnofit"], "original_names": ["FLEXÃO DE BRAÇOS JOELHO APOIADO"]}'::jsonb),
('Flexões com palmas', 'Peitoral', 'Peso corporal', 'Força', null, null, null, null, ARRAY['Flexão de braços com palmas']::text[], '{"sources": ["annex3"], "original_names": ["Flexão de braços com palmas"]}'::jsonb),
('Flexões com pega fechada', 'Peitoral', null, 'Força', null, null, 'https://youtu.be/WNmTJPt-tCw', 'external', ARRAY['Flexão de Braço Fechado']::text[], '{"sources": ["tecnofit"], "original_names": ["Flexão de Braço Fechado"]}'::jsonb),
('Flexões com rotação do tronco', 'Peitoral', 'Peso corporal', 'Força', null, null, null, null, ARRAY['Flexão de braços com rotação do tronco']::text[], '{"sources": ["annex3"], "original_names": ["Flexão de braços com rotação do tronco"]}'::jsonb),
('Flexões com uma mão', 'Peitoral', 'Peso corporal', 'Força', null, null, null, null, ARRAY['Flexão de braços com uma mão']::text[], '{"sources": ["annex3"], "original_names": ["Flexão de braços com uma mão"]}'::jsonb),
('Flexões com uma mão assistida', 'Peitoral', 'Peso corporal', 'Força', null, null, null, null, ARRAY['Flexão de braços com uma mão assistida']::text[], '{"sources": ["annex3"], "original_names": ["Flexão de braços com uma mão assistida"]}'::jsonb),
('Flexões declinadas', 'Peitoral', null, 'Força', null, null, 'https://player.vimeo.com/external/475594282.sd.mp4?s=cb49f63b0ebff8e3043e3e0fa390f069bc91dbb9&profile_id=164', 'external', ARRAY['FLEXÃO DE BRAÇO DECLINADA','Flexão de braços declinada']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["FLEXÃO DE BRAÇO DECLINADA", "Flexão de braços declinada"]}'::jsonb),
('Flexões diamante', 'Peitoral', null, 'Força', null, null, 'https://player.vimeo.com/external/475594359.sd.mp4?s=2b7bc99af7fabc7272c9ccfcf97f9826ca1a202d&profile_id=165', 'external', ARRAY['FLEXÃO DIAMANTE']::text[], '{"sources": ["tecnofit"], "original_names": ["FLEXÃO DIAMANTE"]}'::jsonb),
('Flexões inclinadas', 'Peitoral', 'Peso corporal', 'Força', null, null, null, null, ARRAY['Flexão de braços inclinada']::text[], '{"sources": ["annex3"], "original_names": ["Flexão de braços inclinada"]}'::jsonb),
('Flexões na bola', 'Peitoral', 'Bola', 'Força', null, null, 'https://player.vimeo.com/external/475619562.sd.mp4?s=887caa1d6ac0848a4f64a28236f6de8a1b0d457d&profile_id=164', 'external', ARRAY['FLEXÃO DE BRAÇO BOLA','Flexão de Braço Bola']::text[], '{"sources": ["tecnofit"], "original_names": ["FLEXÃO DE BRAÇO BOLA", "Flexão de Braço Bola"]}'::jsonb),
('Flexões na parede', 'Peitoral', null, 'Força', null, null, 'https://player.vimeo.com/external/475621636.sd.mp4?s=782e860c7020afafde82ef678342ee7136ce51d0&profile_id=165', 'external', ARRAY['FLEXÃO NA PAREDE']::text[], '{"sources": ["tecnofit"], "original_names": ["FLEXÃO NA PAREDE"]}'::jsonb),
('Flexões no caixote', 'Peitoral', 'Caixa', 'Força', null, null, 'https://player.vimeo.com/external/475607669.sd.mp4?s=0861f175efa680e3cf9c6d96eaef7b41a7c2a3b1&profile_id=164', 'external', ARRAY['FLEXÃO DE BRAÇO NO CAIXOTE']::text[], '{"sources": ["tecnofit"], "original_names": ["FLEXÃO DE BRAÇO NO CAIXOTE"]}'::jsonb),
('Fundos para peito', 'Peitoral', 'Peso corporal', 'Força', null, null, null, null, ARRAY['Fundos para peito']::text[], '{"sources": ["annex3"], "original_names": ["Fundos para peito"]}'::jsonb),
('Low Bar: 1 Leg Bar Muscle Up Box Transition Drill', 'Peitoral', 'Caixa', 'Força', null, null, 'https://youtu.be/Tf6UJFnZlyQ', 'external', ARRAY['Low Bar: 1 Leg Bar Muscle Up Box Transition Drill']::text[], '{"sources": ["tecnofit"], "original_names": ["Low Bar: 1 Leg Bar Muscle Up Box Transition Drill"]}'::jsonb),
('Low Bar: Bar Muscle Up Transition Drill', 'Peitoral', null, 'Força', null, null, 'https://youtu.be/OzSdFqE62eU', 'external', ARRAY['Low Bar: Bar Muscle Up Transition Drill']::text[], '{"sources": ["tecnofit"], "original_names": ["Low Bar: Bar Muscle Up Transition Drill"]}'::jsonb),
('Passo Lateral Voador', 'Peitoral', 'Máquina', 'Força', null, null, 'https://player.vimeo.com/external/475617523.sd.mp4?s=81c0e9e82feec2d779ba9db82429d5d504f18064&profile_id=164', 'external', ARRAY['PASSO LATERAL VOADOR']::text[], '{"sources": ["tecnofit"], "original_names": ["PASSO LATERAL VOADOR"]}'::jsonb),
('Peitoral com Halteres no Banco', 'Peitoral', 'Halteres', 'Força', null, null, 'https://youtu.be/EFwqXvDDWq4', 'external', ARRAY['Peitoral com Halteres no Banco']::text[], '{"sources": ["tecnofit"], "original_names": ["Peitoral com Halteres no Banco"]}'::jsonb),
('Pull Over com Halteres', 'Peitoral', 'Halteres', 'Força', null, null, 'https://youtu.be/S-yztq0BloM', 'external', ARRAY['Pull Over com Halteres']::text[], '{"sources": ["tecnofit"], "original_names": ["Pull Over com Halteres"]}'::jsonb),
('Pullover', 'Peitoral', null, 'Força', null, null, null, null, ARRAY['Pullover']::text[], '{"sources": ["annex3"], "original_names": ["Pullover"]}'::jsonb),
('Side-to-side Push-up', 'Peitoral', null, 'Força', null, null, null, null, ARRAY['Side-to-side Push-up']::text[], '{"sources": ["annex3"], "original_names": ["Side-to-side Push-up"]}'::jsonb),
('Single Arm Chest Stretch', 'Peitoral', null, 'Força', null, null, 'https://youtu.be/3a5ndJo0vio', 'external', ARRAY['Single Arm Chest Stretch']::text[], '{"sources": ["tecnofit"], "original_names": ["Single Arm Chest Stretch"]}'::jsonb),
('Supino alternado com halteres', 'Peitoral', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475591367.sd.mp4?s=3e0e7355578bcc118fd61864f6f7b999cfd79801&profile_id=164', 'external', ARRAY['SUPINO RETO ALTERNADO HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["SUPINO RETO ALTERNADO HALTER"]}'::jsonb),
('Supino com barra', 'Peitoral', 'Barra', 'Força', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/475589828.sd.mp4?s=cef1e73f9ef6f243fce4582ca1da646433eda643&profile_id=164', 'external', ARRAY['SUPINO RETO','Supino Plano','Supino com barra']::text[], '{"sources": ["annex3", "seed", "tecnofit"], "original_names": ["SUPINO RETO", "Supino Plano", "Supino com barra"]}'::jsonb),
('Supino com halteres', 'Peitoral', 'Halteres', 'Força', null, null, 'https://vimeo.com/853307029/4b9beabce1', 'external', ARRAY['SUPINO PLANO C/HALTER','Supino com halteres']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["SUPINO PLANO C/HALTER", "Supino com halteres"]}'::jsonb),
('Supino Cross Over', 'Peitoral', 'Polia', 'Força', null, null, null, null, ARRAY['SUPINO CROSS OVER']::text[], '{"sources": ["tecnofit"], "original_names": ["SUPINO CROSS OVER"]}'::jsonb),
('Supino declinado com barra', 'Peitoral', 'Barra', 'Força', null, null, null, null, ARRAY['SUPINO DECLINADO','Supino declinado com barra']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["SUPINO DECLINADO", "Supino declinado com barra"]}'::jsonb),
('Supino declinado com halteres', 'Peitoral', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475594316.sd.mp4?s=8ad95e53b08e1e3b7d0dc5dd0b533079060f9e81&profile_id=165', 'external', ARRAY['SUPINO DECLINADO HALTER','Supino declinado com halteres']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["SUPINO DECLINADO HALTER", "Supino declinado com halteres"]}'::jsonb),
('Supino em máquina', 'Peitoral', 'Máquina', 'Força', null, null, 'https://player.vimeo.com/external/475593823.sd.mp4?s=50ea5b9c2e16d4b549094d63177c95826022d80b&profile_id=164', 'external', ARRAY['SUPINO MÁQUINA','Supino em máquina']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["SUPINO MÁQUINA", "Supino em máquina"]}'::jsonb),
('Supino inclinado com barra', 'Peitoral', 'Barra', 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/9e551421-94d0-485c-a2db-d8fcde7b3cbf/playlist.m3u8', 'external', ARRAY['SUPINO INCLINADO','Supino Inclinado Barra','Supino inclinado com barra']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["SUPINO INCLINADO", "Supino Inclinado Barra", "Supino inclinado com barra"]}'::jsonb),
('Supino inclinado com halteres', 'Peitoral', 'Halteres', 'Hipertrofia', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/475607541.sd.mp4?s=05f2f01c21817bed3e9171f3bc05d15aff31e602&profile_id=165', 'external', ARRAY['SUPINO INCLINADO HALTER','Supino Inclinado com Halteres','Supino inclinado com halteres']::text[], '{"sources": ["annex3", "seed", "tecnofit"], "original_names": ["SUPINO INCLINADO HALTER", "Supino Inclinado com Halteres", "Supino inclinado com halteres"]}'::jsonb),
('Supino inclinado na máquina', 'Peitoral', 'Máquina', 'Força', null, null, 'https://vimeo.com/896526791/2bcd258aa4', 'external', ARRAY['Supino Inclinado Máquina']::text[], '{"sources": ["tecnofit"], "original_names": ["Supino Inclinado Máquina"]}'::jsonb),
('Supino inclinado na máquina Smith', 'Peitoral', 'Máquina Smith', 'Força', null, null, 'https://vimeo.com/896526598/4ded85d41e', 'external', ARRAY['Supino Inclinado Smith']::text[], '{"sources": ["tecnofit"], "original_names": ["Supino Inclinado Smith"]}'::jsonb),
('Supino na máquina Smith', 'Peitoral', 'Máquina Smith', 'Força', null, null, 'https://vimeo.com/896526628/0c8ff30a4a', 'external', ARRAY['Supino Reto Smith']::text[], '{"sources": ["tecnofit"], "original_names": ["Supino Reto Smith"]}'::jsonb),
('Tuck Ice Cream Maker', 'Peitoral', null, 'Força', null, null, 'https://youtu.be/OXcSMNfPlw8', 'external', ARRAY['Tuck Ice Cream Maker']::text[], '{"sources": ["tecnofit"], "original_names": ["Tuck Ice Cream Maker"]}'::jsonb),
('Adutor Cross', 'Pernas', 'Polia', 'Força', null, null, null, null, ARRAY['ADUTOR CROSS']::text[], '{"sources": ["tecnofit"], "original_names": ["ADUTOR CROSS"]}'::jsonb),
('Afundo', 'Pernas', 'Peso corporal', 'Força', null, null, 'https://player.vimeo.com/external/475611008.sd.mp4?s=ce59fe189947e552f21a4d04573cf46ac58df12c&profile_id=165', 'external', ARRAY['AFUNDO']::text[], '{"sources": ["tecnofit"], "original_names": ["AFUNDO"]}'::jsonb),
('Afundo Alternado Barra', 'Pernas', 'Barra', 'Força', null, null, 'https://player.vimeo.com/external/475587682.sd.mp4?s=1c54e27419aec84c2a91f19dd706da15527268f8&profile_id=164', 'external', ARRAY['AFUNDO ALTERNADO BARRA']::text[], '{"sources": ["tecnofit"], "original_names": ["AFUNDO ALTERNADO BARRA"]}'::jsonb),
('Afundo Alternado Halter', 'Pernas', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475610949.sd.mp4?s=6cf7366950b33e8b69e3c292add02061d3893901&profile_id=165', 'external', ARRAY['AFUNDO ALTERNADO HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["AFUNDO ALTERNADO HALTER"]}'::jsonb),
('Afundo Barra', 'Pernas', 'Barra', 'Força', null, null, 'https://player.vimeo.com/external/475619026.sd.mp4?s=ac31e3b53cb98c3ec859a7d203c0a79577e959ed&profile_id=165', 'external', ARRAY['AFUNDO BARRA']::text[], '{"sources": ["tecnofit"], "original_names": ["AFUNDO BARRA"]}'::jsonb),
('Afundo com press de ombros com halteres', 'Pernas', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475610953.sd.mp4?s=2acb0c9a25a6cc3f1412c06453b7d14ee6f35ea4&profile_id=164', 'external', ARRAY['AFUNDO COM DESENVOLVIMENTO HALTERES','AFUNDO COM press de ombros HALTERES']::text[], '{"sources": ["tecnofit"], "original_names": ["AFUNDO COM DESENVOLVIMENTO HALTERES", "AFUNDO COM press de ombros HALTERES"]}'::jsonb),
('Afundo Estacionário', 'Pernas', 'Peso corporal', 'Força', null, null, 'https://player.vimeo.com/external/475619066.sd.mp4?s=9f8371c363b3e6891015c855ece1414981bd6d04&profile_id=165', 'external', ARRAY['AFUNDO ESTACIONÁRIO']::text[], '{"sources": ["tecnofit"], "original_names": ["AFUNDO ESTACIONÁRIO"]}'::jsonb),
('Afundo Estacionário Halter', 'Pernas', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475621797.sd.mp4?s=2770908407a54081cd23e4d37f72835ee141f810&profile_id=164', 'external', ARRAY['AFUNDO ESTACIONÁRIO HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["AFUNDO ESTACIONÁRIO HALTER"]}'::jsonb),
('Afundo Halter', 'Pernas', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475621713.sd.mp4?s=348b72d5c82b6c56f418f56e2a567e8d568bad92&profile_id=164', 'external', ARRAY['AFUNDO HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["AFUNDO HALTER"]}'::jsonb),
('Afundo Inverso', 'Pernas', 'Peso corporal', 'Força', null, null, 'https://player.vimeo.com/external/475615704.sd.mp4?s=ccf42e4ed340796de25ca32207f751c8aa873a35&profile_id=165', 'external', ARRAY['AFUNDO INVERSO']::text[], '{"sources": ["tecnofit"], "original_names": ["AFUNDO INVERSO"]}'::jsonb),
('Afundo Lateral', 'Pernas', 'Peso corporal', 'Força', null, null, 'https://player.vimeo.com/external/475617391.sd.mp4?s=cd374f4040b6911abb07313e368a787e3476007f&profile_id=164', 'external', ARRAY['AFUNDO LATERAL']::text[], '{"sources": ["tecnofit"], "original_names": ["AFUNDO LATERAL"]}'::jsonb),
('Afundo Lateral Halter', 'Pernas', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475617393.sd.mp4?s=195411f857fc379bcf4b7b61c12a158a67d568ca&profile_id=164', 'external', ARRAY['AFUNDO LATERAL HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["AFUNDO LATERAL HALTER"]}'::jsonb),
('Afundo Smith', 'Pernas', 'Máquina Smith', 'Força', null, null, 'https://player.vimeo.com/external/475611904.sd.mp4?s=c34b9d32d48fdcbc06d97b406449564b28f8cda8&profile_id=165', 'external', ARRAY['AFUNDO SMITH']::text[], '{"sources": ["tecnofit"], "original_names": ["AFUNDO SMITH"]}'::jsonb),
('Agachamento', 'Pernas', null, 'Força', null, null, 'https://player.vimeo.com/external/475602146.sd.mp4?s=b09d9cb240cca4c66c172c8b58964effca387a05&profile_id=165', 'external', ARRAY['AGACHAMENTO']::text[], '{"sources": ["tecnofit"], "original_names": ["AGACHAMENTO"]}'::jsonb),
('Agachamento Abduzido', 'Pernas', null, 'Força', null, null, null, null, ARRAY['AGACHAMENTO ABDUZIDO']::text[], '{"sources": ["tecnofit"], "original_names": ["AGACHAMENTO ABDUZIDO"]}'::jsonb),
('Agachamento Articulado', 'Pernas', null, 'Força', null, null, 'https://vimeo.com/896526872/c996987299', 'external', ARRAY['Agachamento Articulado']::text[], '{"sources": ["tecnofit"], "original_names": ["Agachamento Articulado"]}'::jsonb),
('Agachamento Banco', 'Pernas', null, 'Força', null, null, 'https://player.vimeo.com/external/475593720.sd.mp4?s=5e3a467e5f1f1225f65ee187d0f88a697341ada9&profile_id=164', 'external', ARRAY['AGACHAMENTO BANCO']::text[], '{"sources": ["tecnofit"], "original_names": ["AGACHAMENTO BANCO"]}'::jsonb),
('Agachamento Barra (com remada alta)', 'Pernas', 'Barra', 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/d1615d00-647d-4956-a6ba-a073586a3db6/playlist.m3u8', 'external', ARRAY['Agachamento Barra (com remada alta)']::text[], '{"sources": ["tecnofit"], "original_names": ["Agachamento Barra (com remada alta)"]}'::jsonb),
('Agachamento Bola', 'Pernas', 'Bola', 'Força', null, null, 'https://player.vimeo.com/external/475619170.sd.mp4?s=b66e93a9f28c092b16c2c5a02184e4d4c392beb2&profile_id=164', 'external', ARRAY['AGACHAMENTO BOLA']::text[], '{"sources": ["tecnofit"], "original_names": ["AGACHAMENTO BOLA"]}'::jsonb),
('Agachamento Búlgaro', 'Pernas', null, 'Força', null, null, 'https://player.vimeo.com/external/475591525.sd.mp4?s=6ff36b0694968c2ad645dcccc17e562634286b91&profile_id=164', 'external', ARRAY['AGACHAMENTO BÚLGARO']::text[], '{"sources": ["tecnofit"], "original_names": ["AGACHAMENTO BÚLGARO"]}'::jsonb),
('Agachamento Búlgaro Halter', 'Pernas', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475591451.sd.mp4?s=62caef6e51d1ceb0f0d7cc8f21657dcb132f32ff&profile_id=165', 'external', ARRAY['AGACHAMENTO BÚLGARO HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["AGACHAMENTO BÚLGARO HALTER"]}'::jsonb),
('AGACHAMENTO COM curl DIRETA', 'Pernas', null, 'Força', null, null, 'https://player.vimeo.com/external/475618533.sd.mp4?s=4a16a2f309b358264fe7d6a6ce687481699ea0e5&profile_id=164', 'external', ARRAY['AGACHAMENTO COM ROSCA DIRETA']::text[], '{"sources": ["tecnofit"], "original_names": ["AGACHAMENTO COM ROSCA DIRETA"]}'::jsonb),
('Agachamento com Halter', 'Pernas', 'Halteres', 'Força', null, null, 'https://vimeo.com/896528095/a52cd9ab68', 'external', ARRAY['Agachamento com Halter']::text[], '{"sources": ["tecnofit"], "original_names": ["Agachamento com Halter"]}'::jsonb),
('Agachamento com press de ombros', 'Pernas', null, 'Força', null, null, 'https://player.vimeo.com/external/475618537.sd.mp4?s=77d20164fb45dd58857b6442f8a5eb40d04ab70d&profile_id=164', 'external', ARRAY['AGACHAMENTO COM DESENVOLVIMENTO','AGACHAMENTO COM press de ombros']::text[], '{"sources": ["tecnofit"], "original_names": ["AGACHAMENTO COM DESENVOLVIMENTO", "AGACHAMENTO COM press de ombros"]}'::jsonb),
('Agachamento com Salto', 'Pernas', null, 'Força', null, null, 'https://player.vimeo.com/external/475618504.sd.mp4?s=cd3e5c59f08dcd03ca7c0306747b73ce647221d7&profile_id=164', 'external', ARRAY['AGACHAMENTO COM SALTO']::text[], '{"sources": ["tecnofit"], "original_names": ["AGACHAMENTO COM SALTO"]}'::jsonb),
('Agachamento Goblet', 'Pernas', 'Halter/Kettlebell', 'Força', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://vimeo.com/896528289/61c9cdcbc4', 'external', ARRAY['Agachamento Goblet','Agachamento Goblet KB']::text[], '{"sources": ["seed", "tecnofit"], "original_names": ["Agachamento Goblet", "Agachamento Goblet KB"]}'::jsonb),
('Agachamento Hack', 'Pernas', null, 'Força', null, null, 'https://vimeo.com/896526850/dcd9b0adaf', 'external', ARRAY['Agachamento Hack']::text[], '{"sources": ["tecnofit"], "original_names": ["Agachamento Hack"]}'::jsonb),
('Agachamento Isométrico', 'Pernas', null, 'Força', null, null, 'https://player.vimeo.com/external/475618487.sd.mp4?s=277ab58886e64ea084196f405da7e52789f724fc&profile_id=164', 'external', ARRAY['AGACHAMENTO ISOMÉTRICO']::text[], '{"sources": ["tecnofit"], "original_names": ["AGACHAMENTO ISOMÉTRICO"]}'::jsonb),
('Agachamento Lateral', 'Pernas', null, 'Força', null, null, 'https://player.vimeo.com/external/475587743.sd.mp4?s=4ef7d4f8216228ebae0585f56aa6e684007d5718&profile_id=165', 'external', ARRAY['AGACHAMENTO LATERAL']::text[], '{"sources": ["tecnofit"], "original_names": ["AGACHAMENTO LATERAL"]}'::jsonb),
('Agachamento na Parede', 'Pernas', null, 'Força', null, null, 'https://player.vimeo.com/external/475621700.sd.mp4?s=9ed8af573c3c251d9a1ffe61e36fbc70a7584e9d&profile_id=164', 'external', ARRAY['AGACHAMENTO NA PAREDE']::text[], '{"sources": ["tecnofit"], "original_names": ["AGACHAMENTO NA PAREDE"]}'::jsonb),
('Agachamento Smith', 'Pernas', 'Máquina Smith', 'Força', null, null, 'https://player.vimeo.com/external/475611892.sd.mp4?s=fe256c2eacb5f3bb63c5963fc4acd9829103bb5d&profile_id=164', 'external', ARRAY['AGACHAMENTO SMITH']::text[], '{"sources": ["tecnofit"], "original_names": ["AGACHAMENTO SMITH"]}'::jsonb),
('Agachamento Sumô com Halter', 'Pernas', 'Halteres', 'Força', null, null, 'https://vimeo.com/896528081/5e5b1d0fd2', 'external', ARRAY['Agachamento Sumô com Halter']::text[], '{"sources": ["tecnofit"], "original_names": ["Agachamento Sumô com Halter"]}'::jsonb),
('Agachamento Sumô Smith', 'Pernas', 'Máquina Smith', 'Força', null, null, 'https://vimeo.com/896526654/6852f5daec', 'external', ARRAY['Agachamento Sumô Smith']::text[], '{"sources": ["tecnofit"], "original_names": ["Agachamento Sumô Smith"]}'::jsonb),
('Alcance de Pés Sentado', 'Pernas', null, 'Força', null, null, 'https://player.vimeo.com/external/475617043.sd.mp4?s=f0c57b489c962136df748f4ad4e05a9365d5fdf7&profile_id=164', 'external', ARRAY['ALCANCE DE PÉS SENTADO']::text[], '{"sources": ["tecnofit"], "original_names": ["ALCANCE DE PÉS SENTADO"]}'::jsonb),
('Avanço', 'Pernas', null, 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/e852254b-23da-425f-a6f5-3b6fc998ebb1/playlist.m3u8', 'external', ARRAY['Avanço']::text[], '{"sources": ["tecnofit"], "original_names": ["Avanço"]}'::jsonb),
('Avanço com press de ombros', 'Pernas', null, 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/6796788c-30c5-47ee-b65b-a1ae682cef6a/playlist.m3u8', 'external', ARRAY['Avanço com Desenvolvimento']::text[], '{"sources": ["tecnofit"], "original_names": ["Avanço com Desenvolvimento"]}'::jsonb),
('Back Lunge', 'Pernas', 'Peso corporal', 'Força', null, null, 'https://youtu.be/8n2LN6rBWIw?si=h7gONMqrI_zANkTV', 'external', ARRAY['Back Lunge']::text[], '{"sources": ["tecnofit"], "original_names": ["Back Lunge"]}'::jsonb),
('Banco Extensor Bilateral', 'Pernas', null, 'Força', null, null, 'https://vimeo.com/896526733/2ef4585584', 'external', ARRAY['Banco Extensor Bilateral']::text[], '{"sources": ["tecnofit"], "original_names": ["Banco Extensor Bilateral"]}'::jsonb),
('Banco Extensor Unilateral', 'Pernas', null, 'Força', null, null, 'https://vimeo.com/896526753/47c792983e', 'external', ARRAY['Banco Extensor Unilateral']::text[], '{"sources": ["tecnofit"], "original_names": ["Banco Extensor Unilateral"]}'::jsonb),
('Cable Horse Kick', 'Pernas', null, 'Força', null, null, 'https://youtu.be/qJxwJ1e1HxI?si=Kj70UNA0tpefCbCG', 'external', ARRAY['Cable Horse Kick']::text[], '{"sources": ["tecnofit"], "original_names": ["Cable Horse Kick"]}'::jsonb),
('Curl femoral deitado bilateral', 'Pernas', null, 'Força', null, null, 'https://vimeo.com/896526807/0178711646', 'external', ARRAY['Mesa Flexora Bilateral']::text[], '{"sources": ["tecnofit"], "original_names": ["Mesa Flexora Bilateral"]}'::jsonb),
('Curl femoral deitado unilateral', 'Pernas', null, 'Força', null, null, 'https://vimeo.com/896526829/0200835806', 'external', ARRAY['Mesa Flexora Unilateral']::text[], '{"sources": ["tecnofit"], "original_names": ["Mesa Flexora Unilateral"]}'::jsonb),
('Curl femoral unilateral', 'Pernas', null, 'Força', null, null, null, null, ARRAY['FLEXOR UNILATERAL']::text[], '{"sources": ["tecnofit"], "original_names": ["FLEXOR UNILATERAL"]}'::jsonb),
('Dumbbell Front Squat', 'Pernas', 'Halteres', 'Força', null, null, 'https://youtu.be/Yip6Lzi5KQw?si=n84OUjwPrjTDJOHm', 'external', ARRAY['Dumbbell Front Squat']::text[], '{"sources": ["tecnofit"], "original_names": ["Dumbbell Front Squat"]}'::jsonb),
('Elevação de gémeos em pé', 'Pernas', null, 'Força', null, null, 'https://player.vimeo.com/external/475593654.sd.mp4?s=58ca39f11d83f23db978c661263e04bec770934d&profile_id=165', 'external', ARRAY['PANTURRILHA LIVRE']::text[], '{"sources": ["tecnofit"], "original_names": ["PANTURRILHA LIVRE"]}'::jsonb),
('Elevação de gémeos na máquina', 'Pernas', 'Máquina', 'Força', null, null, 'https://player.vimeo.com/external/475616979.sd.mp4?s=b3c2c44be347142ff6c499e4619ab222e1255622&profile_id=164', 'external', ARRAY['PANTURRILHA MAQUINA']::text[], '{"sources": ["tecnofit"], "original_names": ["PANTURRILHA MAQUINA"]}'::jsonb),
('Elevação de gémeos no leg press', 'Pernas', null, 'Força', null, null, 'https://player.vimeo.com/external/475593658.sd.mp4?s=011cf24e896c216458761314dffb26880c5a4d5c&profile_id=164', 'external', ARRAY['PANTURRILHA LEG']::text[], '{"sources": ["tecnofit"], "original_names": ["PANTURRILHA LEG"]}'::jsonb),
('Elevação unilateral de gémeos em pé', 'Pernas', null, 'Força', null, null, null, null, ARRAY['PANTURRILHA LIVRE UNILATE']::text[], '{"sources": ["tecnofit"], "original_names": ["PANTURRILHA LIVRE UNILATE"]}'::jsonb),
('Extensão unilateral de pernas na máquina', 'Pernas', 'Máquina', 'Força', null, null, 'https://vimeo.com/896526753/47c792983e', 'external', ARRAY['EXTENSOR UNILATERAL']::text[], '{"sources": ["tecnofit"], "original_names": ["EXTENSOR UNILATERAL"]}'::jsonb),
('Flexor Bola Deitado', 'Pernas', 'Bola', 'Força', null, null, null, null, ARRAY['FLEXOR BOLA DEITADO']::text[], '{"sources": ["tecnofit"], "original_names": ["FLEXOR BOLA DEITADO"]}'::jsonb),
('Flexão de Quadril', 'Pernas', 'Peso corporal', 'Força', null, null, null, null, ARRAY['FLEXÃO DE QUADRIL']::text[], '{"sources": ["tecnofit"], "original_names": ["FLEXÃO DE QUADRIL"]}'::jsonb),
('Gémeos no Smith', 'Pernas', 'Máquina Smith', 'Força', null, null, 'https://youtu.be/7XCu5iGBWxM?si=JFQA1LmyNf-yoUbp', 'external', ARRAY['Gémeos no Smith']::text[], '{"sources": ["tecnofit"], "original_names": ["Gémeos no Smith"]}'::jsonb),
('Kettlebell Swing', 'Pernas', 'Kettlebell', 'Funcional', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/475608515.sd.mp4?s=cc186b0f864ae22a48ab5092d048ea8e670f9c12&profile_id=164', 'external', ARRAY['Kettlebell Swing','SWING (KETTLEBELL)']::text[], '{"sources": ["seed", "tecnofit"], "original_names": ["Kettlebell Swing", "SWING (KETTLEBELL)"]}'::jsonb),
('Leg Press Horizontal Unilateral', 'Pernas', null, 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/2aa58d65-335a-4982-b849-98a2803cbbbc/playlist.m3u8', 'external', ARRAY['Leg Press Horizontal Unilateral']::text[], '{"sources": ["tecnofit"], "original_names": ["Leg Press Horizontal Unilateral"]}'::jsonb),
('Mountain Climber', 'Pernas', 'Peso corporal', 'Força', null, null, 'https://player.vimeo.com/external/475611059.sd.mp4?s=c725711fa092526500b34434c046f88e1e11e74d&profile_id=164', 'external', ARRAY['MOUNTAIN CLIMBER (ESCALADOR)']::text[], '{"sources": ["tecnofit"], "original_names": ["MOUNTAIN CLIMBER (ESCALADOR)"]}'::jsonb),
('peso morto Sumô com Remada Alta', 'Pernas', null, 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/f464681d-bb54-428a-90e6-3627b1b0bd01/playlist.m3u8', 'external', ARRAY['Levantamento Terra Sumô com Remada Alta']::text[], '{"sources": ["tecnofit"], "original_names": ["Levantamento Terra Sumô com Remada Alta"]}'::jsonb),
('Pistol', 'Pernas', null, 'Força', null, null, 'https://player.vimeo.com/external/475612073.sd.mp4?s=4938c5b01872ac1f858c1c98e7c915797810b032&profile_id=165', 'external', ARRAY['PISTOL']::text[], '{"sources": ["tecnofit"], "original_names": ["PISTOL"]}'::jsonb),
('Recuo', 'Pernas', null, 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/3d5dae62-4dea-407e-a1be-42aab2a3e4cf/playlist.m3u8', 'external', ARRAY['Recuo']::text[], '{"sources": ["tecnofit"], "original_names": ["Recuo"]}'::jsonb),
('Recuo com press de ombros', 'Pernas', null, 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/f555928a-d718-45bf-9a90-121011c93192/playlist.m3u8', 'external', ARRAY['Recuo com Desenvolvimento']::text[], '{"sources": ["tecnofit"], "original_names": ["Recuo com Desenvolvimento"]}'::jsonb),
('Recuo Unilateral', 'Pernas', null, 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/84c66b8c-0e90-480f-99f3-abe92d35a6ce/playlist.m3u8', 'external', ARRAY['Recuo Unilateral']::text[], '{"sources": ["tecnofit"], "original_names": ["Recuo Unilateral"]}'::jsonb),
('Stiff com Barra', 'Pernas', 'Barra', 'Força', null, null, 'https://vimeo.com/896526387/a4d1af216a', 'external', ARRAY['Stiff com Barra']::text[], '{"sources": ["tecnofit"], "original_names": ["Stiff com Barra"]}'::jsonb),
('Stiff com halteres', 'Pernas', 'Halteres', 'Força', null, null, 'https://youtube.com/watch?v=16FGtt5niio?si=_GedDmD2et71JLNS', 'external', ARRAY['Stiff com Halteres','Stiff com halteres']::text[], '{"sources": ["tecnofit"], "original_names": ["Stiff com Halteres", "Stiff com halteres"]}'::jsonb),
('Stiff Unilateral 2 Halteres', 'Pernas', 'Halteres', 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/20a57056-1fc5-45fe-b809-b8a56bf00c0c/playlist.m3u8', 'external', ARRAY['Stiff Unilateral 2 Halteres']::text[], '{"sources": ["tecnofit"], "original_names": ["Stiff Unilateral 2 Halteres"]}'::jsonb),
('Stiff Unilateral Bipodal', 'Pernas', null, 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/ff8cba82-a942-4827-ba5e-e223a5959034/playlist.m3u8', 'external', ARRAY['Stiff Unilateral Bipodal']::text[], '{"sources": ["tecnofit"], "original_names": ["Stiff Unilateral Bipodal"]}'::jsonb),
('Stiff Unilateral Bipodal 2 Halteres', 'Pernas', 'Halteres', 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/2e2cbc9b-14fc-4912-ab2f-5acabd6cf49a/playlist.m3u8', 'external', ARRAY['Stiff Unilateral Bipodal 2 Halteres']::text[], '{"sources": ["tecnofit"], "original_names": ["Stiff Unilateral Bipodal 2 Halteres"]}'::jsonb),
('Stiff Unilateral Halter', 'Pernas', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475594146.sd.mp4?s=9a320dd0a6f8cb746d3e88ea7ae4f79d16289432&profile_id=165', 'external', ARRAY['STIFF UNILATERAL HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["STIFF UNILATERAL HALTER"]}'::jsonb),
('Stiff Unilateral Remada Halter', 'Pernas', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475594179.sd.mp4?s=f20e80b9a24678ce6a56a9e479a1e933203d05f1&profile_id=165', 'external', ARRAY['STIFF UNILATERAL REMADA HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["STIFF UNILATERAL REMADA HALTER"]}'::jsonb),
('Subida na cadeira', 'Pernas', null, 'Força', null, null, 'https://vimeo.com/968324093/9253ac5f82', 'external', ARRAY['Subida na cadeira']::text[], '{"sources": ["tecnofit"], "original_names": ["Subida na cadeira"]}'::jsonb),
('Subida na Caixa Alternada', 'Pernas', 'Caixa', 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/a408c1d6-bc3c-4cbf-a686-6c6b264612c5/playlist.m3u8', 'external', ARRAY['Subida na Caixa Alternada']::text[], '{"sources": ["tecnofit"], "original_names": ["Subida na Caixa Alternada"]}'::jsonb),
('Subida na Caixa Alternada com Halter', 'Pernas', 'Halteres', 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/bd092888-e886-4c1a-8491-d4e11c21c9da/playlist.m3u8', 'external', ARRAY['Subida na Caixa Alternada com Halter']::text[], '{"sources": ["tecnofit"], "original_names": ["Subida na Caixa Alternada com Halter"]}'::jsonb),
('Subida na Caixa com Halter', 'Pernas', 'Halteres', 'Força', null, null, 'https://vz-3705d65e-b6b.b-cdn.net/c1701097-5c82-4a6a-a2d0-4ec8a0710bb1/playlist.m3u8', 'external', ARRAY['Subida na Caixa com Halter']::text[], '{"sources": ["tecnofit"], "original_names": ["Subida na Caixa com Halter"]}'::jsonb),
('Sumo Halter', 'Pernas', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/537383291.sd.mp4?s=e49eae3eb901d3d88f0045f1ed32637c48496879&profile_id=164', 'external', ARRAY['SUMO HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["SUMO HALTER"]}'::jsonb),
('Swing Halter Unilateral', 'Pernas', 'Halteres', 'Funcional', null, null, 'https://player.vimeo.com/external/475617571.sd.mp4?s=1129c5c1632b18be269a2b1ca977077f3a887fcc&profile_id=164', 'external', ARRAY['SWING HALTER UNILATERAL']::text[], '{"sources": ["tecnofit"], "original_names": ["SWING HALTER UNILATERAL"]}'::jsonb),
('Tibial', 'Pernas', null, 'Força', null, null, null, null, ARRAY['TIBIAL']::text[], '{"sources": ["tecnofit"], "original_names": ["TIBIAL"]}'::jsonb),
('Tibial com Elástico', 'Pernas', 'Elástico', 'Força', null, null, null, null, ARRAY['TIBIAL COM ELÁSTICO']::text[], '{"sources": ["tecnofit"], "original_names": ["TIBIAL COM ELÁSTICO"]}'::jsonb),
('Afundo caminhado', 'Quadríceps', 'Halteres', 'Funcional', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://youtu.be/AC61Lri9jxQ?si=AtcYRQsESbA77Yuf', 'external', ARRAY['Afundo Caminhado','Walking Lunge','walking lunge']::text[], '{"sources": ["annex3", "seed", "tecnofit"], "original_names": ["Afundo Caminhado", "Walking Lunge", "walking lunge"]}'::jsonb),
('Agachamento com barra', 'Quadríceps', 'Barra', 'Força', 'Intermédio', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/475619082.sd.mp4?s=1105c28303286dd5cb6af3ea963f4942305f4c79&profile_id=164', 'external', ARRAY['AGACHAMENTO LIVRE','Agachamento Livre','AGACHAMENTO BARRA','AGACHAMENTO LIVRE BARRA','Agachamento com barra']::text[], '{"sources": ["tecnofit", "annex3", "seed"], "original_names": ["AGACHAMENTO LIVRE", "Agachamento Livre", "AGACHAMENTO BARRA", "AGACHAMENTO LIVRE BARRA", "Agachamento com barra"]}'::jsonb),
('Agachamento frontal', 'Quadríceps', 'Barra', 'Força', 'Avançado', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://vimeo.com/896528005/b0bd53e004', 'external', ARRAY['Agachamento Frontal','Agachamento frontal']::text[], '{"sources": ["annex3", "seed", "tecnofit"], "original_names": ["Agachamento Frontal", "Agachamento frontal"]}'::jsonb),
('Agachamento Hack em máquina', 'Quadríceps', 'Máquina', 'Força', null, null, null, null, ARRAY['Agachamento Hack em máquina']::text[], '{"sources": ["annex3"], "original_names": ["Agachamento Hack em máquina"]}'::jsonb),
('Agachamento sumô', 'Quadríceps', null, 'Força', null, null, 'https://vimeo.com/896527804/e1cfe848db', 'external', ARRAY['Agachamento Sumô','Agachamento sumô']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["Agachamento Sumô", "Agachamento sumô"]}'::jsonb),
('Extensão de Pernas', 'Quadríceps', 'Máquina', 'Hipertrofia', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Extensão de Pernas']::text[], '{"sources": ["seed"], "original_names": ["Extensão de Pernas"]}'::jsonb),
('Extensão de pernas na máquina', 'Quadríceps', 'Máquina', 'Força', null, null, 'https://player.vimeo.com/external/537380541.sd.mp4?s=f54a4740a82dc65c57bb398c999462c270c516ee&profile_id=164', 'external', ARRAY['EXTENSOR','Extensão de pernas na máquina']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["EXTENSOR", "Extensão de pernas na máquina"]}'::jsonb),
('Leg Press', 'Quadríceps', 'Máquina', 'Hipertrofia', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/475610895.sd.mp4?s=bd6c9f56c6a9e047e6994bf84ff7e5ded9857c31&profile_id=164', 'external', ARRAY['LEG PRESS','Leg Press']::text[], '{"sources": ["annex3", "seed", "tecnofit"], "original_names": ["LEG PRESS", "Leg Press"]}'::jsonb),
('Lunge com barra', 'Quadríceps', 'Barra', 'Força', null, null, null, null, ARRAY['Lunge com barra']::text[], '{"sources": ["annex3"], "original_names": ["Lunge com barra"]}'::jsonb),
('Lunge à retaguarda com halteres', 'Quadríceps', 'Halteres', 'Força', null, null, null, null, ARRAY['Lunge à retaguarda com halteres']::text[], '{"sources": ["annex3"], "original_names": ["Lunge à retaguarda com halteres"]}'::jsonb),
('Side Lunges', 'Quadríceps', 'Peso corporal', 'Força', null, null, null, null, ARRAY['Side Lunges']::text[], '{"sources": ["annex3"], "original_names": ["Side Lunges"]}'::jsonb),
('Barra Escapular', 'Trapézio', 'Barra', 'Força', null, null, 'https://youtu.be/JZTz4Y4mL6U', 'external', ARRAY['Barra Escapular']::text[], '{"sources": ["tecnofit"], "original_names": ["Barra Escapular"]}'::jsonb),
('Circular Scap Pull Ups', 'Trapézio', 'Peso corporal', 'Força', null, null, 'https://youtu.be/P2Cs4cpAwU0', 'external', ARRAY['Circular Scap Pull Ups']::text[], '{"sources": ["tecnofit"], "original_names": ["Circular Scap Pull Ups"]}'::jsonb),
('Encolhimento com barra atrás', 'Trapézio', 'Barra', 'Força', null, null, null, null, ARRAY['Encolhimento com barra atrás']::text[], '{"sources": ["annex3"], "original_names": ["Encolhimento com barra atrás"]}'::jsonb),
('Encolhimento com halteres sentado', 'Trapézio', 'Halteres', 'Força', null, null, null, null, ARRAY['Encolhimento com halteres sentado']::text[], '{"sources": ["annex3"], "original_names": ["Encolhimento com halteres sentado"]}'::jsonb),
('Encolhimento de ombros com barra', 'Trapézio', 'Barra', 'Força', null, null, null, null, ARRAY['ENCOLHIMENTO BARRA','Encolhimento de ombros com barra']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["ENCOLHIMENTO BARRA", "Encolhimento de ombros com barra"]}'::jsonb),
('Encolhimento de ombros com halteres', 'Trapézio', 'Halteres', 'Força', null, null, 'https://player.vimeo.com/external/475617237.sd.mp4?s=771a37632331ce054f0511c1a155e1213aa558a6&profile_id=164', 'external', ARRAY['ENCOLHIMENTO HALTER','Encolhimento de Ombros com Halteres','Encolhimento de ombros com halteres']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["ENCOLHIMENTO HALTER", "Encolhimento de Ombros com Halteres", "Encolhimento de ombros com halteres"]}'::jsonb),
('Encolhimento de Ombros com Kettlebell', 'Trapézio', 'Kettlebell', 'Força', null, null, 'https://youtu.be/t_oh1KNQPF4', 'external', ARRAY['Encolhimento de Ombros com Kettlebell']::text[], '{"sources": ["tecnofit"], "original_names": ["Encolhimento de Ombros com Kettlebell"]}'::jsonb),
('Encolhimento por cima da cabeça', 'Trapézio', null, 'Força', null, null, null, null, ARRAY['Encolhimento por cima da cabeça']::text[], '{"sources": ["annex3"], "original_names": ["Encolhimento por cima da cabeça"]}'::jsonb),
('KB Shrug', 'Trapézio', 'Kettlebell', 'Força', null, null, 'https://youtu.be/t_oh1KNQPF4', 'external', ARRAY['KB Shrug']::text[], '{"sources": ["tecnofit"], "original_names": ["KB Shrug"]}'::jsonb),
('Puxada Escapular com Argolas', 'Trapézio', 'Argolas', 'Força', null, null, 'https://youtu.be/TGnnNiz3kMg', 'external', ARRAY['Puxada Escapular com Argolas']::text[], '{"sources": ["tecnofit"], "original_names": ["Puxada Escapular com Argolas"]}'::jsonb),
('Ring Scapular Pull Up', 'Trapézio', 'Argolas', 'Força', null, null, 'https://youtu.be/TGnnNiz3kMg', 'external', ARRAY['Ring Scapular Pull Up']::text[], '{"sources": ["tecnofit"], "original_names": ["Ring Scapular Pull Up"]}'::jsonb),
('Scap Pull Ups', 'Trapézio', 'Peso corporal', 'Força', null, null, 'https://youtu.be/JZTz4Y4mL6U', 'external', ARRAY['Scap Pull Ups']::text[], '{"sources": ["tecnofit"], "original_names": ["Scap Pull Ups"]}'::jsonb),
('Sustentação com Puxada de Escápula', 'Trapézio', null, 'Força', null, null, 'https://youtu.be/JZTz4Y4mL6U', 'external', ARRAY['Sustentação com Puxada de Escápula']::text[], '{"sources": ["tecnofit"], "original_names": ["Sustentação com Puxada de Escápula"]}'::jsonb),
('Sustentação com Rotação de Escápulas', 'Trapézio', null, 'Força', null, null, 'https://youtu.be/P2Cs4cpAwU0', 'external', ARRAY['Sustentação com Rotação de Escápulas']::text[], '{"sources": ["tecnofit"], "original_names": ["Sustentação com Rotação de Escápulas"]}'::jsonb),
('Double Dumbell Devil Cluster', 'Tríceps', null, 'Funcional', null, null, 'https://player.vimeo.com/external/475611011.sd.mp4?s=38e87c05b5e011d1fe60029174688562a9273de8&profile_id=165', 'external', ARRAY['DOUBLE DUMBELL DEVIL CLUSTER']::text[], '{"sources": ["tecnofit"], "original_names": ["DOUBLE DUMBELL DEVIL CLUSTER"]}'::jsonb),
('Extensão bilateral de tríceps deitado', 'Tríceps', null, 'Força', null, null, null, null, ARRAY['TESTA BI-LATERAL']::text[], '{"sources": ["tecnofit"], "original_names": ["TESTA BI-LATERAL"]}'::jsonb),
('Extensão de tríceps acima da cabeça', 'Tríceps', null, 'Força', null, null, 'https://player.vimeo.com/external/475620549.sd.mp4?s=769ab690387d1fdc8a5ea038ce29cce968b2448e&profile_id=165', 'external', ARRAY['FRANCÊS']::text[], '{"sources": ["tecnofit"], "original_names": ["FRANCÊS"]}'::jsonb),
('Extensão de tríceps acima da cabeça com halter', 'Tríceps', 'Halteres', 'Força', null, null, null, null, ARRAY['Extensão de tríceps acima da cabeça com halter']::text[], '{"sources": ["annex3"], "original_names": ["Extensão de tríceps acima da cabeça com halter"]}'::jsonb),
('Extensão de Tríceps com Halteres', 'Tríceps', 'Halteres', 'Força', null, null, 'https://youtu.be/T6s8hr6sRDU', 'external', ARRAY['Extensão de Tríceps com Halteres']::text[], '{"sources": ["tecnofit"], "original_names": ["Extensão de Tríceps com Halteres"]}'::jsonb),
('Extensão de tríceps deitado', 'Tríceps', null, 'Força', null, null, null, null, ARRAY['TESTA']::text[], '{"sources": ["tecnofit"], "original_names": ["TESTA"]}'::jsonb),
('Extensão de tríceps deitado com barra', 'Tríceps', 'Barra', 'Força', null, null, 'https://player.vimeo.com/external/475596214.sd.mp4?s=11aaad71bd98f178b3450938ea0b208a3ee3c10c&profile_id=164', 'external', ARRAY['Extensão de tríceps deitado com barra','TESTA BARRA']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["Extensão de tríceps deitado com barra", "TESTA BARRA"]}'::jsonb),
('Extensão de tríceps deitado com barra W', 'Tríceps', 'Barra', 'Força', null, null, 'https://vimeo.com/896526354/62c6ee7182', 'external', ARRAY['Tríceps Testa Barra W']::text[], '{"sources": ["tecnofit"], "original_names": ["Tríceps Testa Barra W"]}'::jsonb),
('Extensão de Tríceps Halter Unilateral', 'Tríceps', 'Halteres', 'Força', null, null, 'https://youtu.be/n23D7pZZw6g', 'external', ARRAY['Extensão de Tríceps Halter Unilateral']::text[], '{"sources": ["tecnofit"], "original_names": ["Extensão de Tríceps Halter Unilateral"]}'::jsonb),
('Extensão de tríceps na polia', 'Tríceps', 'Polia', 'Hipertrofia', 'Iniciante', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', 'https://player.vimeo.com/external/537383955.sd.mp4?s=36462e40c3de83a5966aece1d9a5b5bb5e439734&profile_id=164', 'external', ARRAY['Extensão de Tríceps na Polia','Extensão de tríceps na polia','POLIA','TRÍCEPS PULLEY']::text[], '{"sources": ["annex3", "seed", "tecnofit"], "original_names": ["Extensão de Tríceps na Polia", "Extensão de tríceps na polia", "POLIA", "TRÍCEPS PULLEY"]}'::jsonb),
('Extensão de tríceps na polia com corda', 'Tríceps', 'Polia', 'Força', null, null, 'https://player.vimeo.com/external/537377650.sd.mp4?s=23b3f40ea0bfafe9d996d00840182e9304346a98&profile_id=164', 'external', ARRAY['CORDA','Extensão de tríceps na polia com corda']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["CORDA", "Extensão de tríceps na polia com corda"]}'::jsonb),
('Extensão de tríceps na polia com pega inversa', 'Tríceps', 'Polia', 'Força', null, null, null, null, ARRAY['Extensão de tríceps na polia com pega inversa','POLIA INVERSA']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["Extensão de tríceps na polia com pega inversa", "POLIA INVERSA"]}'::jsonb),
('Extensão de tríceps sentado com barra', 'Tríceps', 'Barra', 'Força', null, null, null, null, ARRAY['Extensão de tríceps sentado com barra']::text[], '{"sources": ["annex3"], "original_names": ["Extensão de tríceps sentado com barra"]}'::jsonb),
('Extensão unilateral de tríceps acima da cabeça', 'Tríceps', null, 'Força', null, null, null, null, ARRAY['FRANCES UNILATERAL']::text[], '{"sources": ["tecnofit"], "original_names": ["FRANCES UNILATERAL"]}'::jsonb),
('Extensão unilateral de tríceps na polia', 'Tríceps', 'Polia', 'Força', null, null, null, null, ARRAY['POLIA UNILATERAL']::text[], '{"sources": ["tecnofit"], "original_names": ["POLIA UNILATERAL"]}'::jsonb),
('Extensão unilateral de tríceps na polia alta com pega supinada', 'Tríceps', 'Polia', 'Força', null, null, null, null, ARRAY['Extensão unilateral de tríceps na polia alta com pega supinada']::text[], '{"sources": ["annex3"], "original_names": ["Extensão unilateral de tríceps na polia alta com pega supinada"]}'::jsonb),
('Extensão vertical alternada de tríceps com halteres', 'Tríceps', 'Halteres', 'Força', null, null, null, null, ARRAY['Extensão vertical alternada de tríceps com halteres']::text[], '{"sources": ["annex3"], "original_names": ["Extensão vertical alternada de tríceps com halteres"]}'::jsonb),
('Fundos em barras paralelas', 'Tríceps', 'Barra', 'Força', null, null, 'https://player.vimeo.com/external/475620485.sd.mp4?s=5575a03e1a8d0dbff81f1a57be04991ee9b4537c&profile_id=165', 'external', ARRAY['Fundos em barras paralelas','PARALELA','TRICEPS DIPS']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["Fundos em barras paralelas", "PARALELA", "TRICEPS DIPS"]}'::jsonb),
('Fundos em Paralelas', 'Tríceps', 'Peso corporal', 'Força', 'Avançado', 'Executar com controlo, amplitude adequada e técnica definida pelo professor.', null, null, ARRAY['Fundos em Paralelas']::text[], '{"sources": ["seed"], "original_names": ["Fundos em Paralelas"]}'::jsonb),
('Fundos entre bancos', 'Tríceps', 'Peso corporal', 'Força', null, null, 'https://player.vimeo.com/external/475594421.sd.mp4?s=d3dad42e1bf8a8587b99551cd084312941f64075&profile_id=165', 'external', ARRAY['TRÍCEPS BANCO']::text[], '{"sources": ["tecnofit"], "original_names": ["TRÍCEPS BANCO"]}'::jsonb),
('Fundos entre dois bancos', 'Tríceps', 'Peso corporal', 'Força', null, null, null, null, ARRAY['Fundos entre dois bancos']::text[], '{"sources": ["annex3"], "original_names": ["Fundos entre dois bancos"]}'::jsonb),
('Kickback com halter', 'Tríceps', 'Kettlebell', 'Força', null, null, null, null, ARRAY['Kickback com halter']::text[], '{"sources": ["annex3"], "original_names": ["Kickback com halter"]}'::jsonb),
('Kickback de tríceps com halter', 'Tríceps', 'Kettlebell', 'Força', null, null, 'https://player.vimeo.com/external/475620607.sd.mp4?s=dd9d90e7474807cf76fae51f101323186f9da2a0&profile_id=164', 'external', ARRAY['COICE']::text[], '{"sources": ["tecnofit"], "original_names": ["COICE"]}'::jsonb),
('Kickback de tríceps na polia', 'Tríceps', 'Kettlebell', 'Força', null, null, null, null, ARRAY['COICE CROSS']::text[], '{"sources": ["tecnofit"], "original_names": ["COICE CROSS"]}'::jsonb),
('Kickback na polia', 'Tríceps', 'Kettlebell', 'Força', null, null, null, null, ARRAY['Kickback na polia']::text[], '{"sources": ["annex3"], "original_names": ["Kickback na polia"]}'::jsonb),
('Manmaker', 'Tríceps', null, 'Funcional', null, null, null, null, ARRAY['MANMAKER']::text[], '{"sources": ["tecnofit"], "original_names": ["MANMAKER"]}'::jsonb),
('Single Arm DB Overhead Tricep Extension', 'Tríceps', 'Halteres', 'Força', null, null, 'https://youtu.be/n23D7pZZw6g', 'external', ARRAY['Single Arm DB Overhead Tricep Extension']::text[], '{"sources": ["tecnofit"], "original_names": ["Single Arm DB Overhead Tricep Extension"]}'::jsonb),
('Supine Tricep DB Extension', 'Tríceps', 'Halteres', 'Força', null, null, 'https://youtu.be/T6s8hr6sRDU', 'external', ARRAY['Supine Tricep DB Extension']::text[], '{"sources": ["tecnofit"], "original_names": ["Supine Tricep DB Extension"]}'::jsonb),
('Supino com pega fechada', 'Tríceps', null, 'Força', null, null, 'https://player.vimeo.com/external/475611968.sd.mp4?s=13d6de34bf74db640ed5102892d665056a042b9c&profile_id=165', 'external', ARRAY['SUPINO FECHADO','SUPINO FECHADO FECHADO','Supino com pega fechada']::text[], '{"sources": ["annex3", "tecnofit"], "original_names": ["SUPINO FECHADO", "SUPINO FECHADO FECHADO", "Supino com pega fechada"]}'::jsonb),
('Supino com pega fechada e halteres', 'Tríceps', 'Halteres', 'Força', null, null, null, null, ARRAY['SUPINO FECHADO HALTER']::text[], '{"sources": ["tecnofit"], "original_names": ["SUPINO FECHADO HALTER"]}'::jsonb),
('Tríceps Maquina', 'Tríceps', 'Máquina', 'Força', null, null, null, null, ARRAY['TRÍCEPS MAQUINA']::text[], '{"sources": ["tecnofit"], "original_names": ["TRÍCEPS MAQUINA"]}'::jsonb),
('Tríceps na Caixa Dupla', 'Tríceps', 'Caixa', 'Força', null, null, 'https://youtu.be/WIWPmFHJpPE', 'external', ARRAY['Tríceps na Caixa Dupla']::text[], '{"sources": ["tecnofit"], "original_names": ["Tríceps na Caixa Dupla"]}'::jsonb)
)
insert into public.exercise_library (
  name,description,muscle_group,muscle_group_id,secondary_muscles,equipment,category,difficulty,
  instructions,media_path,media_kind,external_media_url,is_active,aliases,source_refs,dedupe_key
)
select i.name,i.description,g.name,g.id,'{}'::text[],i.equipment,i.category,i.difficulty,
       null,null,i.media_kind,i.external_media_url,true,i.aliases,i.source_refs,
       public.normalise_exercise_name(i.name)
from incoming i
join public.exercise_muscle_groups g on lower(g.name)=lower(i.group_name)
on conflict (dedupe_key) where dedupe_key is not null and dedupe_key <> ''
do update set
  name=excluded.name,
  muscle_group=excluded.muscle_group,
  muscle_group_id=excluded.muscle_group_id,
  equipment=coalesce(public.exercise_library.equipment,excluded.equipment),
  category=coalesce(public.exercise_library.category,excluded.category),
  difficulty=coalesce(public.exercise_library.difficulty,excluded.difficulty),
  description=coalesce(public.exercise_library.description,excluded.description),
  external_media_url=coalesce(public.exercise_library.external_media_url,excluded.external_media_url),
  media_kind=case when public.exercise_library.media_path is not null
                  then public.exercise_library.media_kind
                  else coalesce(public.exercise_library.media_kind,excluded.media_kind) end,
  aliases=public.exercise_library.aliases || excluded.aliases,
  source_refs=public.exercise_library.source_refs || excluded.source_refs,
  is_active=true,
  updated_at=now();

-- 5. RLS / grants
alter table public.exercise_muscle_groups enable row level security;
alter table public.workout_block_types enable row level security;

drop policy if exists exercise_muscle_groups_select on public.exercise_muscle_groups;
create policy exercise_muscle_groups_select on public.exercise_muscle_groups for select to authenticated using (true);
drop policy if exists exercise_muscle_groups_insert on public.exercise_muscle_groups;
create policy exercise_muscle_groups_insert on public.exercise_muscle_groups for insert to authenticated
with check (public.is_admin() or public.trainer_has_permission('manage_exercise_library'));
drop policy if exists exercise_muscle_groups_update on public.exercise_muscle_groups;
create policy exercise_muscle_groups_update on public.exercise_muscle_groups for update to authenticated
using (public.is_admin() or public.trainer_has_permission('manage_exercise_library'))
with check (public.is_admin() or public.trainer_has_permission('manage_exercise_library'));
drop policy if exists exercise_muscle_groups_delete on public.exercise_muscle_groups;
create policy exercise_muscle_groups_delete on public.exercise_muscle_groups for delete to authenticated using (public.is_admin());

drop policy if exists workout_block_types_select on public.workout_block_types;
create policy workout_block_types_select on public.workout_block_types for select to authenticated using (true);
drop policy if exists workout_block_types_insert on public.workout_block_types;
create policy workout_block_types_insert on public.workout_block_types for insert to authenticated
with check (public.is_admin() or public.trainer_has_permission('manage_workout_plans'));
drop policy if exists workout_block_types_update on public.workout_block_types;
create policy workout_block_types_update on public.workout_block_types for update to authenticated
using (public.is_admin() or public.trainer_has_permission('manage_workout_plans'))
with check (public.is_admin() or public.trainer_has_permission('manage_workout_plans'));
drop policy if exists workout_block_types_delete on public.workout_block_types;
create policy workout_block_types_delete on public.workout_block_types for delete to authenticated using (public.is_admin());

grant select,insert,update,delete on public.exercise_muscle_groups to authenticated;
grant select,insert,update,delete on public.workout_block_types to authenticated;
grant execute on function public.normalise_exercise_name(text) to authenticated;
grant execute on function public.slugify_library_label(text) to authenticated;

commit;
