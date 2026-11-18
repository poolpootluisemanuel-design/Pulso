-- ============================================================
-- PULSO — apuntarse a una sesión sin pasarse del cupo
-- (arreglo de la auditoría 2026-11-18, ítem 5 🟡)
-- Archivo APARTE: NO se toca schema.sql.
-- Cómo usarlo: en tu proyecto Supabase ve a SQL Editor, pega
-- todo este archivo y pulsa Run. No borra nada que ya exista.
--
-- PROBLEMA QUE ARREGLA: la app leía los confirmados, contaba
-- en el teléfono y luego insertaba. Si dos personas se apuntaban
-- al mismo tiempo al último lugar, ambas leían "queda 1" y ambas
-- quedaban confirmadas: el cupo se pasaba.
--
-- SOLUCIÓN: una función RPC que hace todo dentro de UNA
-- transacción y con la fila de la sesión bloqueada
-- (SELECT ... FOR UPDATE): nadie más puede apuntarse mientras
-- se cuenta. Devuelve 'confirmed' o 'waitlist'. La app la usa
-- en src/lib/store.ts (joinSession) y si la función aún no
-- existe en la base (migración sin correr), cae al conteo
-- anterior con un aviso.
-- ============================================================

create or replace function public.join_session(
  p_session_id text,
  p_profile_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_confirmed int;
  v_existing text;
  v_id text;
begin
  -- Seguridad: solo te puedes apuntar a ti mismo. Si alguien pasa
  -- el id de otro usuario, se rechaza.
  if p_profile_id <> auth.uid() then
    raise exception 'No puedes apuntar a otro usuario.';
  end if;

  -- Bloquea la sesión: mientras dure esta transacción, otro
  -- intento de apuntarse espera y luego ve el conteo ya actualizado.
  select capacity into v_capacity
  from public.sessions
  where id = p_session_id
  for update;

  if v_capacity is null then
    raise exception 'La sesión no existe.';
  end if;

  -- ¿Ya está apuntado? Devuelve su estado sin duplicar.
  select status into v_existing
  from public.rsvps
  where session_id = p_session_id and profile_id = p_profile_id;

  if v_existing is not null then
    return v_existing;
  end if;

  select count(*) into v_confirmed
  from public.rsvps
  where session_id = p_session_id and status = 'confirmed';

  v_id := 'rsvp-' || gen_random_uuid()::text;

  if v_confirmed < v_capacity then
    insert into public.rsvps (id, session_id, profile_id, status)
    values (v_id, p_session_id, p_profile_id, 'confirmed');
    return 'confirmed';
  else
    insert into public.rsvps (id, session_id, profile_id, status)
    values (v_id, p_session_id, p_profile_id, 'waitlist');
    return 'waitlist';
  end if;
end;
$$;

-- La función la puede llamar cualquier usuario autenticado; por
-- dentro solo inserta su propia fila (comprueba que
-- p_profile_id = auth.uid()) y la política de insert de rsvps
-- sigue existiendo para los inserts directos.
grant execute on function public.join_session(text, uuid) to authenticated;
