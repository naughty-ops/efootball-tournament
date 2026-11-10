-- Migration: 20261108060000_create_avatars_table.sql
-- Description: Admin-managed avatar library table and profile avatar_id linking

-- 1. Create avatars table
CREATE TABLE IF NOT EXISTS public.avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  cloudinary_public_id TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add avatar_id to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_id UUID REFERENCES public.avatars(id) ON DELETE SET NULL;

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_avatars_active_order ON public.avatars(is_active, display_order, created_at);
CREATE INDEX IF NOT EXISTS idx_avatars_category ON public.avatars(category);
CREATE INDEX IF NOT EXISTS idx_profiles_avatar_id ON public.profiles(avatar_id);

-- 4. Enable Row Level Security
ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;

-- 5. Granular RLS Policies
DROP POLICY IF EXISTS "Avatars read policy" ON public.avatars;
CREATE POLICY "Avatars read policy" ON public.avatars
  FOR SELECT TO authenticated, anon
  USING (
    is_active = true
    OR is_admin()
  );

DROP POLICY IF EXISTS "Avatars admin insert policy" ON public.avatars;
CREATE POLICY "Avatars admin insert policy" ON public.avatars
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
  );

DROP POLICY IF EXISTS "Avatars admin update policy" ON public.avatars;
CREATE POLICY "Avatars admin update policy" ON public.avatars
  FOR UPDATE TO authenticated
  USING (
    is_admin()
  )
  WITH CHECK (
    is_admin()
  );

DROP POLICY IF EXISTS "Avatars admin delete policy" ON public.avatars;
CREATE POLICY "Avatars admin delete policy" ON public.avatars
  FOR DELETE TO authenticated
  USING (
    is_admin()
  );

-- 6. Seed initial official platform avatars
INSERT INTO public.avatars (name, image_url, category, is_active, display_order)
VALUES
  ('eFootball Competitor', '/avatars/default-avatar.svg', 'General', true, 1),
  ('Golden Champion', '/avatars/legend-gold.svg', 'Legends', true, 2),
  ('Crimson Striker', '/avatars/striker-crimson.svg', 'Strikers', true, 3),
  ('Cyan Playmaker', '/avatars/tactician-cyan.svg', 'Tacticians', true, 4),
  ('Emerald Maestro', '/avatars/maestro-emerald.svg', 'Midfield', true, 5),
  ('Shadow Guardian', '/avatars/guardian-purple.svg', 'Defense', true, 6)
ON CONFLICT DO NOTHING;
