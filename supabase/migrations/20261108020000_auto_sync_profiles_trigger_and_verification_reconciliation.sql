-- ============================================================================
-- Migration: 20261108020000_auto_sync_profiles_trigger_and_verification_reconciliation.sql
-- Description:
-- 1. Ensure public.handle_new_user() automatically populates public.profiles
--    safely on user creation in auth.users without failing on duplicate handles.
-- 2. Bind on_auth_user_created trigger on auth.users for real-time synchronization.
-- 3. Provide public.sync_missing_profiles() RPC for self-healing administrative sync.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_display_name TEXT;
  v_efootball_id TEXT;
  v_efootball_verified BOOLEAN;
  v_efootball_status TEXT;
  v_whatsapp_number TEXT;
  v_whatsapp_verified BOOLEAN;
  v_whatsapp_status TEXT;
  v_duplicate_efootball BOOLEAN := FALSE;
BEGIN
  v_display_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'Player');
  v_efootball_id := COALESCE(NEW.raw_user_meta_data->>'efootball_id', '');
  v_efootball_verified := COALESCE((NEW.raw_user_meta_data->>'efootball_id_verified')::boolean, false);
  v_efootball_status := COALESCE(NEW.raw_user_meta_data->>'efootball_verification_status', 'pending');
  v_whatsapp_number := COALESCE(NEW.raw_user_meta_data->>'whatsapp_number', '');
  v_whatsapp_verified := COALESCE((NEW.raw_user_meta_data->>'whatsapp_verified')::boolean, false);
  v_whatsapp_status := COALESCE(NEW.raw_user_meta_data->>'whatsapp_verification_status', 'pending');

  IF v_efootball_id != '' THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE efootball_id = v_efootball_id AND id != NEW.id) THEN
      v_duplicate_efootball := TRUE;
      v_efootball_status := 'rejected';
    END IF;
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    display_name,
    efootball_id,
    efootball_id_verified,
    efootball_verification_status,
    efootball_rejection_reason,
    whatsapp_number,
    whatsapp_verified,
    whatsapp_verification_status,
    account_status,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_display_name,
    CASE WHEN v_duplicate_efootball THEN '' ELSE v_efootball_id END,
    CASE WHEN v_duplicate_efootball THEN FALSE ELSE v_efootball_verified END,
    v_efootball_status,
    CASE WHEN v_duplicate_efootball THEN 'Duplicate eFootball ID already registered: ' || v_efootball_id ELSE NULL END,
    v_whatsapp_number,
    v_whatsapp_verified,
    v_whatsapp_status,
    'active',
    NEW.created_at,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = CASE WHEN public.profiles.display_name = '' THEN EXCLUDED.display_name ELSE public.profiles.display_name END,
    efootball_id = CASE WHEN public.profiles.efootball_id = '' THEN EXCLUDED.efootball_id ELSE public.profiles.efootball_id END,
    whatsapp_number = CASE WHEN public.profiles.whatsapp_number = '' THEN EXCLUDED.whatsapp_number ELSE public.profiles.whatsapp_number END,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Profile creation trigger failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Enable trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Self-healing administrative RPC to synchronize any orphaned auth.users
CREATE OR REPLACE FUNCTION public.sync_missing_profiles()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH inserted AS (
    INSERT INTO public.profiles (
      id,
      email,
      display_name,
      efootball_id,
      efootball_id_verified,
      efootball_verification_status,
      efootball_rejection_reason,
      whatsapp_number,
      whatsapp_verified,
      whatsapp_verification_status,
      account_status,
      created_at,
      updated_at
    )
    SELECT
      u.id,
      u.email,
      COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Player'),
      CASE 
        WHEN u.raw_user_meta_data->>'efootball_id' IS NOT NULL 
             AND u.raw_user_meta_data->>'efootball_id' != '' 
             AND EXISTS (SELECT 1 FROM public.profiles ep WHERE ep.efootball_id = (u.raw_user_meta_data->>'efootball_id') AND ep.id != u.id)
        THEN ''
        ELSE COALESCE(u.raw_user_meta_data->>'efootball_id', '')
      END,
      CASE
        WHEN u.raw_user_meta_data->>'efootball_id' IS NOT NULL 
             AND u.raw_user_meta_data->>'efootball_id' != '' 
             AND EXISTS (SELECT 1 FROM public.profiles ep WHERE ep.efootball_id = (u.raw_user_meta_data->>'efootball_id') AND ep.id != u.id)
        THEN FALSE
        ELSE COALESCE((u.raw_user_meta_data->>'efootball_id_verified')::boolean, false)
      END,
      CASE
        WHEN u.raw_user_meta_data->>'efootball_id' IS NOT NULL 
             AND u.raw_user_meta_data->>'efootball_id' != '' 
             AND EXISTS (SELECT 1 FROM public.profiles ep WHERE ep.efootball_id = (u.raw_user_meta_data->>'efootball_id') AND ep.id != u.id)
        THEN 'rejected'
        ELSE COALESCE(u.raw_user_meta_data->>'efootball_verification_status', 'pending')
      END,
      CASE
        WHEN u.raw_user_meta_data->>'efootball_id' IS NOT NULL 
             AND u.raw_user_meta_data->>'efootball_id' != '' 
             AND EXISTS (SELECT 1 FROM public.profiles ep WHERE ep.efootball_id = (u.raw_user_meta_data->>'efootball_id') AND ep.id != u.id)
        THEN 'Duplicate eFootball ID already registered: ' || (u.raw_user_meta_data->>'efootball_id')
        ELSE NULL
      END,
      COALESCE(u.raw_user_meta_data->>'whatsapp_number', ''),
      COALESCE((u.raw_user_meta_data->>'whatsapp_verified')::boolean, false),
      COALESCE(u.raw_user_meta_data->>'whatsapp_verification_status', 'pending'),
      'active',
      u.created_at,
      NOW()
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = u.id
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM inserted;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
