-- Migration: Create achievements and player_achievements tables
-- Description: Supports player career badges, achievements unlocking, and RLS

CREATE TABLE IF NOT EXISTS public.achievements (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'milestone',
  badge_icon text NOT NULL,
  points integer NOT NULL DEFAULT 10,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.player_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at timestamptz DEFAULT now(),
  CONSTRAINT player_achievement_unique UNIQUE (player_id, achievement_id)
);

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_achievements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'achievements' AND policyname = 'achievements_read_all'
  ) THEN
    CREATE POLICY achievements_read_all ON public.achievements FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_achievements' AND policyname = 'player_achievements_read_policy'
  ) THEN
    CREATE POLICY player_achievements_read_policy ON public.player_achievements
      FOR SELECT
      USING (
        player_id = auth.uid() OR
        has_admin_role('moderator'::admin_role)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_achievements' AND policyname = 'player_achievements_insert_policy'
  ) THEN
    CREATE POLICY player_achievements_insert_policy ON public.player_achievements
      FOR INSERT
      WITH CHECK (
        player_id = auth.uid() OR
        has_admin_role('moderator'::admin_role)
      );
  END IF;
END $$;

INSERT INTO public.achievements (id, title, description, category, badge_icon, points)
VALUES
  ('first_victory', 'First Victory', 'Win your first official match on the platform.', 'combat', 'Trophy', 10),
  ('tournament_debut', 'Tournament Debut', 'Participate in your first competitive tournament.', 'debut', 'Award', 10),
  ('champion', 'Champion', 'Emerge victorious and lift the trophy as tournament Champion.', 'glory', 'Crown', 50),
  ('runner_up', 'Runner-up', 'Secure second place with a valiant run in a tournament final.', 'glory', 'Medal', 30),
  ('five_wins', 'Five Wins', 'Dominate the field by winning 5 official matches.', 'milestone', 'Flame', 25),
  ('winning_streak', 'Winning Streak', 'Maintain supreme consistency by winning 3 consecutive matches.', 'streak', 'Zap', 30),
  ('veteran_player', 'Veteran Player', 'Show seasoned tournament grit by participating in 5 tournaments.', 'loyalty', 'ShieldCheck', 40)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  badge_icon = EXCLUDED.badge_icon,
  points = EXCLUDED.points;
