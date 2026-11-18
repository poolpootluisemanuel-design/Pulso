-- ============================================================
-- PULSO — retos y negocios solo los crea el admin
-- (arreglo de la auditoría 2026-11-18, ítem 4 🟠)
-- Archivo APARTE: NO se toca schema.sql.
-- Cómo usarlo: en tu proyecto Supabase ve a SQL Editor, pega
-- todo este archivo y pulsa Run. No borra nada que ya exista.
--
-- PROBLEMA QUE ARREGLA: "retos crear" y "negocios crear" eran
-- `for insert with check (auth.uid() is not null)`: cualquier
-- usuario autenticado podía crear retos y negocios basura, y
-- como no existía ninguna política de update ni delete, NADIE
-- (ni el admin) podía borrarlos después.
--
-- SOLUCIÓN: crear, editar y borrar retos y negocios solo lo
-- puede hacer un admin. La lectura sigue siendo pública.
-- Requiere: migration_admin_flags.sql (función public.is_admin()).
-- ============================================================

-- Retos: solo admin crea, edita y borra.
drop policy if exists "retos crear" on public.challenges;
drop policy if exists "admins gestionan retos" on public.challenges;
create policy "admins gestionan retos" on public.challenges
  for all using (public.is_admin())
  with check (public.is_admin());

-- Negocios: solo admin crea, edita y borra.
drop policy if exists "negocios crear" on public.businesses;
drop policy if exists "admins gestionan negocios" on public.businesses;
create policy "admins gestionan negocios" on public.businesses
  for all using (public.is_admin())
  with check (public.is_admin());

-- NOTA: los retos que ya existen no se borran; si alguno es
-- basura, el admin ya puede eliminarlo desde el SQL Editor
-- (delete from challenges where id = '...') o desde el panel
-- cuando la app tenga el botón.
