-- ============================================================================
-- CREATE ANALYTICS_EVENTS TABLE & INDEXES
-- Tracks privacy-conscious analytics events, page views, and traffic metrics
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  page_path TEXT NOT NULL,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  anonymous_visitor_id TEXT NOT NULL,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  device_type TEXT, -- 'mobile', 'desktop', 'tablet'
  browser TEXT,     -- 'Chrome', 'Safari', 'Edge', 'Firefox', 'Other'
  os TEXT,          -- 'Android', 'iOS', 'Windows', 'macOS', 'Linux', 'Other'
  country TEXT DEFAULT 'India',
  region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Frequently queried indexes
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name ON public.analytics_events (event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_tournament_id ON public.analytics_events (tournament_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_page_path ON public.analytics_events (page_path);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON public.analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_anonymous_visitor_id ON public.analytics_events (anonymous_visitor_id);

-- Enable Row Level Security
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow public/anonymous users to INSERT analytics events (non-blocking tracking)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'analytics_events' 
    AND policyname = 'Allow public insert for analytics events'
  ) THEN
    CREATE POLICY "Allow public insert for analytics events"
      ON public.analytics_events FOR INSERT TO public WITH CHECK (true);
  END IF;

  -- Policy 2: Allow authenticated admins full access (SELECT, UPDATE, DELETE)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'analytics_events' 
    AND policyname = 'Allow authenticated admin full access on analytics_events'
  ) THEN
    CREATE POLICY "Allow authenticated admin full access on analytics_events"
      ON public.analytics_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
