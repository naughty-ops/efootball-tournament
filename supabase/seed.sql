-- ============================================================================
-- DEVELOPMENT SEED DATA (DO NOT APPLY TO PRODUCTION)
-- ============================================================================

-- 1. Insert Sample Tournament
INSERT INTO public.tournaments (
    id, name, description, format, status, start_date, end_date, rules_text, max_participants
) VALUES (
    '11111111-1111-1111-1111-111111111111',
    'eFootball Summer Cup 2026',
    'Development test tournament for bracket generation and fixture tracking.',
    'knockout',
    'ongoing',
    NOW(),
    NOW() + INTERVAL '7 days',
    'Standard 10-minute match settings, extra time & penalties enabled.',
    16
) ON CONFLICT (id) DO NOTHING;

-- 2. Insert 4 Sample Participants
INSERT INTO public.participants (
    id, tournament_id, username, real_name, contact_info, seed_number, status
) VALUES 
(
    '22222222-2222-2222-2222-222222222221',
    '11111111-1111-1111-1111-111111111111',
    'ProStriker99',
    'Alex Rivera',
    'alex@example.com',
    1,
    'active'
),
(
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'GamerKing_X',
    'Marcus Vance',
    'marcus@example.com',
    2,
    'active'
),
(
    '22222222-2222-2222-2222-222222222223',
    '11111111-1111-1111-1111-111111111111',
    'TacticalNinja',
    'Kenji Sato',
    'kenji@example.com',
    3,
    'active'
),
(
    '22222222-2222-2222-2222-222222222224',
    '11111111-1111-1111-1111-111111111111',
    'ShadowFinisher',
    'David Miller',
    'david@example.com',
    4,
    'active'
) ON CONFLICT (id) DO NOTHING;

-- 3. Insert 1 Round (Semi-Finals)
INSERT INTO public.rounds (
    id, tournament_id, round_number, name, status
) VALUES (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    1,
    'Semi-Finals',
    'ongoing'
) ON CONFLICT (id) DO NOTHING;

-- 4. Insert 2 Sample Matches
INSERT INTO public.matches (
    id, round_id, participant_a, participant_b, scheduled_time, status, score_a, score_b, winner_id, notes
) VALUES 
(
    '44444444-4444-4444-4444-444444444441',
    '33333333-3333-3333-3333-333333333333',
    '22222222-2222-2222-2222-222222222221',
    '22222222-2222-2222-2222-222222222224',
    NOW() + INTERVAL '1 hour',
    'completed',
    3,
    1,
    '22222222-2222-2222-2222-222222222221',
    'ProStriker99 won after 90 mins.'
),
(
    '44444444-4444-4444-4444-444444444442',
    '33333333-3333-3333-3333-333333333333',
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222223',
    NOW() + INTERVAL '2 hours',
    'live',
    2,
    2,
    NULL,
    'Match currently live in Extra Time.'
) ON CONFLICT (id) DO NOTHING;
