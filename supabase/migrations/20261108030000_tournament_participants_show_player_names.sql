-- Migration: 20261108030000_tournament_participants_show_player_names.sql
-- Ensure tournament participants show only player names, never raw eFootball IDs

-- 1. Recreate tournament_participants_public view with player display names
CREATE OR REPLACE VIEW public.tournament_participants_public WITH (security_invoker = false) AS
SELECT
  p.id,
  p.tournament_id,
  COALESCE(NULLIF(TRIM(pr.display_name), ''), NULLIF(TRIM(p.real_name), ''), p.username) AS username,
  COALESCE(NULLIF(TRIM(pr.display_name), ''), NULLIF(TRIM(p.real_name), ''), p.username) AS real_name,
  p.seed_number,
  p.status,
  p.created_at,
  p.updated_at
FROM public.participants p
JOIN public.tournaments t ON t.id = p.tournament_id
LEFT JOIN public.profiles pr ON pr.id = p.user_id
WHERE t.status IN ('registration', 'ongoing', 'completed')
  AND p.status IN ('active', 'eliminated')
  AND COALESCE(t.is_private, FALSE) = FALSE;

GRANT SELECT ON public.tournament_participants_public TO anon, authenticated;

-- 2. Update admin_approve_manual_registration to store display name as username
CREATE OR REPLACE FUNCTION public.admin_approve_manual_registration(
  p_registration_id uuid,
  p_verified_amount_paise bigint DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_reg RECORD;
  v_tournament RECORD;
  v_profile RECORD;
  v_current_participants integer;
  v_existing_part_id uuid;
  v_new_part_id uuid;
  v_username text;
  v_real_name text;
  v_contact text;
  v_verified_amount bigint;
BEGIN
  -- RBAC check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
  END IF;

  -- Lock registration row
  SELECT * INTO v_reg 
  FROM public.tournament_registrations 
  WHERE id = p_registration_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration request % not found', p_registration_id;
  END IF;

  -- Guard against approving already confirmed / cancelled
  IF v_reg.status IN ('approved', 'confirmed') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Registration is already approved.'
    );
  END IF;

  IF v_reg.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Cannot approve a cancelled registration.'
    );
  END IF;

  -- Lock tournament row & verify capacity
  SELECT * INTO v_tournament 
  FROM public.tournaments 
  WHERE id = v_reg.tournament_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament % not found', v_reg.tournament_id;
  END IF;

  SELECT count(*) INTO v_current_participants 
  FROM public.participants 
  WHERE tournament_id = v_reg.tournament_id;

  IF v_current_participants >= v_tournament.max_participants THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Tournament is full (' || v_tournament.max_participants || ' slots). Cannot approve registration.'
    );
  END IF;

  v_verified_amount := COALESCE(p_verified_amount_paise, v_reg.amount_paise);

  -- Check if participant row already exists for this user
  SELECT id INTO v_existing_part_id 
  FROM public.participants 
  WHERE tournament_id = v_reg.tournament_id 
    AND user_id = v_reg.user_id;

  IF v_existing_part_id IS NOT NULL THEN
    UPDATE public.tournament_registrations
    SET status = 'approved',
        participant_id = v_existing_part_id,
        verified_by = auth.uid(),
        verified_at = now(),
        approved_at = now(),
        confirmed_at = now(),
        verified_amount_paise = v_verified_amount,
        notes = COALESCE(p_note, notes),
        updated_at = now()
    WHERE id = p_registration_id;

    RETURN jsonb_build_object(
      'success', true, 
      'participant_id', v_existing_part_id, 
      'message', 'User was already registered; registration marked approved.'
    );
  END IF;

  -- Fetch player profile
  SELECT * INTO v_profile 
  FROM public.profiles 
  WHERE id = v_reg.user_id;

  -- Prefer player's real name / display name for tournament rosters, not eFootball ID
  v_username := COALESCE(
    NULLIF(TRIM(v_profile.display_name), ''),
    NULLIF(TRIM(v_profile.efootball_id), ''),
    'Player'
  );
  v_real_name := v_username;
  v_contact := COALESCE(NULLIF(TRIM(v_profile.whatsapp_number), ''), NULL);

  -- Insert confirmed participant
  INSERT INTO public.participants (
    tournament_id,
    user_id,
    username,
    real_name,
    contact_info,
    status,
    terms_accepted,
    terms_accepted_at,
    rules_version,
    created_at,
    updated_at
  ) VALUES (
    v_reg.tournament_id,
    v_reg.user_id,
    v_username,
    v_real_name,
    v_contact,
    'active',
    true,
    now(),
    COALESCE(v_reg.rules_version, '1.0'),
    now(),
    now()
  ) RETURNING id INTO v_new_part_id;

  -- Update registration to approved
  UPDATE public.tournament_registrations
  SET status = 'approved',
      participant_id = v_new_part_id,
      verified_by = auth.uid(),
      verified_at = now(),
      approved_at = now(),
      confirmed_at = now(),
      verified_amount_paise = v_verified_amount,
      notes = COALESCE(p_note, notes),
      updated_at = now()
  WHERE id = p_registration_id;

  RETURN jsonb_build_object(
    'success', true, 
    'participant_id', v_new_part_id, 
    'message', 'Registration approved and participant confirmed successfully.'
  );
END;
$function$;
