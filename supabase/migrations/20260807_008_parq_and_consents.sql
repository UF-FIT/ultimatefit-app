-- ULTIMATE FIT APP
-- Migration 008: PAR-Q obrigatório + declaração de responsabilidade (Update 5B.1)
-- Objetivos:
--   * apresentar o PAR-Q uma única vez por versão ao aluno;
--   * guardar respostas e aceitação de forma versionada e append-only;
--   * permitir consulta posterior pelo aluno e pela equipa autorizada;
--   * sinalizar respostas "Sim" sem produzir qualquer diagnóstico;
--   * exigir PAR-Q concluído antes da primeira avaliação física ser publicada.

begin;

create table if not exists public.parq_versions (
  id uuid primary key default gen_random_uuid(),
  version_code text not null unique,
  title text not null,
  intro_text text not null,
  questions jsonb not null,
  declaration_text text not null,
  is_active boolean not null default false,
  activated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint parq_version_code_valid check (version_code ~ '^[A-Z0-9._-]+$'),
  constraint parq_questions_array check (jsonb_typeof(questions) = 'array')
);

-- Só pode existir uma versão ativa de cada vez.
create unique index if not exists parq_single_active_version_uidx
  on public.parq_versions ((is_active))
  where is_active = true;

create table if not exists public.student_parq_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete restrict,
  version_id uuid not null references public.parq_versions(id) on delete restrict,
  respondent_profile_id uuid not null references public.profiles(id) on delete restrict,
  answers jsonb not null,
  positive_answer_count integer not null default 0,
  has_positive_answers boolean not null default false,
  accepted_statement boolean not null default true,
  accepted_at timestamptz not null default now(),
  acceptance_user_agent text,
  created_at timestamptz not null default now(),
  constraint student_parq_answers_object check (jsonb_typeof(answers) = 'object'),
  constraint student_parq_positive_count_valid check (positive_answer_count between 0 and 7),
  constraint student_parq_acceptance_required check (accepted_statement = true),
  unique (student_id, version_id)
);

create index if not exists student_parq_submissions_student_idx
  on public.student_parq_submissions(student_id, accepted_at desc);
create index if not exists student_parq_submissions_positive_idx
  on public.student_parq_submissions(has_positive_answers, accepted_at desc);

-- Conteúdo inicial fornecido pelo estúdio. Fica versionado para que uma futura
-- alteração crie uma nova versão em vez de reescrever o histórico aceite.
-- Desativa primeiro qualquer versão anterior para respeitar o índice de versão
-- ativa única também em upgrades futuros.
update public.parq_versions
set is_active = false
where version_code <> 'UF-PARQ-2026-01'
  and is_active = true;

insert into public.parq_versions (
  version_code,
  title,
  intro_text,
  questions,
  declaration_text,
  is_active,
  activated_at
)
values (
  'UF-PARQ-2026-01',
  'PAR-Q · Questionário de Prontidão para Atividade Física',
  'Este questionário tem como desiderato identificar a necessidade de avaliação clínica e médica antes do início da atividade física. Ao marcar um SIM, é fortemente sugerida a realização de avaliação clínica e médica. Contudo, qualquer pessoa pode participar numa atividade física de esforço moderado, respeitando as restrições médicas.',
  jsonb_build_array(
    jsonb_build_object('id','q1','text','O seu médico já lhe comunicou que possui problemas cardiovasculares e que apenas deve praticar atividade física mediante supervisão médica?'),
    jsonb_build_object('id','q2','text','Sente dores no peito quando pratica atividade física?'),
    jsonb_build_object('id','q3','text','No último mês, sentiu dores no peito quando NÃO estava a praticar atividade física?'),
    jsonb_build_object('id','q4','text','Alguma vez perdeu o equilíbrio devido a tonturas ou alguma vez perdeu a consciência?'),
    jsonb_build_object('id','q5','text','Tem algum problema ósseo ou muscular que possa ser agravado com o início da prática de atividades físicas?'),
    jsonb_build_object('id','q6','text','O seu médico prescreveu-lhe algum medicamento para pressão arterial ou doença cardíaca?'),
    jsonb_build_object('id','q7','text','Tem conhecimento, por informação médica ou por experiência própria, de algum motivo que possa impedir a prática de atividade física sem supervisão médica?')
  ),
  'Eu, {{student_name}}, declaro assumir (nos termos da Lei de Bases da Atividade Física e do Desporto, Lei nº5/07) a especial obrigação de me assegurar previamente de que não tenho quaisquer contraindicações para a prática da atividade que pretendo desenvolver. Reconheço que não é função do professor responsável pelas diferentes atividades emitir juízos de valor quanto ao meu estado de saúde.\n\nA informação supra indicada é utilizada apenas como orientação para ajustar a prescrição do exercício em função da(s) limitação(ões) física(s) identificada(s).\n\nDeclaro, ainda, participar voluntariamente neste programa de exercício físico e assumo inteira responsabilidade em caso de acidente, lesão ou doença.',
  true,
  now()
)
on conflict (version_code) do update
set title = excluded.title,
    intro_text = excluded.intro_text,
    questions = excluded.questions,
    declaration_text = excluded.declaration_text,
    is_active = true,
    activated_at = coalesce(public.parq_versions.activated_at, excluded.activated_at);

create or replace function public.active_parq_version_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pv.id
  from public.parq_versions pv
  where pv.is_active = true
  order by pv.activated_at desc nulls last, pv.created_at desc
  limit 1;
$$;

create or replace function public.student_has_current_parq(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_parq_submissions sps
    where sps.student_id = target_student_id
      and sps.version_id = public.active_parq_version_id()
      and sps.accepted_statement = true
  );
$$;

create or replace function public.current_student_has_required_parq()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.current_app_role() <> 'student' then true
    when public.current_student_id() is null then false
    else public.student_has_current_parq(public.current_student_id())
  end;
$$;

create or replace function public.submit_own_parq(
  target_version_id uuid,
  answer_payload jsonb,
  acceptance_user_agent text default null
)
returns public.student_parq_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_student uuid;
  active_version uuid;
  result public.student_parq_submissions;
  positive_count integer := 0;
  key_name text;
begin
  if not public.current_profile_is_active() or public.current_app_role() <> 'student' then
    raise exception 'Apenas o aluno autenticado pode concluir o próprio PAR-Q.';
  end if;

  target_student := public.current_student_id();
  if target_student is null then
    raise exception 'A conta ainda não está associada a um perfil de aluno.';
  end if;

  active_version := public.active_parq_version_id();
  if active_version is null or target_version_id is distinct from active_version then
    raise exception 'A versão do PAR-Q já não está ativa. Atualiza a página e tenta novamente.';
  end if;

  if jsonb_typeof(answer_payload) <> 'object' then
    raise exception 'As respostas do PAR-Q são inválidas.';
  end if;

  foreach key_name in array array['q1','q2','q3','q4','q5','q6','q7'] loop
    if not (answer_payload ? key_name)
       or (answer_payload ->> key_name) not in ('true','false') then
      raise exception 'Responde Sim ou Não a todas as perguntas do PAR-Q.';
    end if;
    if (answer_payload ->> key_name)::boolean then
      positive_count := positive_count + 1;
    end if;
  end loop;

  if exists (
    select 1 from public.student_parq_submissions
    where student_id = target_student and version_id = target_version_id
  ) then
    raise exception 'Este PAR-Q já foi concluído. O registo existente não pode ser substituído.';
  end if;

  insert into public.student_parq_submissions (
    student_id,
    version_id,
    respondent_profile_id,
    answers,
    positive_answer_count,
    has_positive_answers,
    accepted_statement,
    acceptance_user_agent
  )
  values (
    target_student,
    target_version_id,
    auth.uid(),
    answer_payload,
    positive_count,
    positive_count > 0,
    true,
    left(nullif(trim(coalesce(acceptance_user_agent, '')), ''), 1000)
  )
  returning * into result;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'parq.accepted',
    'student_profiles',
    target_student,
    jsonb_build_object(
      'version_id', target_version_id,
      'positive_answer_count', positive_count,
      'submission_id', result.id
    )
  );

  return result;
end;
$$;

create or replace function public.parq_status_for_student(target_student_id uuid)
returns table (
  submitted boolean,
  submission_id uuid,
  version_code text,
  accepted_at timestamptz,
  has_positive_answers boolean,
  positive_answer_count integer,
  answers jsonb,
  title text,
  intro_text text,
  questions jsonb,
  declaration_text text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.current_profile_is_active() then
    raise exception 'Conta sem acesso.';
  end if;

  if not (
    public.is_admin()
    or public.trainer_has_student(target_student_id)
    or public.current_student_id() = target_student_id
  ) then
    raise exception 'Sem permissão para consultar este PAR-Q.';
  end if;

  return query
  select
    (sps.id is not null) as submitted,
    sps.id as submission_id,
    pv.version_code,
    sps.accepted_at,
    coalesce(sps.has_positive_answers, false),
    coalesce(sps.positive_answer_count, 0),
    sps.answers,
    pv.title,
    pv.intro_text,
    pv.questions,
    pv.declaration_text
  from public.parq_versions pv
  left join public.student_parq_submissions sps
    on sps.version_id = pv.id
   and sps.student_id = target_student_id
  where pv.is_active = true
  order by pv.activated_at desc nulls last, pv.created_at desc
  limit 1;
end;
$$;

-- Integridade adicional: antes da PRIMEIRA avaliação publicada, o aluno tem de
-- ter concluído o PAR-Q ativo. Avaliações seguintes não ficam bloqueadas por
-- uma futura mudança de versão do formulário.
create or replace function public.require_parq_before_first_assessment_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_previous_published boolean;
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    select exists (
      select 1
      from public.physical_assessments pa
      where pa.student_id = new.student_id
        and pa.id <> new.id
        and pa.status = 'published'
        and pa.deleted_at is null
    ) into has_previous_published;

    if not has_previous_published and not public.student_has_current_parq(new.student_id) then
      raise exception 'O aluno tem de concluir o PAR-Q antes da primeira avaliação ser publicada.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists physical_assessments_require_parq on public.physical_assessments;
create trigger physical_assessments_require_parq
before update of status on public.physical_assessments
for each row execute function public.require_parq_before_first_assessment_publish();

-- RLS: submissões são append-only. Não existe UPDATE/DELETE pelo cliente.
alter table public.parq_versions enable row level security;
alter table public.student_parq_submissions enable row level security;

drop policy if exists parq_versions_select_authenticated on public.parq_versions;
create policy parq_versions_select_authenticated
on public.parq_versions
for select to authenticated
using (public.current_profile_is_active());

drop policy if exists student_parq_submissions_select_accessible on public.student_parq_submissions;
create policy student_parq_submissions_select_accessible
on public.student_parq_submissions
for select to authenticated
using (
  public.current_profile_is_active()
  and (
    public.is_admin()
    or public.trainer_has_student(student_id)
    or public.current_student_id() = student_id
  )
);

revoke all on table public.parq_versions from anon, authenticated;
revoke all on table public.student_parq_submissions from anon, authenticated;
grant select on table public.parq_versions to authenticated;
grant select on table public.student_parq_submissions to authenticated;

revoke all on function public.active_parq_version_id() from public, anon;
revoke all on function public.active_parq_version_id() from authenticated;
revoke all on function public.student_has_current_parq(uuid) from public, anon;
revoke all on function public.student_has_current_parq(uuid) from authenticated;
revoke all on function public.current_student_has_required_parq() from public, anon;
grant execute on function public.current_student_has_required_parq() to authenticated;
revoke all on function public.submit_own_parq(uuid, jsonb, text) from public, anon;
grant execute on function public.submit_own_parq(uuid, jsonb, text) to authenticated;
revoke all on function public.parq_status_for_student(uuid) from public, anon;
grant execute on function public.parq_status_for_student(uuid) to authenticated;
revoke all on function public.require_parq_before_first_assessment_publish() from public, anon, authenticated;

insert into public.feature_flags (feature_key, is_enabled, allowed_roles, updated_by)
values ('parq', true, array['admin','trainer','student']::public.app_role[], auth.uid())
on conflict (feature_key) do update
set is_enabled = true,
    allowed_roles = excluded.allowed_roles,
    updated_by = excluded.updated_by,
    updated_at = now();

commit;
