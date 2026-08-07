-- ULTIMATE FIT APP
-- Migration 006: desafios integrados no mesmo Supabase/Auth da aplicação principal.
-- Não migra dados do antigo desafios.ultimatefit.pt; começa limpo, conforme decisão do estúdio.

begin;

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text,
  unit text not null default 'repetições',
  target_total numeric(12,2) not null,
  daily_target numeric(12,2),
  start_date date not null,
  end_date date not null,
  status text not null default 'draft',
  prize_text text,
  rules text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint challenges_title_not_blank check (length(btrim(title)) > 1),
  constraint challenges_slug_valid check (slug ~ '^[a-z0-9-]+$'),
  constraint challenges_target_positive check (target_total > 0),
  constraint challenges_daily_target_valid check (daily_target is null or daily_target >= 0),
  constraint challenges_dates_valid check (end_date >= start_date),
  constraint challenges_status_valid check (status in ('draft','active','completed','archived'))
);

create index if not exists challenges_status_dates_idx
  on public.challenges(status, start_date, end_date);

create table if not exists public.challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete restrict,
  status text not null default 'active',
  assigned_by uuid references public.profiles(id) on delete set null default auth.uid(),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint challenge_participant_status_valid check (status in ('active','completed','withdrawn')),
  unique (challenge_id, student_id)
);

create index if not exists challenge_participants_student_idx
  on public.challenge_participants(student_id, status);
create index if not exists challenge_participants_challenge_idx
  on public.challenge_participants(challenge_id, status);

create table if not exists public.challenge_records (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.challenge_participants(id) on delete cascade,
  record_date date not null,
  value numeric(12,2) not null default 0,
  note text,
  recorded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint challenge_record_value_valid check (value >= 0),
  unique (participant_id, record_date)
);

create index if not exists challenge_records_participant_date_idx
  on public.challenge_records(participant_id, record_date);

-- Automatic slugs keep URLs/readability predictable without a second login system.
create or replace function public.slugify_challenge_title(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    translate(lower(coalesce(value,'')),
      'áàãâäéèêëíìîïóòõôöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.prepare_challenge_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_slug text;
  candidate text;
  suffix integer := 1;
begin
  if new.slug is null or btrim(new.slug) = '' then
    base_slug := public.slugify_challenge_title(new.title);
    if base_slug = '' then base_slug := 'desafio'; end if;
    candidate := base_slug;
    while exists(select 1 from public.challenges c where c.slug = candidate and (new.id is null or c.id <> new.id)) loop
      suffix := suffix + 1;
      candidate := base_slug || '-' || suffix::text;
    end loop;
    new.slug := candidate;
  else
    new.slug := public.slugify_challenge_title(new.slug);
  end if;
  return new;
end;
$$;

drop trigger if exists challenges_prepare_slug on public.challenges;
create trigger challenges_prepare_slug
before insert or update of title, slug on public.challenges
for each row execute function public.prepare_challenge_slug();

drop trigger if exists challenges_set_updated_at on public.challenges;
create trigger challenges_set_updated_at before update on public.challenges
for each row execute function public.set_updated_at();

drop trigger if exists challenge_participants_set_updated_at on public.challenge_participants;
create trigger challenge_participants_set_updated_at before update on public.challenge_participants
for each row execute function public.set_updated_at();

drop trigger if exists challenge_records_set_updated_at on public.challenge_records;
create trigger challenge_records_set_updated_at before update on public.challenge_records
for each row execute function public.set_updated_at();

create or replace function public.can_manage_challenges_global()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_profile_is_active()
    and (
      public.is_admin()
      or public.trainer_has_permission('manage_challenges')
    );
$$;

create or replace function public.can_manage_challenge_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_profile_is_active()
    and (
      public.is_admin()
      or (
        public.trainer_has_student(target_student_id)
        and public.trainer_has_permission('manage_challenges')
      )
    );
$$;

create or replace function public.validate_challenge_record_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_start date;
  challenge_end date;
begin
  select c.start_date, c.end_date
    into challenge_start, challenge_end
  from public.challenge_participants cp
  join public.challenges c on c.id = cp.challenge_id
  where cp.id = new.participant_id;

  if challenge_start is null then
    raise exception 'Participação de desafio inválida.';
  end if;
  if new.record_date < challenge_start or new.record_date > challenge_end then
    raise exception 'A data do registo está fora do período do desafio.';
  end if;
  return new;
end;
$$;

drop trigger if exists challenge_records_validate_date on public.challenge_records;
create trigger challenge_records_validate_date
before insert or update of participant_id, record_date on public.challenge_records
for each row execute function public.validate_challenge_record_date();

alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.challenge_records enable row level security;

-- CHALLENGES

drop policy if exists challenges_select on public.challenges;
create policy challenges_select on public.challenges
for select to authenticated
using (
  public.current_profile_is_active()
  and (
    status in ('active','completed')
    or public.can_manage_challenges_global()
  )
);

drop policy if exists challenges_insert on public.challenges;
create policy challenges_insert on public.challenges
for insert to authenticated
with check (public.can_manage_challenges_global());

drop policy if exists challenges_update on public.challenges;
create policy challenges_update on public.challenges
for update to authenticated
using (public.can_manage_challenges_global())
with check (public.can_manage_challenges_global());

drop policy if exists challenges_delete on public.challenges;
create policy challenges_delete on public.challenges
for delete to authenticated
using (public.is_admin());

-- PARTICIPANTS

drop policy if exists challenge_participants_select on public.challenge_participants;
create policy challenge_participants_select on public.challenge_participants
for select to authenticated
using (public.can_view_student(student_id));

drop policy if exists challenge_participants_insert on public.challenge_participants;
create policy challenge_participants_insert on public.challenge_participants
for insert to authenticated
with check (public.can_manage_challenge_student(student_id));

drop policy if exists challenge_participants_update on public.challenge_participants;
create policy challenge_participants_update on public.challenge_participants
for update to authenticated
using (public.can_manage_challenge_student(student_id))
with check (public.can_manage_challenge_student(student_id));

drop policy if exists challenge_participants_delete on public.challenge_participants;
create policy challenge_participants_delete on public.challenge_participants
for delete to authenticated
using (public.is_admin());

-- DAILY RECORDS

drop policy if exists challenge_records_select on public.challenge_records;
create policy challenge_records_select on public.challenge_records
for select to authenticated
using (
  exists (
    select 1 from public.challenge_participants cp
    where cp.id = participant_id
      and public.can_view_student(cp.student_id)
  )
);

drop policy if exists challenge_records_insert on public.challenge_records;
create policy challenge_records_insert on public.challenge_records
for insert to authenticated
with check (
  exists (
    select 1 from public.challenge_participants cp
    where cp.id = participant_id
      and cp.status = 'active'
      and (
        cp.student_id = public.current_student_id()
        or public.can_manage_challenge_student(cp.student_id)
      )
  )
);

drop policy if exists challenge_records_update on public.challenge_records;
create policy challenge_records_update on public.challenge_records
for update to authenticated
using (
  exists (
    select 1 from public.challenge_participants cp
    where cp.id = participant_id
      and (
        cp.student_id = public.current_student_id()
        or public.can_manage_challenge_student(cp.student_id)
      )
  )
)
with check (
  exists (
    select 1 from public.challenge_participants cp
    where cp.id = participant_id
      and cp.status = 'active'
      and (
        cp.student_id = public.current_student_id()
        or public.can_manage_challenge_student(cp.student_id)
      )
  )
);

drop policy if exists challenge_records_delete on public.challenge_records;
create policy challenge_records_delete on public.challenge_records
for delete to authenticated
using (
  exists (
    select 1 from public.challenge_participants cp
    where cp.id = participant_id
      and public.can_manage_challenge_student(cp.student_id)
  )
);

-- Ranking: students can see the leaderboard without gaining read access to
-- unrelated student profiles. Student names are abbreviated for student callers.
create or replace function public.challenge_leaderboard(target_challenge_id uuid)
returns table (
  student_id uuid,
  student_name text,
  total_value numeric,
  days_recorded bigint,
  best_day numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_role public.app_role;
  challenge_status text;
begin
  if not public.current_profile_is_active() then
    raise exception 'Conta inativa.';
  end if;

  select c.status into challenge_status
  from public.challenges c
  where c.id = target_challenge_id;

  if challenge_status is null then
    raise exception 'Desafio não encontrado.';
  end if;
  if challenge_status not in ('active','completed') and not public.can_manage_challenges_global() then
    raise exception 'Desafio indisponível.';
  end if;

  caller_role := public.current_app_role();

  if caller_role = 'student'::public.app_role and not exists (
    select 1
    from public.challenge_participants cp
    where cp.challenge_id = target_challenge_id
      and cp.student_id = public.current_student_id()
      and cp.status in ('active','completed')
  ) then
    raise exception 'Este desafio não está atribuído à tua conta.';
  end if;

  if caller_role = 'trainer'::public.app_role
     and not public.can_manage_challenges_global()
     and not exists (
       select 1
       from public.challenge_participants cp
       where cp.challenge_id = target_challenge_id
         and public.trainer_has_student(cp.student_id)
         and cp.status in ('active','completed')
     ) then
    raise exception 'Não tens alunos atribuídos neste desafio.';
  end if;

  return query
  select
    sp.id,
    case
      when caller_role in ('owner'::public.app_role,'admin'::public.app_role,'trainer'::public.app_role)
        then p.full_name
      else coalesce(nullif(p.first_name,''), split_part(p.full_name,' ',1))
        || case when coalesce(p.last_name,'') <> '' then ' ' || left(p.last_name,1) || '.' else '' end
    end,
    coalesce(sum(cr.value),0)::numeric,
    count(cr.id)::bigint,
    coalesce(max(cr.value),0)::numeric
  from public.challenge_participants cp
  join public.student_profiles sp on sp.id = cp.student_id
  join public.profiles p on p.id = sp.profile_id
  left join public.challenge_records cr on cr.participant_id = cp.id
  where cp.challenge_id = target_challenge_id
    and cp.status in ('active','completed')
    and sp.deleted_at is null
    and p.deleted_at is null
  group by sp.id, p.full_name, p.first_name, p.last_name
  order by coalesce(sum(cr.value),0) desc, count(cr.id) desc, p.full_name asc;
end;
$$;

revoke all on function public.challenge_leaderboard(uuid) from public;
grant execute on function public.challenge_leaderboard(uuid) to authenticated;

grant select, insert, update, delete on public.challenges to authenticated;
grant select, insert, update, delete on public.challenge_participants to authenticated;
grant select, insert, update, delete on public.challenge_records to authenticated;

update public.feature_flags
set is_enabled = true, updated_by = auth.uid(), updated_at = now()
where feature_key = 'challenges';

commit;
