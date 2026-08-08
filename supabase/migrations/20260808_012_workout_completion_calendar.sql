-- ULTIMATE FIT APP
-- Migration 012: calendário de treinos concluídos + registo manual pelo professor
-- Data: 2026-08-08
-- Requer migrations anteriores até 011.

begin;

create table if not exists public.workout_completions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  plan_id uuid references public.workout_plans(id) on delete set null,
  session_id uuid references public.workout_sessions(id) on delete set null,
  completed_on date not null default current_date,
  source text not null default 'student',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_completions_source_check check (source in ('student','trainer')),
  constraint workout_completions_notes_check check (notes is null or char_length(notes) <= 1000),
  constraint workout_completions_one_training_day unique (student_id, completed_on)
);

create index if not exists workout_completions_student_date_idx
  on public.workout_completions (student_id, completed_on desc);
create index if not exists workout_completions_plan_idx
  on public.workout_completions (plan_id) where plan_id is not null;
create index if not exists workout_completions_session_idx
  on public.workout_completions (session_id) where session_id is not null;

create or replace function public.validate_workout_completion_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_plan_id uuid;
begin
  if new.completed_on > current_date then
    raise exception 'Não é possível registar um treino numa data futura.';
  end if;

  if new.session_id is not null then
    select ws.plan_id into resolved_plan_id
    from public.workout_sessions ws
    join public.workout_plans wp on wp.id = ws.plan_id
    where ws.id = new.session_id and wp.student_id = new.student_id
    limit 1;
    if resolved_plan_id is null then
      raise exception 'A sessão selecionada não pertence a este aluno.';
    end if;
    if new.plan_id is not null and new.plan_id <> resolved_plan_id then
      raise exception 'A sessão não pertence ao plano indicado.';
    end if;
    new.plan_id := resolved_plan_id;
  elsif new.plan_id is not null and not exists (
    select 1 from public.workout_plans wp
    where wp.id = new.plan_id and wp.student_id = new.student_id
  ) then
    raise exception 'O plano selecionado não pertence a este aluno.';
  end if;

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists workout_completions_validate_row on public.workout_completions;
create trigger workout_completions_validate_row
before insert or update on public.workout_completions
for each row execute function public.validate_workout_completion_row();

drop trigger if exists workout_completions_set_updated_at on public.workout_completions;
create trigger workout_completions_set_updated_at
before update on public.workout_completions
for each row execute function public.set_updated_at();

create or replace function public.can_record_workout_completion(
  target_student_id uuid,
  requested_source text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_student_id is null then false
    when requested_source = 'student' then target_student_id = public.current_student_id()
    when requested_source = 'trainer' then public.can_manage_workout_student(target_student_id)
    else false
  end;
$$;

create or replace function public.record_workout_completion(
  target_student_id uuid,
  target_plan_id uuid default null,
  target_session_id uuid default null,
  target_completed_on date default current_date,
  requested_source text default 'student',
  target_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  completion_id uuid;
  resolved_plan_id uuid;
  source_value text := lower(coalesce(requested_source,'student'));
begin
  if actor_id is null then
    raise exception 'Sessão inválida.';
  end if;
  if target_student_id is null then
    raise exception 'Seleciona um aluno.';
  end if;
  if target_completed_on is null then
    target_completed_on := current_date;
  end if;
  if target_completed_on > current_date then
    raise exception 'Não é possível registar um treino numa data futura.';
  end if;
  if not public.can_record_workout_completion(target_student_id, source_value) then
    raise exception 'Sem permissão para registar este treino.';
  end if;

  if target_session_id is not null then
    select ws.plan_id into resolved_plan_id
    from public.workout_sessions ws
    join public.workout_plans wp on wp.id = ws.plan_id
    where ws.id = target_session_id
      and wp.student_id = target_student_id
    limit 1;
    if resolved_plan_id is null then
      raise exception 'A sessão selecionada não pertence a este aluno.';
    end if;
    if target_plan_id is not null and target_plan_id <> resolved_plan_id then
      raise exception 'A sessão não pertence ao plano indicado.';
    end if;
    target_plan_id := resolved_plan_id;
  elsif target_plan_id is not null then
    if not exists (
      select 1 from public.workout_plans wp
      where wp.id = target_plan_id and wp.student_id = target_student_id
    ) then
      raise exception 'O plano selecionado não pertence a este aluno.';
    end if;
  end if;

  insert into public.workout_completions (
    student_id, plan_id, session_id, completed_on, source, notes, created_by
  ) values (
    target_student_id,
    target_plan_id,
    target_session_id,
    target_completed_on,
    source_value,
    nullif(btrim(coalesce(target_notes,'')),''),
    actor_id
  )
  on conflict (student_id, completed_on) do update
    set plan_id = coalesce(public.workout_completions.plan_id, excluded.plan_id),
        session_id = coalesce(public.workout_completions.session_id, excluded.session_id),
        notes = coalesce(public.workout_completions.notes, excluded.notes),
        updated_at = now()
  returning id into completion_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id,
    'record_workout_completion',
    'workout_completion',
    completion_id,
    jsonb_build_object(
      'student_id', target_student_id,
      'plan_id', target_plan_id,
      'session_id', target_session_id,
      'completed_on', target_completed_on,
      'source', source_value
    )
  );

  return completion_id;
end;
$$;

alter table public.workout_completions enable row level security;

drop policy if exists workout_completions_select_accessible on public.workout_completions;
create policy workout_completions_select_accessible
on public.workout_completions
for select to authenticated
using (public.can_view_student(student_id));

drop policy if exists workout_completions_insert_via_rpc on public.workout_completions;
create policy workout_completions_insert_via_rpc
on public.workout_completions
for insert to authenticated
with check (completed_on <= current_date and public.can_record_workout_completion(student_id, source));

drop policy if exists workout_completions_update_manager on public.workout_completions;
create policy workout_completions_update_manager
on public.workout_completions
for update to authenticated
using (public.can_manage_workout_student(student_id))
with check (public.can_manage_workout_student(student_id));

drop policy if exists workout_completions_delete_manager on public.workout_completions;
create policy workout_completions_delete_manager
on public.workout_completions
for delete to authenticated
using (public.can_manage_workout_student(student_id));

revoke all on table public.workout_completions from anon;
grant select on table public.workout_completions to authenticated;
grant execute on function public.can_record_workout_completion(uuid,text) to authenticated;
grant execute on function public.validate_workout_completion_row() to authenticated;
grant execute on function public.record_workout_completion(uuid,uuid,uuid,date,text,text) to authenticated;

commit;
