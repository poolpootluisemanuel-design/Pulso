-- ============================================================
-- PULSO — moderación del chat de sesiones
-- (arreglo de la auditoría 2026-11-18, ítem 3 🟠)
-- Archivo APARTE: NO se toca schema.sql ni la migración
-- original del chat (migration_session_messages.sql).
-- Cómo usarlo: en tu proyecto Supabase ve a SQL Editor, pega
-- todo este archivo y pulsa Run. No borra nada que ya exista.
--
-- PROBLEMA QUE ARREGLA: el insert del chat solo exigía
-- `auth.uid() = profile_id`: cualquiera con cuenta podía escribir
-- en CUALQUIER sesión sin ser participante, con cualquier
-- author_name (suplantación), y no existía forma de borrar un
-- mensaje abusivo (no había política DELETE).
--
-- SOLUCIÓN: el servidor exige ser participante confirmado o
-- anfitrión para escribir, fija author_name desde el perfil
-- (el cliente ya no lo decide), y el autor o un admin pueden
-- borrar mensajes.
-- Requiere: migration_admin_flags.sql (función public.is_admin()).
--
-- NOTA DE TIPOS (ERROR 42883 corregido 2026-11-18): las
-- comparaciones con auth.uid() y con session_id llevan cast
-- explícito a ::text en AMBOS lados. En el archivo schema.sql
-- profile_id/host_id son uuid y session_id es text, pero la base
-- real difiere en alguna de esas columnas y Postgres rechazaba
-- la comparación text = uuid. Con ::text en ambos lados la
-- comparación funciona sea cual sea el tipo real de la columna
-- (el texto canónico de un uuid es el mismo en ambos lados).
-- ============================================================

-- Escribir solo si eres participante confirmado o el anfitrión.
drop policy if exists "mensajes propios" on public.session_messages;
drop policy if exists "mensajes de participantes" on public.session_messages;
create policy "mensajes de participantes" on public.session_messages
  for insert with check (
    auth.uid()::text = profile_id::text
    and (
      exists (
        select 1 from public.rsvps r
        where r.session_id::text = session_messages.session_id::text
          and r.profile_id::text = auth.uid()::text
          and r.status = 'confirmed'
      )
      or exists (
        select 1 from public.sessions s
        where s.id::text = session_messages.session_id::text
          and s.host_id::text = auth.uid()::text
      )
    )
  );

-- Borrar: el autor de su propio mensaje, o un admin.
drop policy if exists "borrar mensaje propio" on public.session_messages;
create policy "borrar mensaje propio" on public.session_messages
  for delete using (auth.uid()::text = profile_id::text);

drop policy if exists "admins borran mensajes" on public.session_messages;
create policy "admins borran mensajes" on public.session_messages
  for delete using (public.is_admin());

-- Trigger: el nombre del autor SIEMPRE sale del perfil, nunca del
-- cliente. Así nadie puede escribir con el nombre de otro usuario.
create or replace function public.fix_chat_author_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.author_name := coalesce(
    (select name from public.profiles where id::text = new.profile_id::text),
    'Sin nombre'
  );
  return new;
end;
$$;

drop trigger if exists fix_chat_author_name on public.session_messages;
create trigger fix_chat_author_name
  before insert on public.session_messages
  for each row execute function public.fix_chat_author_name();
