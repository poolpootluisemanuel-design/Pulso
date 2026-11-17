-- ============================================================
-- PULSO — migración: modo coach (persona real que da clases)
-- Archivo APARTE. No se toca supabase/schema.sql.
--
-- Cómo aplicarla: en tu proyecto Supabase ve a SQL Editor,
-- pega todo este archivo y pulsa Run. No borra nada que ya
-- exista (usa IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- Qué hace:
-- 1. Añade a profiles tres columnas opcionales:
--      is_coach boolean (¿tiene el modo coach activado?)
--      coach_specialty text (especialidad, texto libre)
--      coach_experience text (experiencia, texto libre)
--    Sin correr esta migración, el modo coach sigue funcionando
--    solo en el teléfono con localStorage (ver src/lib/coachMode.ts):
--    el update a Supabase falla por columna inexistente y se
--    ignora sin romper la app. Con la migración corrida, el flag
--    viaja con la cuenta y se ve en cualquier teléfono.
-- 2. RLS: cada uno edita sus propios campos de coach, con el
--    mismo patrón que "cada quien edita su perfil" de schema.sql
--    (auth.uid() = id). No hace falta nada más: la política
--    "cada quien edita su perfil" (FOR ALL) ya cubre el update
--    propio, esta política solo deja explícito que los campos de
--    coach se editan igual que el resto del perfil propio.
--    La lectura de perfiles ya es pública ("perfiles visibles"),
--    así que otros usuarios pueden ver quién es coach y su
--    especialidad, pero nunca su correo (la app no lo muestra).
-- 3. Índice para listar coaches sin recorrer toda la tabla.
--
-- NO es el entrenador IA: ese no tiene tabla ni columnas, es
-- lógica en src/lib/coach.ts (planes en training_plans).
-- Sin pagos: el modo coach no cobra ni guarda tarjetas.
-- ============================================================

alter table profiles add column if not exists is_coach boolean not null default false;
alter table profiles add column if not exists coach_specialty text;
alter table profiles add column if not exists coach_experience text;

create index if not exists idx_profiles_is_coach on profiles (is_coach) where is_coach = true;

-- Cada quien edita sus propios campos de coach (mismo patrón que
-- "cada quien edita su perfil" en schema.sql). Las políticas
-- permisivas se suman (OR): esta no quita ni cambia la existente.
drop policy if exists "cada quien edita sus campos de coach" on profiles;
create policy "cada quien edita sus campos de coach" on profiles
  for update using (auth.uid() = id);
