-- ============================================================
-- PULSO — esquema de Supabase (PostgreSQL)
-- Cómo usarlo: en tu proyecto Supabase ve a SQL Editor,
-- pega todo este archivo y pulsa Run. No borra nada que ya
-- exista con el mismo nombre (usa IF NOT EXISTS).
-- ============================================================

-- Perfiles: una fila por usuario. id = id del usuario de Supabase Auth.
create table if not exists profiles (
  id uuid primary key,
  name text not null,
  email text not null,
  zone text not null default 'Cancún centro',
  bio text not null default '',
  beginner boolean not null default true,
  sports jsonb not null default '[]',        -- [{sport, level}]
  availability text[] not null default '{}', -- ['lunes','martes',...]
  photo_url text,
  created_at timestamptz not null default now()
);

-- Deportes y nivel por separado, para buscar por deporte/nivel en SQL.
create table if not exists profile_sports (
  profile_id uuid not null references profiles(id) on delete cascade,
  sport text not null,
  level text not null check (level in ('principiante','intermedio','avanzado')),
  primary key (profile_id, sport)
);

-- Sesiones y eventos.
create table if not exists sessions (
  id text primary key,
  title text not null,
  sport text not null,
  level text not null default 'todos',
  date date not null,
  time time not null,
  place text not null,
  zone text not null,
  capacity int not null default 8,
  host_id uuid not null references profiles(id) on delete cascade,
  host_name text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Confirmaciones y lista de espera.
create table if not exists rsvps (
  id text primary key,
  session_id text not null references sessions(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  status text not null check (status in ('confirmed','waitlist')),
  created_at timestamptz not null default now(),
  unique (session_id, profile_id)
);

-- Entrenamientos (manual o GPS; la ruta GPS se guarda en route).
create table if not exists workouts (
  id text primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  sport text not null,
  date date not null,
  duration_min int not null,
  distance_km numeric,
  notes text,
  route jsonb, -- [{lat, lng}, ...] o null
  created_at timestamptz not null default now()
);

-- Retos (7 o 30 días).
create table if not exists challenges (
  id text primary key,
  title text not null,
  days int not null check (days in (7, 30)),
  target_count int not null,
  target_km numeric,
  start_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists challenge_joins (
  challenge_id text not null references challenges(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  primary key (challenge_id, profile_id)
);

-- Planes del entrenador IA (un plan semanal por persona, con tareas).
create table if not exists training_plans (
  id text primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  sport text not null,
  level text not null default 'principiante',
  goal text not null default 'constancia',
  days_per_week int not null default 3,
  minutes_per_session int not null default 30,
  adjustment text not null default '',
  week_goal_km numeric,
  tasks jsonb not null default '[]', -- [{id, day, date, title, detail, duration_min, distance_km, done}]
  created_at timestamptz not null default now()
);

-- Comunidad.
create table if not exists posts (
  id text primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  author_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);

-- Negocios locales.
create table if not exists businesses (
  id text primary key,
  name text not null,
  kind text not null,
  zone text not null,
  description text not null default '',
  phone text,
  created_at timestamptz not null default now()
);

-- Índices útiles.
create index if not exists idx_sessions_date on sessions(date);
create index if not exists idx_workouts_profile_date on workouts(profile_id, date);
create index if not exists idx_rsvps_session on rsvps(session_id);

-- ============================================================
-- Seguridad (Row Level Security): cada usuario solo edita lo
-- suyo. Actívalo después de crear las tablas. Si algo no
-- funciona al probar, revisa primero estas políticas.
-- ============================================================
alter table profiles enable row level security;
alter table profile_sports enable row level security;
alter table sessions enable row level security;
alter table rsvps enable row level security;
alter table workouts enable row level security;
alter table challenges enable row level security;
alter table challenge_joins enable row level security;
alter table training_plans enable row level security;
alter table posts enable row level security;
alter table businesses enable row level security;

-- Lectura pública de perfiles, sesiones, retos, posts y negocios
-- (son datos para encontrar compañero; el correo no se muestra
-- en la app aunque esté en la tabla).
drop policy if exists "perfiles visibles" on profiles;
create policy "perfiles visibles" on profiles for select using (true);
drop policy if exists "cada quien edita su perfil" on profiles;
create policy "cada quien edita su perfil" on profiles for all using (auth.uid() = id);

drop policy if exists "deportes visibles" on profile_sports;
create policy "deportes visibles" on profile_sports for select using (true);
drop policy if exists "cada quien edita sus deportes" on profile_sports;
create policy "cada quien edita sus deportes" on profile_sports for all using (auth.uid() = profile_id);

drop policy if exists "sesiones visibles" on sessions;
create policy "sesiones visibles" on sessions for select using (true);
drop policy if exists "sesiones crear" on sessions;
create policy "sesiones crear" on sessions for insert with check (auth.uid() = host_id);
drop policy if exists "sesiones editar propias" on sessions;
create policy "sesiones editar propias" on sessions for update using (auth.uid() = host_id);
drop policy if exists "sesiones borrar propias" on sessions;
create policy "sesiones borrar propias" on sessions for delete using (auth.uid() = host_id);

drop policy if exists "rsvps visibles" on rsvps;
create policy "rsvps visibles" on rsvps for select using (true);
drop policy if exists "rsvps propios" on rsvps;
create policy "rsvps propios" on rsvps for all using (auth.uid() = profile_id);

drop policy if exists "entrenamientos propios" on workouts;
create policy "entrenamientos propios" on workouts for all using (auth.uid() = profile_id);

drop policy if exists "retos visibles" on challenges;
create policy "retos visibles" on challenges for select using (true);
drop policy if exists "retos crear" on challenges;
create policy "retos crear" on challenges for insert with check (auth.uid() is not null);

drop policy if exists "unirse a retos" on challenge_joins;
create policy "unirse a retos" on challenge_joins for all using (auth.uid() = profile_id);

drop policy if exists "planes propios" on training_plans;
create policy "planes propios" on training_plans for all using (auth.uid() = profile_id);

drop policy if exists "posts visibles" on posts;
create policy "posts visibles" on posts for select using (true);
drop policy if exists "posts propios" on posts;
create policy "posts propios" on posts for all using (auth.uid() = profile_id);

drop policy if exists "negocios visibles" on businesses;
create policy "negocios visibles" on businesses for select using (true);
drop policy if exists "negocios crear" on businesses;
create policy "negocios crear" on businesses for insert with check (auth.uid() is not null);
