-- ============================================================
-- PULSO — vista pública de perfiles SIN correo
-- (arreglo de la auditoría 2026-11-18, ítem 2 🟠)
-- Archivo APARTE: NO se toca schema.sql.
-- Cómo usarlo: en tu proyecto Supabase ve a SQL Editor, pega
-- todo este archivo y pulsa Run. No borra nada que ya exista.
--
-- PROBLEMA QUE ARREGLA: la política "perfiles visibles" era
-- `for select using (true)` sobre profiles, así que cualquier
-- cuenta (o la anon key, que va dentro del APK) podía hacer
-- `select * from profiles` y cosechar el correo de TODOS los
-- usuarios. La app decía "Tu correo nunca se muestra a otros"
-- (Auth.tsx) pero la base lo entregaba.
--
-- SOLUCIÓN: la app ya no lee la tabla profiles para listar
-- perfiles: lee la vista `profiles_public`, que tiene todos los
-- datos para encontrar compañero pero SIN la columna email.
-- La vista la crea el rol postgres (dueño), así que no pasa por
-- el RLS de la tabla base; el select de profiles queda limitado
-- a la propia fila (o al admin).
-- ============================================================

-- Vista pública: mismos datos que ve la app, sin email.
-- Incluye is_admin / is_blocked desde admin_flags (ver
-- migration_admin_flags.sql) para que el panel siga sabiendo
-- quién es admin y quién está bloqueado sin leer profiles.
create or replace view public.profiles_public as
select
  p.id,
  p.name,
  p.zone,
  p.bio,
  p.beginner,
  p.sports,
  p.availability,
  p.photo_url,
  p.is_coach,
  p.coach_specialty,
  p.coach_experience,
  coalesce(f.is_admin, false) as is_admin,
  coalesce(f.is_blocked, false) as is_blocked,
  p.created_at
from public.profiles p
left join public.admin_flags f on f.profile_id = p.id;

-- La vista la leen todos los usuarios autenticados (y anónimos,
-- que es como PostgREST la sirve para la lista de compañeros).
grant select on public.profiles_public to anon, authenticated;

-- El select de la tabla base ya NO es público: solo la propia fila
-- (para crear/reparar el perfil propio) o un admin.
drop policy if exists "perfiles visibles" on public.profiles;
drop policy if exists "perfiles propios o admin" on public.profiles;
create policy "perfiles propios o admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

-- NOTA: la app (src/lib/store.ts) ya no hace `select('*')` sobre
-- profiles: listProfiles() y getProfile() leen profiles_public.
-- El correo del usuario que entra se toma de su sesión de Auth,
-- no de la tabla.
