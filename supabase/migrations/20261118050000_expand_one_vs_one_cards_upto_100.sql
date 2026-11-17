-- Migration: Expand 1v1 Challenge Tier Cards Up To ₹100
-- Timestamp: 2026-11-18 05:00:00

-- Ensure consistent display order for existing cards
UPDATE public.one_vs_one_cards
SET display_order = 1, name = 'Rookie Challenge', entry_amount = 10.00, advertised_payout = 15.00, status = 'active'
WHERE id = 'c8e6aeab-bfa4-4dcb-aa19-538b765c6cfe';

UPDATE public.one_vs_one_cards
SET display_order = 2, name = 'Pro Contender', entry_amount = 15.00, advertised_payout = 25.00, status = 'active'
WHERE id = 'beaab313-b938-4d7c-99b6-a2363a439296';

UPDATE public.one_vs_one_cards
SET display_order = 4, name = 'Champions Arena', entry_amount = 25.00, advertised_payout = 42.00, status = 'active'
WHERE id = 'e1e9f309-2ba1-47da-835a-d4b35a2945e4';

UPDATE public.one_vs_one_cards
SET display_order = 5, name = 'Master League', entry_amount = 30.00, advertised_payout = 50.00, status = 'active'
WHERE id = 'a79111b4-0ecf-4f99-8f9b-0c7f14607e83';

-- Insert new tiers up to ₹100
INSERT INTO public.one_vs_one_cards (name, entry_amount, advertised_payout, status, display_order, max_concurrent_matches, max_daily_matches)
SELECT 'Challenger Striker', 20.00, 34.00, 'active', 3, 100, 500
WHERE NOT EXISTS (SELECT 1 FROM public.one_vs_one_cards WHERE entry_amount = 20.00);

INSERT INTO public.one_vs_one_cards (name, entry_amount, advertised_payout, status, display_order, max_concurrent_matches, max_daily_matches)
SELECT 'Apex Gladiator', 40.00, 70.00, 'active', 6, 100, 500
WHERE NOT EXISTS (SELECT 1 FROM public.one_vs_one_cards WHERE entry_amount = 40.00);

INSERT INTO public.one_vs_one_cards (name, entry_amount, advertised_payout, status, display_order, max_concurrent_matches, max_daily_matches)
SELECT 'Legendary Arena', 50.00, 90.00, 'active', 7, 100, 500
WHERE NOT EXISTS (SELECT 1 FROM public.one_vs_one_cards WHERE entry_amount = 50.00);

INSERT INTO public.one_vs_one_cards (name, entry_amount, advertised_payout, status, display_order, max_concurrent_matches, max_daily_matches)
SELECT 'Elite Warrior', 60.00, 108.00, 'active', 8, 100, 500
WHERE NOT EXISTS (SELECT 1 FROM public.one_vs_one_cards WHERE entry_amount = 60.00);

INSERT INTO public.one_vs_one_cards (name, entry_amount, advertised_payout, status, display_order, max_concurrent_matches, max_daily_matches)
SELECT 'Grandmaster Clash', 75.00, 135.00, 'active', 9, 100, 500
WHERE NOT EXISTS (SELECT 1 FROM public.one_vs_one_cards WHERE entry_amount = 75.00);

INSERT INTO public.one_vs_one_cards (name, entry_amount, advertised_payout, status, display_order, max_concurrent_matches, max_daily_matches)
SELECT 'Ultimate Titan', 100.00, 180.00, 'active', 10, 100, 500
WHERE NOT EXISTS (SELECT 1 FROM public.one_vs_one_cards WHERE entry_amount = 100.00);
