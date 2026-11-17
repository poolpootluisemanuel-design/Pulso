-- Migración: tabla push_tokens (tokens FCM para notificaciones push).
-- ARCHIVO APARTE: no tocar supabase/schema.sql.
-- Correr en Supabase → SQL Editor → pegar y Run.
-- Un token por perfil (un teléfono por cuenta; si el usuario cambia de
-- teléfono, el upsert actualiza el token). El servidor de envío de
-- notificaciones (aún no existe) leerá de aquí el token de cada perfil.
create table if not exists push_tokens (
  profile_id uuid primary key references profiles(id) on delete cascade,
  token text not null,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);

alter table push_tokens enable row level security;

-- Cada usuario solo gestiona su propio token: nadie ve ni toca el de otro.
create policy "cada quien ve su token" on push_tokens
  for select using (auth.uid() = profile_id);

create policy "cada quien guarda su token" on push_tokens
  for insert with check (auth.uid() = profile_id);

create policy "cada quien actualiza su token" on push_tokens
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "cada quien borra su token" on push_tokens
  for delete using (auth.uid() = profile_id);
