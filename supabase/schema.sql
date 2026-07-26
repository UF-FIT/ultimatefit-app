-- Estrutura de produção planeada. Não executar antes da validação do MVP.
create type public.app_role as enum ('admin','professor','aluno');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  name text not null,
  email text not null,
  phone text,
  photo_path text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  name text not null,
  nif text,
  birth_date date,
  sex text,
  phone text,
  email text not null,
  objective text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.student_trainers (
  student_id uuid references public.students(id) on delete cascade,
  trainer_id uuid references public.profiles(id) on delete cascade,
  primary key (student_id, trainer_id)
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  trainer_id uuid references public.profiles(id),
  assessment_date date not null,
  measurements jsonb not null default '{}'::jsonb,
  anamnesis text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.assessment_photos (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  view_type text not null,
  storage_path text not null
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text not null,
  equipment text,
  exercise_type text,
  difficulty text,
  description text,
  media_path text,
  active boolean not null default true
);

create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  trainer_id uuid not null references public.profiles(id),
  title text not null,
  status text not null default 'draft',
  start_date date,
  duration_weeks integer,
  created_at timestamptz not null default now()
);

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  name text not null,
  position integer not null default 0
);

create table public.training_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  sets integer,
  repetitions text,
  load text,
  rest text,
  cadence text,
  notes text,
  position integer not null default 0
);

create table public.nutrition_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  uploaded_by uuid references public.profiles(id),
  title text not null,
  storage_path text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  title text not null,
  target text,
  deadline date,
  progress numeric default 0
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  active boolean not null default true
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  trainer_id uuid not null references public.profiles(id),
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value jsonb not null
);

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.student_trainers enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_photos enable row level security;
alter table public.exercises enable row level security;
alter table public.training_plans enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_items enable row level security;
alter table public.nutrition_documents enable row level security;
alter table public.goals enable row level security;
alter table public.challenges enable row level security;
alter table public.messages enable row level security;
alter table public.app_settings enable row level security;
