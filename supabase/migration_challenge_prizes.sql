-- ============================================================
-- PULSO — premios de negocios locales en los retos
-- Archivo APARTE: no toca schema.sql. Se corre una sola vez en
-- Supabase → SQL Editor (pegar todo y Run). Es idempotente: se
-- puede correr de nuevo sin duplicar nada ni borrar datos.
--
-- Qué agrega:
--   challenges.prize_text  — texto del premio ("1 clase gratis",
--                            "10% en tu primera visita", ...)
--   challenges.business_id — negocio local que da el premio
--                            (businesses.id). Si el negocio se
--                            borra, el reto queda sin negocio, no se
--                            borra el reto (on delete set null).
-- ============================================================

alter table challenges add column if not exists prize_text text;
alter table challenges add column if not exists business_id text references businesses(id) on delete set null;

create index if not exists idx_challenges_business_id on challenges(business_id);

-- Lectura pública: ya la cubre la política "retos visibles"
-- (select using (true)) de schema.sql. Como store.ts lee retos con
-- select('*'), las columnas nuevas llegan solas a la app sin
-- cambiar store.ts.

-- Escritura del premio: solo admin. No hay columna de creador en
-- challenges, así que "creador" no se puede comprobar en RLS; se usa
-- el mismo patrón de admin que "admins borran sesiones" en
-- schema.sql (perfil con is_admin = true; el dueño ya lo tiene por
-- el UPDATE de schema.sql). La creación de retos sigue como está
-- ("retos crear": cualquier usuario autenticado).
drop policy if exists "admins editan retos" on challenges;
create policy "admins editan retos" on challenges for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin = true)
);

-- Nota: no se agrega política de delete para retos. Si hace falta
-- borrar retos desde la app, se agrega luego con el mismo patrón.
