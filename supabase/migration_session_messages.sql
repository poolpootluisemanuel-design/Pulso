-- ============================================================
-- PULSO — chat dentro de las sesiones (session_messages)
-- Archivo APARTE: NO se toca schema.sql.
-- Cómo usarlo: en tu proyecto Supabase ve a SQL Editor, pega
-- todo este archivo y pulsa Run. No borra nada que ya exista
-- (usa IF NOT EXISTS). Sin correrlo, el chat solo funciona en
-- modo local (cada teléfono ve solo sus mensajes).
-- Realtime: la última línea mete la tabla en la publicación de
-- Realtime, para que los mensajes lleguen en vivo sin recargar.
-- Si Realtime no llega, la app hace polling cada 5 s (ver
-- src/lib/sessionChat.ts), así que el chat funciona igual.
-- ============================================================

create table if not exists session_messages (
  id text primary key,
  session_id text not null references sessions(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  author_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_session_messages_session_created
  on session_messages(session_id, created_at);

-- ============================================================
-- Seguridad (Row Level Security): leer lo puede cualquiera
-- (las sesiones son públicas para encontrar compañero), pero
-- escribir solo quien entró con su cuenta y pone su propio id.
-- ============================================================
alter table session_messages enable row level security;

drop policy if exists "mensajes visibles" on session_messages;
create policy "mensajes visibles" on session_messages
  for select using (true);

drop policy if exists "mensajes propios" on session_messages;
create policy "mensajes propios" on session_messages
  for insert with check (auth.uid() = profile_id);

-- Realtime en vivo (INSERT). Si ya estaba agregada, no falla.
do $$
begin
  alter publication supabase_realtime add table session_messages;
exception when duplicate_object then
  null;
end $$;
