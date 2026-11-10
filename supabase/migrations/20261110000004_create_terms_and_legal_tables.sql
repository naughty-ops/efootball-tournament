-- Migration: Create terms_versions and terms_acceptances tables
-- Description: Legal compliance, Terms & Conditions versioning, and user acceptance tracking

CREATE TABLE IF NOT EXISTS public.terms_versions (
  id text PRIMARY KEY,
  version_label text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  published_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version text NOT NULL REFERENCES public.terms_versions(id) ON DELETE CASCADE,
  ip_address text,
  user_agent text,
  accepted_at timestamptz DEFAULT now(),
  CONSTRAINT unique_user_terms_version UNIQUE (user_id, terms_version)
);

ALTER TABLE public.terms_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'terms_versions' AND policyname = 'terms_versions_read_all'
  ) THEN
    CREATE POLICY terms_versions_read_all ON public.terms_versions FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'terms_acceptances' AND policyname = 'terms_acceptances_read_policy'
  ) THEN
    CREATE POLICY terms_acceptances_read_policy ON public.terms_acceptances
      FOR SELECT
      USING (
        user_id = auth.uid() OR
        has_admin_role('moderator'::admin_role)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'terms_acceptances' AND policyname = 'terms_acceptances_insert_policy'
  ) THEN
    CREATE POLICY terms_acceptances_insert_policy ON public.terms_acceptances
      FOR INSERT
      WITH CHECK (
        user_id = auth.uid()
      );
  END IF;
END $$;

INSERT INTO public.terms_versions (id, version_label, title, content, is_active)
VALUES (
  'v1.0',
  '1.0',
  'Official eFootball Tournament Platform Terms & Conditions',
  'Comprehensive 15-Clause Competitive Esports Agreement',
  true
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  is_active = EXCLUDED.is_active;
