-- ============================================================================
-- CREATE SITE_SETTINGS TABLE FOR GLOBAL PLATFORM CONFIGURATIONS
-- Stores dynamic home dashboard banners, platform settings, etc.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.site_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Allow public read access on site_settings
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'site_settings' 
        AND policyname = 'Allow public read access on site_settings'
    ) THEN
        CREATE POLICY "Allow public read access on site_settings"
            ON public.site_settings FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'site_settings' 
        AND policyname = 'Allow authenticated admin full access on site_settings'
    ) THEN
        CREATE POLICY "Allow authenticated admin full access on site_settings"
            ON public.site_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;
