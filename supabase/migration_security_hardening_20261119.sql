-- PULSO security hardening
-- Applied to production Supabase project: cyndymjafbrckkrgpumn

CREATE OR REPLACE FUNCTION public.join_session(p_session_id text, p_profile_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_capacity int;
  v_confirmed int;
  v_existing text;
  v_id text;
BEGIN
  IF auth.uid() IS NULL OR p_profile_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Debes iniciar sesión y solo puedes apuntarte a ti mismo.';
  END IF;

  SELECT capacity INTO v_capacity FROM public.sessions
  WHERE id = p_session_id FOR UPDATE;

  IF v_capacity IS NULL THEN
    RAISE EXCEPTION 'La sesión no existe.';
  END IF;

  SELECT status INTO v_existing FROM public.rsvps
  WHERE session_id = p_session_id AND profile_id = p_profile_id;

  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT count(*) INTO v_confirmed FROM public.rsvps
  WHERE session_id = p_session_id AND status = 'confirmed';

  v_id := 'rsvp-' || gen_random_uuid()::text;

  IF v_confirmed < v_capacity THEN
    INSERT INTO public.rsvps (id, session_id, profile_id, status)
    VALUES (v_id, p_session_id, p_profile_id, 'confirmed');
    RETURN 'confirmed';
  ELSE
    INSERT INTO public.rsvps (id, session_id, profile_id, status)
    VALUES (v_id, p_session_id, p_profile_id, 'waitlist');
    RETURN 'waitlist';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.join_session(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_session(text, uuid) TO authenticated;

DROP POLICY IF EXISTS "session_messages_insert_authenticated"
ON public.session_messages;

REVOKE ALL PRIVILEGES ON TABLE public.profiles_public FROM anon, authenticated;
GRANT SELECT ON TABLE public.profiles_public TO anon, authenticated;
