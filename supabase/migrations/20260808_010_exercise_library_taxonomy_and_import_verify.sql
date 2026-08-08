-- Verificação Migration 010
select count(*) as total_exercicios,
       count(*) filter (where is_active) as ativos,
       count(*) filter (where external_media_url is not null or media_path is not null) as com_demonstracao
from public.exercise_library;

select muscle_group, count(*) as exercicios
from public.exercise_library
where is_active = true
group by muscle_group
order by exercicios desc, muscle_group;

select dedupe_key, count(*) as ocorrencias
from public.exercise_library
where dedupe_key is not null
group by dedupe_key
having count(*) > 1;

select name, slug, icon_key, is_active, is_system
from public.exercise_muscle_groups
order by sort_order, name;

select code, name, supports_rounds, is_special, is_system, is_active
from public.workout_block_types
order by sort_order, name;

select name, muscle_group, external_media_url
from public.exercise_library
where lower(name) in (
  'caminhada na passadeira',
  'press de ombros com barra',
  'curl de bíceps com barra',
  'elevação de gémeos em pé na máquina',
  'peso morto',
  'supino com barra',
  'remada unilateral com halter',
  'flexões',
  'voos posteriores'
)
order by name;
