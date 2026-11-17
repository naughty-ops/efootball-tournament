-- ==============================================================================
-- Migration: 20261118070000_update_the_20_20_financial_terms.sql
-- Description: Update THE 20-20 tournament financial terms:
--              Entry fee: ₹40 (4000 paise)
--              1st place prize: ₹500 (50000 paise)
--              2nd place prize: ₹200 (20000 paise)
--              Total prize pool: ₹700 (70000 paise)
-- ==============================================================================

ALTER TABLE public.tournaments DISABLE TRIGGER trg_lock_tournament_financial_terms;

UPDATE public.tournaments
SET is_paid = true,
    entry_fee_paise = 4000,
    currency = 'INR',
    prize_pool_paise = 70000,
    first_place_prize_paise = 50000,
    second_place_prize_paise = 20000,
    third_place_prize_paise = 0,
    prize_distribution = '{"first": {"paise": 50000, "inr": 500}, "second": {"paise": 20000, "inr": 200}}'::jsonb,
    updated_at = NOW()
WHERE id = '3074f4b2-e68f-4a9a-a9d3-1797e4db3088';

ALTER TABLE public.tournaments ENABLE TRIGGER trg_lock_tournament_financial_terms;
