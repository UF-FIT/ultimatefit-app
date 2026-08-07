-- ULTIMATE FIT APP
-- Migration 007: Avaliação Física modular (Update 5B)
-- Inclui histórico, anamnese inicial, perimetria, dobras cutâneas,
-- bioimpedância TANITA, análise postural e evolução fotográfica.
-- O PAR-Q obrigatório/assinatura digital será ativado no Update 5B.1.

begin;

create table if not exists public.physical_assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete restrict,
  assessor_profile_id uuid references public.profiles(id) on delete set null default auth.uid(),
  assessment_date date not null default current_date,
  status text not null default 'draft',
  general_notes text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint physical_assessment_status_valid check (status in ('draft','published','archived'))
);

create index if not exists physical_assessments_student_date_idx
  on public.physical_assessments(student_id, assessment_date desc, created_at desc)
  where deleted_at is null;

create index if not exists physical_assessments_status_idx
  on public.physical_assessments(status, assessment_date desc)
  where deleted_at is null;

-- Anamnese: existe uma única vez por aluno e fica associada à primeira avaliação.
create table if not exists public.assessment_anamnesis (
  assessment_id uuid primary key references public.physical_assessments(id) on delete cascade,
  student_id uuid not null unique references public.student_profiles(id) on delete restrict,
  family_cardiac_problem boolean,
  recent_disease boolean,
  recent_disease_details text,
  medication boolean,
  medication_details text,
  dietary_restriction boolean,
  dietary_restriction_details text,
  recent_surgery boolean,
  recent_surgery_details text,
  smoker boolean,
  cigarettes_per_day integer,
  muscle_pain boolean,
  muscle_pain_details text,
  weight_diet boolean,
  physical_activity_level text,
  risk_dyslipidemia boolean,
  risk_hypertension boolean,
  risk_family_history boolean,
  risk_obesity boolean,
  risk_smoking boolean,
  risk_sedentary boolean,
  risk_fasting_glucose boolean,
  protective_high_hdl boolean,
  known_cardiovascular boolean,
  known_pulmonary boolean,
  known_metabolic boolean,
  risk_result text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anamnesis_activity_level_valid check (
    physical_activity_level is null or physical_activity_level in ('sedentary','moderately_active','active','very_active','athlete')
  ),
  constraint anamnesis_risk_result_valid check (
    risk_result is null or risk_result in ('apparently_healthy','increased_risk','known_disease','not_assessed')
  ),
  constraint anamnesis_cigarettes_valid check (cigarettes_per_day is null or cigarettes_per_day >= 0)
);

create table if not exists public.assessment_perimetry (
  assessment_id uuid primary key references public.physical_assessments(id) on delete cascade,
  height_cm numeric(6,2),
  neck_cm numeric(6,2),
  shoulder_cm numeric(6,2),
  chest_cm numeric(6,2),
  waist_cm numeric(6,2),
  abdominal_cm numeric(6,2),
  hip_cm numeric(6,2),
  arm_right_relaxed_cm numeric(6,2),
  arm_right_flexed_cm numeric(6,2),
  arm_left_relaxed_cm numeric(6,2),
  arm_left_flexed_cm numeric(6,2),
  forearm_right_cm numeric(6,2),
  forearm_left_cm numeric(6,2),
  thigh_right_cm numeric(6,2),
  thigh_left_cm numeric(6,2),
  calf_right_cm numeric(6,2),
  calf_left_cm numeric(6,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_skinfolds (
  assessment_id uuid primary key references public.physical_assessments(id) on delete cascade,
  pectoral_mm numeric(6,2),
  bicipital_mm numeric(6,2),
  tricipital_mm numeric(6,2),
  subscapular_mm numeric(6,2),
  midaxillary_mm numeric(6,2),
  suprailiac_mm numeric(6,2),
  abdominal_mm numeric(6,2),
  thigh_mm numeric(6,2),
  calf_mm numeric(6,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_bioimpedance (
  assessment_id uuid primary key references public.physical_assessments(id) on delete cascade,
  device text not null default 'TANITA',
  height_cm numeric(6,2),
  weight_kg numeric(7,2),
  bmi numeric(6,2),
  body_fat_pct numeric(6,2),
  muscle_mass_kg numeric(7,2),
  water_pct numeric(6,2),
  bone_mass_kg numeric(6,2),
  basal_metabolic_rate_kcal integer,
  metabolic_age integer,
  visceral_fat_rating numeric(6,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bioimpedance_weight_valid check (weight_kg is null or weight_kg > 0),
  constraint bioimpedance_height_valid check (height_cm is null or height_cm > 0)
);

create table if not exists public.assessment_posture (
  assessment_id uuid primary key references public.physical_assessments(id) on delete cascade,
  anterior_notes text,
  posterior_notes text,
  lateral_right_notes text,
  lateral_left_notes text,
  general_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_photos (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.physical_assessments(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete restrict,
  photo_type text not null,
  image_path text not null,
  thumb_path text,
  caption text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint assessment_photo_type_valid check (photo_type in ('front','side_right','side_left','back','other'))
);

create index if not exists assessment_photos_assessment_idx
  on public.assessment_photos(assessment_id, photo_type, created_at);
create index if not exists assessment_photos_student_idx
  on public.assessment_photos(student_id, created_at desc);

-- updated_at automático
-- PostgreSQL does not support FOREACH over table identifiers in plain SQL safely;
-- keep explicit triggers so upgrades are predictable.
drop trigger if exists physical_assessments_set_updated_at on public.physical_assessments;
create trigger physical_assessments_set_updated_at before update on public.physical_assessments
for each row execute function public.set_updated_at();

drop trigger if exists assessment_anamnesis_set_updated_at on public.assessment_anamnesis;
create trigger assessment_anamnesis_set_updated_at before update on public.assessment_anamnesis
for each row execute function public.set_updated_at();

drop trigger if exists assessment_perimetry_set_updated_at on public.assessment_perimetry;
create trigger assessment_perimetry_set_updated_at before update on public.assessment_perimetry
for each row execute function public.set_updated_at();

drop trigger if exists assessment_skinfolds_set_updated_at on public.assessment_skinfolds;
create trigger assessment_skinfolds_set_updated_at before update on public.assessment_skinfolds
for each row execute function public.set_updated_at();

drop trigger if exists assessment_bioimpedance_set_updated_at on public.assessment_bioimpedance;
create trigger assessment_bioimpedance_set_updated_at before update on public.assessment_bioimpedance
for each row execute function public.set_updated_at();

drop trigger if exists assessment_posture_set_updated_at on public.assessment_posture;
create trigger assessment_posture_set_updated_at before update on public.assessment_posture
for each row execute function public.set_updated_at();

-- Integridade: student_id redundante tem de corresponder ao cabeçalho da avaliação.
create or replace function public.validate_assessment_anamnesis_student()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare expected_student uuid;
begin
  select pa.student_id into expected_student from public.physical_assessments pa where pa.id = new.assessment_id;
  if expected_student is null or expected_student <> new.student_id then
    raise exception 'Aluno da anamnese não corresponde à avaliação.';
  end if;
  return new;
end;
$$;

drop trigger if exists assessment_anamnesis_validate_student on public.assessment_anamnesis;
create trigger assessment_anamnesis_validate_student
before insert or update of assessment_id, student_id on public.assessment_anamnesis
for each row execute function public.validate_assessment_anamnesis_student();

create or replace function public.validate_assessment_photo_student()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare expected_student uuid;
begin
  select pa.student_id into expected_student from public.physical_assessments pa where pa.id = new.assessment_id;
  if expected_student is null or expected_student <> new.student_id then
    raise exception 'Aluno da fotografia não corresponde à avaliação.';
  end if;
  return new;
end;
$$;

drop trigger if exists assessment_photos_validate_student on public.assessment_photos;
create trigger assessment_photos_validate_student
before insert or update of assessment_id, student_id on public.assessment_photos
for each row execute function public.validate_assessment_photo_student();

-- Helpers de autorização
create or replace function public.can_manage_assessment_student(target_student_id uuid)
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
        and public.trainer_has_permission('manage_assessments')
      )
    );
$$;

create or replace function public.can_view_physical_assessment(target_assessment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.physical_assessments pa
    where pa.id = target_assessment_id
      and pa.deleted_at is null
      and public.current_profile_is_active()
      and (
        public.is_admin()
        or public.trainer_has_student(pa.student_id)
        or (pa.student_id = public.current_student_id() and pa.status = 'published')
      )
  );
$$;

create or replace function public.can_manage_physical_assessment(target_assessment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.physical_assessments pa
    where pa.id = target_assessment_id
      and pa.deleted_at is null
      and public.can_manage_assessment_student(pa.student_id)
  );
$$;


create or replace function public.assessment_id_from_storage_path(object_name text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  second_part text;
begin
  second_part := split_part(coalesce(object_name, ''), '/', 2);
  if second_part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return second_part::uuid;
  end if;
  return null;
end;
$$;

-- Publicar passa por RPC para validar a primeira avaliação.
create or replace function public.publish_physical_assessment(target_assessment_id uuid)
returns public.physical_assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.physical_assessments;
  first_published_exists boolean;
  has_anamnesis boolean;
  has_module boolean;
begin
  select * into target
  from public.physical_assessments
  where id = target_assessment_id and deleted_at is null;

  if target.id is null then
    raise exception 'Avaliação não encontrada.';
  end if;
  if not public.can_manage_assessment_student(target.student_id) then
    raise exception 'Sem permissão para publicar esta avaliação.';
  end if;

  select exists(
    select 1 from public.physical_assessments pa
    where pa.student_id = target.student_id
      and pa.id <> target.id
      and pa.status = 'published'
      and pa.deleted_at is null
  ) into first_published_exists;

  select exists(select 1 from public.assessment_anamnesis aa where aa.assessment_id = target.id)
    into has_anamnesis;

  select (
    has_anamnesis
    or exists(select 1 from public.assessment_perimetry ap where ap.assessment_id = target.id)
    or exists(select 1 from public.assessment_skinfolds ask where ask.assessment_id = target.id)
    or exists(select 1 from public.assessment_bioimpedance ab where ab.assessment_id = target.id)
    or exists(select 1 from public.assessment_posture apo where apo.assessment_id = target.id)
    or exists(select 1 from public.assessment_photos aph where aph.assessment_id = target.id)
  ) into has_module;

  if not has_module then
    raise exception 'Preenche pelo menos um módulo antes de publicar.';
  end if;

  if not first_published_exists and not has_anamnesis then
    raise exception 'A primeira avaliação do aluno tem de incluir a anamnese.';
  end if;

  update public.physical_assessments
  set status = 'published', published_at = coalesce(published_at, now()), updated_at = now()
  where id = target.id
  returning * into target;

  return target;
end;
$$;

-- RLS
alter table public.physical_assessments enable row level security;
alter table public.assessment_anamnesis enable row level security;
alter table public.assessment_perimetry enable row level security;
alter table public.assessment_skinfolds enable row level security;
alter table public.assessment_bioimpedance enable row level security;
alter table public.assessment_posture enable row level security;
alter table public.assessment_photos enable row level security;

-- Cabeçalho da avaliação

drop policy if exists physical_assessments_select on public.physical_assessments;
create policy physical_assessments_select on public.physical_assessments
for select to authenticated
using (
  deleted_at is null
  and public.current_profile_is_active()
  and (
    public.is_admin()
    or public.trainer_has_student(student_id)
    or (student_id = public.current_student_id() and status = 'published')
  )
);

drop policy if exists physical_assessments_insert on public.physical_assessments;
create policy physical_assessments_insert on public.physical_assessments
for insert to authenticated
with check (public.can_manage_assessment_student(student_id));

drop policy if exists physical_assessments_update on public.physical_assessments;
create policy physical_assessments_update on public.physical_assessments
for update to authenticated
using (public.can_manage_assessment_student(student_id))
with check (public.can_manage_assessment_student(student_id));

drop policy if exists physical_assessments_delete on public.physical_assessments;
create policy physical_assessments_delete on public.physical_assessments
for delete to authenticated
using (status = 'draft' and public.can_manage_assessment_student(student_id));

-- Módulos 1:1 usam a avaliação como fronteira de autorização.
-- ANAMNESE

drop policy if exists assessment_anamnesis_select on public.assessment_anamnesis;
create policy assessment_anamnesis_select on public.assessment_anamnesis
for select to authenticated using (public.can_view_physical_assessment(assessment_id));
drop policy if exists assessment_anamnesis_insert on public.assessment_anamnesis;
create policy assessment_anamnesis_insert on public.assessment_anamnesis
for insert to authenticated with check (public.can_manage_physical_assessment(assessment_id));
drop policy if exists assessment_anamnesis_update on public.assessment_anamnesis;
create policy assessment_anamnesis_update on public.assessment_anamnesis
for update to authenticated using (public.can_manage_physical_assessment(assessment_id)) with check (public.can_manage_physical_assessment(assessment_id));
drop policy if exists assessment_anamnesis_delete on public.assessment_anamnesis;
create policy assessment_anamnesis_delete on public.assessment_anamnesis
for delete to authenticated using (public.can_manage_physical_assessment(assessment_id));

-- PERIMETRIA

drop policy if exists assessment_perimetry_select on public.assessment_perimetry;
create policy assessment_perimetry_select on public.assessment_perimetry
for select to authenticated using (public.can_view_physical_assessment(assessment_id));
drop policy if exists assessment_perimetry_insert on public.assessment_perimetry;
create policy assessment_perimetry_insert on public.assessment_perimetry
for insert to authenticated with check (public.can_manage_physical_assessment(assessment_id));
drop policy if exists assessment_perimetry_update on public.assessment_perimetry;
create policy assessment_perimetry_update on public.assessment_perimetry
for update to authenticated using (public.can_manage_physical_assessment(assessment_id)) with check (public.can_manage_physical_assessment(assessment_id));
drop policy if exists assessment_perimetry_delete on public.assessment_perimetry;
create policy assessment_perimetry_delete on public.assessment_perimetry
for delete to authenticated using (public.can_manage_physical_assessment(assessment_id));

-- DOBRAS

drop policy if exists assessment_skinfolds_select on public.assessment_skinfolds;
create policy assessment_skinfolds_select on public.assessment_skinfolds
for select to authenticated using (public.can_view_physical_assessment(assessment_id));
drop policy if exists assessment_skinfolds_insert on public.assessment_skinfolds;
create policy assessment_skinfolds_insert on public.assessment_skinfolds
for insert to authenticated with check (public.can_manage_physical_assessment(assessment_id));
drop policy if exists assessment_skinfolds_update on public.assessment_skinfolds;
create policy assessment_skinfolds_update on public.assessment_skinfolds
for update to authenticated using (public.can_manage_physical_assessment(assessment_id)) with check (public.can_manage_physical_assessment(assessment_id));
drop policy if exists assessment_skinfolds_delete on public.assessment_skinfolds;
create policy assessment_skinfolds_delete on public.assessment_skinfolds
for delete to authenticated using (public.can_manage_physical_assessment(assessment_id));

-- BIOIMPEDÂNCIA

drop policy if exists assessment_bioimpedance_select on public.assessment_bioimpedance;
create policy assessment_bioimpedance_select on public.assessment_bioimpedance
for select to authenticated using (public.can_view_physical_assessment(assessment_id));
drop policy if exists assessment_bioimpedance_insert on public.assessment_bioimpedance;
create policy assessment_bioimpedance_insert on public.assessment_bioimpedance
for insert to authenticated with check (public.can_manage_physical_assessment(assessment_id));
drop policy if exists assessment_bioimpedance_update on public.assessment_bioimpedance;
create policy assessment_bioimpedance_update on public.assessment_bioimpedance
for update to authenticated using (public.can_manage_physical_assessment(assessment_id)) with check (public.can_manage_physical_assessment(assessment_id));
drop policy if exists assessment_bioimpedance_delete on public.assessment_bioimpedance;
create policy assessment_bioimpedance_delete on public.assessment_bioimpedance
for delete to authenticated using (public.can_manage_physical_assessment(assessment_id));

-- POSTURA

drop policy if exists assessment_posture_select on public.assessment_posture;
create policy assessment_posture_select on public.assessment_posture
for select to authenticated using (public.can_view_physical_assessment(assessment_id));
drop policy if exists assessment_posture_insert on public.assessment_posture;
create policy assessment_posture_insert on public.assessment_posture
for insert to authenticated with check (public.can_manage_physical_assessment(assessment_id));
drop policy if exists assessment_posture_update on public.assessment_posture;
create policy assessment_posture_update on public.assessment_posture
for update to authenticated using (public.can_manage_physical_assessment(assessment_id)) with check (public.can_manage_physical_assessment(assessment_id));
drop policy if exists assessment_posture_delete on public.assessment_posture;
create policy assessment_posture_delete on public.assessment_posture
for delete to authenticated using (public.can_manage_physical_assessment(assessment_id));

-- FOTOS

drop policy if exists assessment_photos_select on public.assessment_photos;
create policy assessment_photos_select on public.assessment_photos
for select to authenticated using (public.can_view_physical_assessment(assessment_id));
drop policy if exists assessment_photos_insert on public.assessment_photos;
create policy assessment_photos_insert on public.assessment_photos
for insert to authenticated with check (public.can_manage_physical_assessment(assessment_id));
drop policy if exists assessment_photos_update on public.assessment_photos;
create policy assessment_photos_update on public.assessment_photos
for update to authenticated using (public.can_manage_physical_assessment(assessment_id)) with check (public.can_manage_physical_assessment(assessment_id));
drop policy if exists assessment_photos_delete on public.assessment_photos;
create policy assessment_photos_delete on public.assessment_photos
for delete to authenticated using (public.can_manage_physical_assessment(assessment_id));

-- Bucket privado para fotografias de evolução/análise postural.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assessment-photos',
  'assessment-photos',
  false,
  6291456,
  array['image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists assessment_photos_storage_select on storage.objects;
create policy assessment_photos_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'assessment-photos'
  and public.can_view_physical_assessment(public.assessment_id_from_storage_path(name))
);

drop policy if exists assessment_photos_storage_insert on storage.objects;
create policy assessment_photos_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'assessment-photos'
  and public.can_manage_assessment_student(public.student_id_from_storage_path(name))
);

drop policy if exists assessment_photos_storage_update on storage.objects;
create policy assessment_photos_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'assessment-photos'
  and public.can_manage_assessment_student(public.student_id_from_storage_path(name))
)
with check (
  bucket_id = 'assessment-photos'
  and public.can_manage_assessment_student(public.student_id_from_storage_path(name))
);

drop policy if exists assessment_photos_storage_delete on storage.objects;
create policy assessment_photos_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'assessment-photos'
  and public.can_manage_assessment_student(public.student_id_from_storage_path(name))
);

-- Privileges
revoke all on table public.physical_assessments from anon;
revoke all on table public.assessment_anamnesis from anon;
revoke all on table public.assessment_perimetry from anon;
revoke all on table public.assessment_skinfolds from anon;
revoke all on table public.assessment_bioimpedance from anon;
revoke all on table public.assessment_posture from anon;
revoke all on table public.assessment_photos from anon;

grant select, insert, update, delete on public.physical_assessments to authenticated;
grant select, insert, update, delete on public.assessment_anamnesis to authenticated;
grant select, insert, update, delete on public.assessment_perimetry to authenticated;
grant select, insert, update, delete on public.assessment_skinfolds to authenticated;
grant select, insert, update, delete on public.assessment_bioimpedance to authenticated;
grant select, insert, update, delete on public.assessment_posture to authenticated;
grant select, insert, update, delete on public.assessment_photos to authenticated;

grant execute on function public.can_manage_assessment_student(uuid) to authenticated;
grant execute on function public.can_view_physical_assessment(uuid) to authenticated;
grant execute on function public.can_manage_physical_assessment(uuid) to authenticated;
grant execute on function public.assessment_id_from_storage_path(text) to authenticated;
revoke all on function public.validate_assessment_anamnesis_student() from public, anon, authenticated;
revoke all on function public.validate_assessment_photo_student() from public, anon, authenticated;
revoke all on function public.publish_physical_assessment(uuid) from public, anon;
grant execute on function public.publish_physical_assessment(uuid) to authenticated;

-- Ativa os módulos de avaliação/evolução fotográfica no backoffice.
update public.feature_flags
set is_enabled = true, updated_by = auth.uid(), updated_at = now()
where feature_key in ('physical_assessments','progress','progress_photos');

commit;
