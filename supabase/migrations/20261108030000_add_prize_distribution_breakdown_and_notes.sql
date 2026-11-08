-- ============================================================================
-- Migration: 20261108030000_add_prize_distribution_breakdown_and_notes.sql
-- Description:
-- Adds customizable prize distribution breakdown and additional prize notes for:
-- 1st Place (Champion) prize + additional notes / perks
-- 2nd Place (Runner-Up) prize + additional notes / perks
-- 3rd Place (Optional) prize + additional notes / perks
-- ============================================================================

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS first_place_prize_paise BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_place_notes TEXT,
  ADD COLUMN IF NOT EXISTS second_place_prize_paise BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS second_place_notes TEXT,
  ADD COLUMN IF NOT EXISTS third_place_prize_paise BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS third_place_notes TEXT,
  ADD COLUMN IF NOT EXISTS third_place_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prize_distribution JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tournaments.first_place_prize_paise IS 'Prize money in paise awarded to 1st place champion';
COMMENT ON COLUMN public.tournaments.first_place_notes IS 'Additional notes or physical/in-game prizes awarded to 1st place (e.g. Official Trophy, Jersey, Coins)';
COMMENT ON COLUMN public.tournaments.second_place_prize_paise IS 'Prize money in paise awarded to 2nd place runner-up';
COMMENT ON COLUMN public.tournaments.second_place_notes IS 'Additional notes or physical/in-game prizes awarded to 2nd place (e.g. Silver Medal)';
COMMENT ON COLUMN public.tournaments.third_place_prize_paise IS 'Prize money in paise awarded to 3rd place (optional)';
COMMENT ON COLUMN public.tournaments.third_place_notes IS 'Additional notes or physical/in-game prizes awarded to 3rd place (optional, e.g. Bronze Medal)';
