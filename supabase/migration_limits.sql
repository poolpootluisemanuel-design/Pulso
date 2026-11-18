-- ============================================================
-- PULSO — límites de tamaño en publicaciones y sesiones
-- (arreglo de la auditoría 2026-11-18, ítem 7 🟡)
-- Archivo APARTE: NO se toca schema.sql.
-- Cómo usarlo: en tu proyecto Supabase ve a SQL Editor, pega
-- todo este archivo y pulsa Run. No borra nada que ya exista.
--
-- PROBLEMA QUE ARREGLA: un usuario podía publicar un post de
-- 1 MB o crear sesiones con títulos gigantes o cupo de 10.000.
-- La app ya valida estos límites (src/lib/store.ts), pero la
-- base no los exigía: por API se podían saltar.
--
-- NOTA: la fecha de la sesión (que no sea pasada) solo se valida
-- en la app: Postgres no permite usar la fecha de hoy en un
-- CHECK (no es una función inmutable).
-- ============================================================

-- Posts: máximo 1000 caracteres.
alter table public.posts
  drop constraint if exists posts_text_max;
alter table public.posts
  add constraint posts_text_max check (char_length(text) <= 1000);

-- Sesiones: título 80, lugar 100, cupo entre 2 y 50.
alter table public.sessions
  drop constraint if exists sessions_title_max;
alter table public.sessions
  add constraint sessions_title_max check (char_length(title) <= 80);

alter table public.sessions
  drop constraint if exists sessions_place_max;
alter table public.sessions
  add constraint sessions_place_max check (char_length(place) <= 100);

alter table public.sessions
  drop constraint if exists sessions_capacity_range;
alter table public.sessions
  add constraint sessions_capacity_range check (capacity between 2 and 50);
