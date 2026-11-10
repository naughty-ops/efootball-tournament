-- Migration: 20261108050000_create_media_assets_table.sql
-- Description: Centralized media assets table for Cloudinary storage metadata and asset tracking

-- 1. Create media_assets table
CREATE TABLE IF NOT EXISTS public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'player_avatar', 
    'tournament_banner', 
    'tournament_thumbnail', 
    'match_evidence', 
    'dispute_evidence', 
    'admin_media'
  )),
  entity_id TEXT,
  cloudinary_public_id TEXT NOT NULL UNIQUE,
  secure_url TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT 'image',
  format TEXT,
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'orphaned', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_media_assets_owner_id ON public.media_assets(owner_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_entity ON public.media_assets(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_status ON public.media_assets(status);
CREATE INDEX IF NOT EXISTS idx_media_assets_visibility ON public.media_assets(visibility);
CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON public.media_assets(created_at DESC);

-- 3. Add cloudinary_public_id to tournaments and profiles for fast asset referencing
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT;

-- 4. Enable Row Level Security
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Media assets public read" ON public.media_assets
  FOR SELECT TO authenticated, anon
  USING (
    visibility = 'public'
    OR is_admin()
    OR owner_id = auth.uid()
  );

CREATE POLICY "Media assets user insert" ON public.media_assets
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR owner_id = auth.uid()
  );

CREATE POLICY "Media assets owner update" ON public.media_assets
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR (owner_id = auth.uid() AND entity_type NOT IN ('match_evidence', 'dispute_evidence'))
  )
  WITH CHECK (
    is_admin()
    OR (owner_id = auth.uid() AND entity_type NOT IN ('match_evidence', 'dispute_evidence'))
  );

CREATE POLICY "Media assets delete policy" ON public.media_assets
  FOR DELETE TO authenticated
  USING (
    is_admin()
    OR (owner_id = auth.uid() AND entity_type NOT IN ('match_evidence', 'dispute_evidence'))
  );
