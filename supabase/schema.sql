-- ULTIMATE FIT App — Supabase schema inicial
-- Executar no SQL Editor do Supabase antes de usar dados reais.

create extension if not exists "uuid-ossp";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','professor','aluno')),
  full_name text not null,
  email text unique not null,
  phone text,
  photo_url text,
  status text default 'ativo',
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists students (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete set null,
  trainer_id uuid references profiles(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  nif text,
  birth_date date,
  sex text,
  address text,
  notes text,
  status text default 'ativo',
  created_at timestamptz default now()
);

create table if not exists assessments (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references students(id) on delete cascade,
  trainer_id uuid references profiles(id) on delete set null,
  assessment_date date not null default current_date,
  weight numeric,
  height numeric,
  bmi numeric,
  body_fat_percent numeric,
  body_fat_kg numeric,
  muscle_mass_kg numeric,
  body_water_percent numeric,
  visceral_fat numeric,
  bone_mass numeric,
  bmr numeric,
  metabolic_age numeric,
  waist_cm numeric,
  abdomen_cm numeric,
  hip_cm numeric,
  chest_cm numeric,
  arm_right_cm numeric,
  arm_left_cm numeric,
  thigh_right_cm numeric,
  thigh_left_cm numeric,
  calf_right_cm numeric,
  calf_left_cm numeric,
  anamnesis jsonb default '{}'::jsonb,
  notes text,
  created_at timestamptz default now()
);

create table if not exists assessment_photos (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid references assessments(id) on delete cascade,
  view text check (view in ('frente','lado','costas','outro')),
  file_path text not null,
  created_at timestamptz default now()
);

create table if not exists exercise_library (
  id text primary key,
  name text not null,
  muscle_group text not null,
  type text,
  equipment text,
  level text,
  cues text,
  media_url text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists training_plans (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references students(id) on delete cascade,
  trainer_id uuid references profiles(id) on delete set null,
  name text not null,
  goal text,
  frequency text,
  start_date date,
  end_date date,
  status text default 'rascunho',
  created_at timestamptz default now()
);

create table if not exists training_plan_exercises (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid references training_plans(id) on delete cascade,
  exercise_id text references exercise_library(id),
  day_label text,
  sort_order int default 0,
  sets text,
  reps text,
  load text,
  rest text,
  tempo text,
  notes text
);

create table if not exists nutrition_plans (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references students(id) on delete cascade,
  trainer_id uuid references profiles(id) on delete set null,
  title text not null,
  file_path text,
  notes text,
  status text default 'ativo',
  created_at timestamptz default now()
);

create table if not exists reports (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references students(id) on delete cascade,
  assessment_id uuid references assessments(id) on delete cascade,
  title text not null,
  summary text,
  pdf_path text,
  created_at timestamptz default now()
);

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references profiles(id),
  updated_at timestamptz default now()
);

insert into app_settings (key, value)
values ('public_launch', jsonb_build_object(
  'comingSoonEnabled', true,
  'launchDate', (now() + interval '30 days')::text,
  'headline', 'COMING SOON',
  'subtitle', 'ULTIMATE FIT APP'
)) on conflict (key) do nothing;

alter table profiles enable row level security;
alter table students enable row level security;
alter table assessments enable row level security;
alter table assessment_photos enable row level security;
alter table exercise_library enable row level security;
alter table training_plans enable row level security;
alter table training_plan_exercises enable row level security;
alter table nutrition_plans enable row level security;
alter table reports enable row level security;
alter table app_settings enable row level security;

create or replace function public.current_user_role()
returns text language sql security definer stable as $$
  select role from public.profiles where id = auth.uid()
$$;

create policy "profiles read own or staff" on profiles for select using (id = auth.uid() or current_user_role() in ('admin','professor'));
create policy "profiles admin write" on profiles for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

create policy "students read by role" on students for select using (current_user_role()='admin' or trainer_id=auth.uid() or profile_id=auth.uid());
create policy "students staff write" on students for all using (current_user_role() in ('admin','professor')) with check (current_user_role() in ('admin','professor'));

create policy "assessments read by role" on assessments for select using (current_user_role()='admin' or trainer_id=auth.uid() or student_id in (select id from students where profile_id=auth.uid()));
create policy "assessments staff write" on assessments for all using (current_user_role() in ('admin','professor')) with check (current_user_role() in ('admin','professor'));

create policy "assessment photos read by role" on assessment_photos for select using (assessment_id in (select id from assessments where current_user_role()='admin' or trainer_id=auth.uid() or student_id in (select id from students where profile_id=auth.uid())));
create policy "assessment photos staff write" on assessment_photos for all using (current_user_role() in ('admin','professor')) with check (current_user_role() in ('admin','professor'));

create policy "exercise library read all authenticated" on exercise_library for select using (auth.uid() is not null);
create policy "exercise library staff write" on exercise_library for all using (current_user_role() in ('admin','professor')) with check (current_user_role() in ('admin','professor'));

create policy "training read by role" on training_plans for select using (current_user_role()='admin' or trainer_id=auth.uid() or student_id in (select id from students where profile_id=auth.uid()));
create policy "training staff write" on training_plans for all using (current_user_role() in ('admin','professor')) with check (current_user_role() in ('admin','professor'));
create policy "training exercises read authenticated" on training_plan_exercises for select using (auth.uid() is not null);
create policy "training exercises staff write" on training_plan_exercises for all using (current_user_role() in ('admin','professor')) with check (current_user_role() in ('admin','professor'));

create policy "nutrition read by role" on nutrition_plans for select using (current_user_role()='admin' or trainer_id=auth.uid() or student_id in (select id from students where profile_id=auth.uid()));
create policy "nutrition staff write" on nutrition_plans for all using (current_user_role() in ('admin','professor')) with check (current_user_role() in ('admin','professor'));

create policy "reports read by role" on reports for select using (current_user_role()='admin' or student_id in (select id from students where profile_id=auth.uid()));
create policy "reports staff write" on reports for all using (current_user_role() in ('admin','professor')) with check (current_user_role() in ('admin','professor'));

create policy "app settings public read" on app_settings for select using (true);
create policy "app settings admin write" on app_settings for all using (current_user_role()='admin') with check (current_user_role()='admin');
