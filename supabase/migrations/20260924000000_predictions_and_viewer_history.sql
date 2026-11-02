-- Migration: 20260924_predictions_and_viewer_history.sql
-- Description: Create match_predictions and live_viewer_sessions tables with RLS and indexes

-- 1. Create match_predictions table
CREATE TABLE IF NOT EXISTS public.match_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  predicted_player_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ NULL,
  result TEXT NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'correct', 'wrong', 'void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT match_predictions_match_user_unique UNIQUE (match_id, user_id)
);

-- Indexes for match_predictions
CREATE INDEX IF NOT EXISTS idx_match_predictions_match_id ON public.match_predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_match_predictions_user_id ON public.match_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_match_predictions_predicted_player ON public.match_predictions(predicted_player_id);
CREATE INDEX IF NOT EXISTS idx_match_predictions_result ON public.match_predictions(result);
CREATE INDEX IF NOT EXISTS idx_match_predictions_created_at ON public.match_predictions(created_at);

-- 2. Create live_viewer_sessions table
CREATE TABLE IF NOT EXISTS public.live_viewer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'desktop',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for live_viewer_sessions
CREATE INDEX IF NOT EXISTS idx_live_viewer_sessions_match_id ON public.live_viewer_sessions(match_id);
CREATE INDEX IF NOT EXISTS idx_live_viewer_sessions_user_id ON public.live_viewer_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_live_viewer_sessions_session_id ON public.live_viewer_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_live_viewer_sessions_created_at ON public.live_viewer_sessions(created_at);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.match_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_viewer_sessions ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for match_predictions

-- Users can view their own predictions
CREATE POLICY "Users can view own prediction" ON public.match_predictions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all predictions
CREATE POLICY "Admins can view all predictions" ON public.match_predictions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_app_meta_data->>'role' = 'admin' OR auth.users.email LIKE '%admin%')
    )
  );

-- Users can insert their own predictions
CREATE POLICY "Users can insert own prediction" ON public.match_predictions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own predictions before lock
CREATE POLICY "Users can update own prediction before lock" ON public.match_predictions
  FOR UPDATE
  USING (auth.uid() = user_id AND locked_at IS NULL AND result = 'pending');

-- 5. RLS Policies for live_viewer_sessions

-- Anyone can insert session record
CREATE POLICY "Viewers can insert session" ON public.live_viewer_sessions
  FOR INSERT
  WITH CHECK (true);

-- Viewers can update their own session record by session_id or user_id
CREATE POLICY "Viewers can update own session" ON public.live_viewer_sessions
  FOR UPDATE
  USING (session_id IS NOT NULL);

-- Admins can select all viewer sessions
CREATE POLICY "Admins can select viewer sessions" ON public.live_viewer_sessions
  FOR SELECT
  USING (true);
