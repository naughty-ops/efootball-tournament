-- Migration: 20261102000000_create_homepage_cms_tables.sql
-- Description: Create homepage CMS tables (homepage_sections, homepage_audit_history) with strict RLS and default initial seed content

CREATE TABLE IF NOT EXISTS public.homepage_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT NOT NULL UNIQUE,
  section_name TEXT NOT NULL,
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_visible_desktop BOOLEAN NOT NULL DEFAULT true,
  is_visible_mobile BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  draft_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_homepage_sections_key ON public.homepage_sections(section_key);
CREATE INDEX IF NOT EXISTS idx_homepage_sections_order ON public.homepage_sections(display_order);
CREATE INDEX IF NOT EXISTS idx_homepage_sections_status ON public.homepage_sections(status, is_enabled);

CREATE TABLE IF NOT EXISTS public.homepage_audit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID REFERENCES public.homepage_sections(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'draft_saved', 'published', 'visibility_toggled', 'reordered', 'reverted')),
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_email TEXT,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_homepage_audit_section ON public.homepage_audit_history(section_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_audit_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'homepage_sections' AND policyname = 'Public can view published homepage sections'
  ) THEN
    CREATE POLICY "Public can view published homepage sections"
      ON public.homepage_sections
      FOR SELECT
      TO anon, authenticated
      USING (is_enabled = true AND status = 'published');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'homepage_sections' AND policyname = 'Admins have full access to homepage sections'
  ) THEN
    CREATE POLICY "Admins have full access to homepage sections"
      ON public.homepage_sections
      FOR ALL
      TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'homepage_audit_history' AND policyname = 'Admins can view homepage audit history'
  ) THEN
    CREATE POLICY "Admins can view homepage audit history"
      ON public.homepage_audit_history
      FOR SELECT
      TO authenticated
      USING (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'homepage_audit_history' AND policyname = 'Admins can insert homepage audit history'
  ) THEN
    CREATE POLICY "Admins can insert homepage audit history"
      ON public.homepage_audit_history
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Seed the initial 11 homepage sections with verified fallback defaults
INSERT INTO public.homepage_sections (
  section_key,
  section_name,
  description,
  display_order,
  is_enabled,
  is_visible_desktop,
  is_visible_mobile,
  status,
  draft_content,
  published_content,
  last_published_at
)
VALUES
(
  'navbar',
  'Header Navigation',
  'Primary website navigation bar, brand logo, links, and action buttons.',
  1,
  true,
  true,
  true,
  'published',
  '{
    "brand_title": "eFootball Tournament",
    "badge_text": "Season 2026",
    "nav_links": [
      {"label": "Tournaments", "href": "/tournaments"},
      {"label": "Live Arena", "href": "/live"},
      {"label": "About", "href": "/about"}
    ]
  }'::jsonb,
  '{
    "brand_title": "eFootball Tournament",
    "badge_text": "Season 2026",
    "nav_links": [
      {"label": "Tournaments", "href": "/tournaments"},
      {"label": "Live Arena", "href": "/live"},
      {"label": "About", "href": "/about"}
    ]
  }'::jsonb,
  NOW()
),
(
  'announcements',
  'Top Announcement Banner',
  'Sticky or top announcement ribbon highlighting active seasons, tournament registrations, and notices.',
  2,
  true,
  true,
  true,
  'published',
  '{
    "badge_text": "SEASON 2026",
    "headline": "Kerala eFootball Championship Open: Register your eFootball ID today to compete for the trophy!",
    "cta_label": "Register Now",
    "cta_url": "/tournaments?status=registration"
  }'::jsonb,
  '{
    "badge_text": "SEASON 2026",
    "headline": "Kerala eFootball Championship Open: Register your eFootball ID today to compete for the trophy!",
    "cta_label": "Register Now",
    "cta_url": "/tournaments?status=registration"
  }'::jsonb,
  NOW()
),
(
  'hero_banner',
  'Hero Arena Banner',
  'The main hero headline "THE PITCH IS OURS", subtitle, primary/secondary action buttons, and stadium showcase visual.',
  3,
  true,
  true,
  true,
  'published',
  '{
    "tagline": "OFFICIAL COMPETITIVE ARENA",
    "title_main": "THE PITCH",
    "title_highlight": "IS OURS",
    "subtitle": "Konami eFootball official tournament platform. Elevating on-field esports realism to all-new levels as players compete in automated group stages, real-time live streaming, and high-stakes knockout brackets.",
    "primary_button_label": "Join Tournaments",
    "primary_button_url": "/tournaments",
    "secondary_button_label": "Watch Arena",
    "secondary_button_url": "/live",
    "stadium_badge": "HOT TOURNAMENT",
    "stadium_title": "SEASON 3 ARENA",
    "stadium_subtitle": "eFootball 2026",
    "stadium_image": "/images/banners/efootball-stadium.jpg",
    "subcards": [
      {"title": "Elevate Excitement", "tag": "SEASON 2", "image": "/images/banner1.jpg", "url": "/tournaments"},
      {"title": "Official Match Pass", "tag": "PRO TOURNAMENTS", "image": "/images/banner2.jpg", "url": "/tournaments"}
    ]
  }'::jsonb,
  '{
    "tagline": "OFFICIAL COMPETITIVE ARENA",
    "title_main": "THE PITCH",
    "title_highlight": "IS OURS",
    "subtitle": "Konami eFootball official tournament platform. Elevating on-field esports realism to all-new levels as players compete in automated group stages, real-time live streaming, and high-stakes knockout brackets.",
    "primary_button_label": "Join Tournaments",
    "primary_button_url": "/tournaments",
    "secondary_button_label": "Watch Arena",
    "secondary_button_url": "/live",
    "stadium_badge": "HOT TOURNAMENT",
    "stadium_title": "SEASON 3 ARENA",
    "stadium_subtitle": "eFootball 2026",
    "stadium_image": "/images/banners/efootball-stadium.jpg",
    "subcards": [
      {"title": "Elevate Excitement", "tag": "SEASON 2", "image": "/images/banner1.jpg", "url": "/tournaments"},
      {"title": "Official Match Pass", "tag": "PRO TOURNAMENTS", "image": "/images/banner2.jpg", "url": "/tournaments"}
    ]
  }'::jsonb,
  NOW()
),
(
  'featured_tournament',
  'Featured Spotlight Competition',
  'Spotlight competition card embedded in the hero arena with artwork, badge, and direct rules/join link.',
  4,
  true,
  true,
  true,
  'published',
  '{
    "tag": "FEATURED COMPETITION",
    "title": "Kerala eFootball Masters",
    "badge": "STAGE 1",
    "image": "/images/banners/efootball-championship.jpg",
    "cta_label": "Special Player List & Rules",
    "cta_url": "/tournaments"
  }'::jsonb,
  '{
    "tag": "FEATURED COMPETITION",
    "title": "Kerala eFootball Masters",
    "badge": "STAGE 1",
    "image": "/images/banners/efootball-championship.jpg",
    "cta_label": "Special Player List & Rules",
    "cta_url": "/tournaments"
  }'::jsonb,
  NOW()
),
(
  'live_matches',
  'Live Broadcasts & Matches',
  'Real-time active fixtures with live stream tags, scores, and direct room links.',
  5,
  true,
  true,
  true,
  'published',
  '{
    "title": "Live Broadcasts",
    "view_all_label": "View All Live",
    "view_all_url": "/live",
    "max_display_count": 3
  }'::jsonb,
  '{
    "title": "Live Broadcasts",
    "view_all_label": "View All Live",
    "view_all_url": "/live",
    "max_display_count": 3
  }'::jsonb,
  NOW()
),
(
  'upcoming_tournaments',
  'Tournament Discovery',
  'Active ongoing tournaments, upcoming registrations, and recently completed tournament champion cards.',
  6,
  true,
  true,
  true,
  'published',
  '{
    "active_title": "Active Tournaments",
    "upcoming_title": "Upcoming",
    "completed_title": "Recent Champions & Completed Tournaments",
    "max_active": 5,
    "max_upcoming": 4,
    "max_completed": 6
  }'::jsonb,
  '{
    "active_title": "Active Tournaments",
    "upcoming_title": "Upcoming",
    "completed_title": "Recent Champions & Completed Tournaments",
    "max_active": 5,
    "max_upcoming": 4,
    "max_completed": 6
  }'::jsonb,
  NOW()
),
(
  'leaderboard',
  'Platform Leaderboard',
  'Rankings and platform leaderboards showcasing top performing eFootball players and win rates.',
  7,
  true,
  true,
  true,
  'published',
  '{
    "title": "Top Ranked Competitors",
    "subtitle": "Track season leaderboard rankings, win streaks, and point standings.",
    "cta_label": "View Full Leaderboard",
    "cta_url": "/leaderboard"
  }'::jsonb,
  '{
    "title": "Top Ranked Competitors",
    "subtitle": "Track season leaderboard rankings, win streaks, and point standings.",
    "cta_label": "View Full Leaderboard",
    "cta_url": "/leaderboard"
  }'::jsonb,
  NOW()
),
(
  'featured_players',
  'Hall of Fame & Featured Players',
  'Highlighting top competitors, past champions, and MVP players across all divisions.',
  8,
  true,
  true,
  true,
  'published',
  '{
    "title": "Hall of Fame",
    "subtitle": "Honoring the reigning champions and most valuable players of the Kerala eFootball circuit.",
    "cta_label": "Explore Hall of Fame",
    "cta_url": "/tournaments?status=completed"
  }'::jsonb,
  '{
    "title": "Hall of Fame",
    "subtitle": "Honoring the reigning champions and most valuable players of the Kerala eFootball circuit.",
    "cta_label": "Explore Hall of Fame",
    "cta_url": "/tournaments?status=completed"
  }'::jsonb,
  NOW()
),
(
  'platform_statistics',
  'Platform Statistics',
  'Platform metrics and numbers (total tournaments hosted, matches played, registered athletes, community reach).',
  9,
  true,
  true,
  true,
  'published',
  '{
    "stats": [
      {"label": "Tournaments Hosted", "value": "50+"},
      {"label": "Competitive Matches", "value": "1,200+"},
      {"label": "Verified Players", "value": "500+"},
      {"label": "Active Community", "value": "2,500+"}
    ]
  }'::jsonb,
  '{
    "stats": [
      {"label": "Tournaments Hosted", "value": "50+"},
      {"label": "Competitive Matches", "value": "1,200+"},
      {"label": "Verified Players", "value": "500+"},
      {"label": "Active Community", "value": "2,500+"}
    ]
  }'::jsonb,
  NOW()
),
(
  'sponsors',
  'Sponsors & Brand Partners',
  'Official partners, sponsors, and community affiliates showcasing brand logos and endorsements.',
  10,
  true,
  true,
  true,
  'published',
  '{
    "title": "Official Partners & Community Supporters",
    "sponsors": []
  }'::jsonb,
  '{
    "title": "Official Partners & Community Supporters",
    "sponsors": []
  }'::jsonb,
  NOW()
),
(
  'footer',
  'Footer & Community',
  'Public footer with branding, social links, legal notices, and quick navigation.',
  11,
  true,
  true,
  true,
  'published',
  '{
    "copyright": "© 2026 eFootball Tournament Arena. All rights reserved.",
    "discord_url": "https://discord.gg",
    "whatsapp_url": "https://chat.whatsapp.com",
    "instagram_url": "https://instagram.com"
  }'::jsonb,
  '{
    "copyright": "© 2026 eFootball Tournament Arena. All rights reserved.",
    "discord_url": "https://discord.gg",
    "whatsapp_url": "https://chat.whatsapp.com",
    "instagram_url": "https://instagram.com"
  }'::jsonb,
  NOW()
)
ON CONFLICT (section_key) DO UPDATE SET
  section_name = EXCLUDED.section_name,
  description = EXCLUDED.description,
  updated_at = NOW();
