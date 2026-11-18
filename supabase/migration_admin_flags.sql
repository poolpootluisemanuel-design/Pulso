-- ============================================================
-- PULSO — permisos de admin y bloqueo fuera de profiles
-- (arreglo de la auditoría 2026-11-18, ítem 1 🔴)
-- Archivo APARTE: NO se toca schema.sql.
-- Cómo usarlo: en tu proyecto Supabase ve a SQL Editor, pega
-- todo este archivo y pulsa Run. No borra nada que ya exista.
--
-- ORDEN IMPORTANTE: este archivo DEBE correrse ANTES que
-- migration_profiles_public.sql, migration_chat_moderation.sql
-- y migration_challenges_businesses_admin.sql, porque esos
-- usan la tabla admin_flags y la función is_admin() que se
-- crean aquí. Y DENTRO de este archivo el orden también
-- importa: primero la tabla admin_flags, DESPUÉS la función
-- is_admin() (si la función se crea antes que la tabla,
-- Postgres la rechaza con ERROR 42P01).
--
-- PROBLEMA QUE ARREGLA: la política "cada quien edita su perfil"
-- era `for all` sobre profiles y no limitaba QUÉ columnas se
-- podían cambiar: cualquier usuario autenticado podía hacer
-- `update profiles set is_admin = true where id = auth.uid()`
-- y hacerse admin. Con is_admin = true se podían borrar
-- sesiones y posts de cualquiera y ver entrenamientos de todos.
--
-- SOLUCIÓN: los permisos viven en una tabla aparte `admin_flags`
-- que solo un admin puede leer/escribir, y un trigger impide que
-- un usuario normal cambie is_admin/is_blocked en profiles (las
-- columnas quedan como espejo de compatibilidad, pero ya no mandan).
-- La app lee el rol desde admin_flags (ver src/lib/store.ts).
-- ============================================================

-- 1) PRIMERO la tabla de permisos: una fila por usuario.
create table if not exists public.admin_flags (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  is_admin boolean not null default false,
  is_blocked boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 2) Migrar los valores que ya existían en profiles (sin borrar nada):
-- si alguien ya era admin o estaba bloqueado, su fila pasa aquí.
-- Luis ya es admin en profiles.is_admin = true y NO debe perderlo.
insert into public.admin_flags (profile_id, is_admin, is_blocked)
select id,
  coalesce(is_admin, false),
  coalesce(is_blocked, false)
from public.profiles
on conflict (profile_id) do nothing;

-- El dueño siempre es admin en la base (su acceso en la app también
-- viene por su correo, pero RLS solo ve esta tabla).
insert into public.admin_flags (profile_id, is_admin, is_blocked)
select id, true, false from public.profiles
where email = 'pool.poot.luis.emanuel@gmail.com'
on conflict (profile_id) do update set is_admin = true;

alter table public.admin_flags enable row level security;

-- 3) AHORA SÍ la función auxiliar (security definer, para no hacer
-- recursión en las políticas): ¿el usuario actual es admin?
-- Se crea DESPUÉS de la tabla porque la consulta dentro de la
-- función se valida al crearla; antes daba ERROR 42P01.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_flags
    where profile_id = auth.uid() and is_admin = true
  );
$$;

-- Cada quien puede VER su propia fila (para saber si está bloqueado).
drop policy if exists "ver flags propios" on public.admin_flags;
create policy "ver flags propios" on public.admin_flags
  for select using (auth.uid() = profile_id or public.is_admin());

-- Solo un admin puede crear, cambiar o borrar filas de permisos.
drop policy if exists "admins gestionan flags" on public.admin_flags;
create policy "admins gestionan flags" on public.admin_flags
  for all using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- Candado en profiles: un usuario normal ya NO puede cambiar
-- is_admin ni is_blocked de su propia fila (ni borrarla).
-- ============================================================

-- La política vieja "cada quien edita su perfil" era `for all`
-- (incluía DELETE de la propia fila, que por cascade borraba sus
-- sesiones, RSVPs, entrenamientos y mensajes). Se reemplaza por
-- políticas separadas sin DELETE.
drop policy if exists "cada quien edita su perfil" on public.profiles;
drop policy if exists "cada quien actualiza su perfil" on public.profiles;
create policy "cada quien actualiza su perfil" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- Trigger: rechaza cualquier UPDATE que intente cambiar is_admin o
-- is_blocked si quien lo hace no es admin. Así, aunque la política
-- de update permita tocar la fila, los campos sensibles están
-- protegidos a nivel de base de datos.
create or replace function public.protect_profile_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.is_admin is distinct from old.is_admin)
     or (new.is_blocked is distinct from old.is_blocked) then
    if not public.is_admin() then
      raise exception 'No puedes cambiar tu permiso de admin ni tu bloqueo.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_flags on public.profiles;
create trigger protect_profile_flags
  before update on public.profiles
  for each row execute function public.protect_profile_flags();

-- Las políticas de admin que leían profiles.is_admin ahora usan la
-- función (que lee admin_flags): se recrean para que sigan
-- funcionando después del cambio.
drop policy if exists "admins editan perfiles" on public.profiles;
create policy "admins editan perfiles" on public.profiles
  for update using (public.is_admin());

drop policy if exists "admins borran sesiones" on public.sessions;
create policy "admins borran sesiones" on public.sessions
  for delete using (public.is_admin());

drop policy if exists "admins ven entrenamientos" on public.workouts;
create policy "admins ven entrenamientos" on public.workouts
  for select using (public.is_admin());

drop policy if exists "admins borran posts" on public.posts;
create policy "admins borran posts" on public.posts
  for delete using (public.is_admin());
