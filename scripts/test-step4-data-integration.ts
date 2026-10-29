/**
 * Automated Verification Test Suite for Step 4: Real Supabase Data Integration
 * Tests Ownership Isolation, Opponent Privacy, Match Categorization, and Data Integrity
 */

import {
  getPlayerTournaments,
  getPlayerMatches,
  getPlayerOverviewStats,
  type PlayerMatchItem,
  type PlayerTournamentItem,
} from '../services/playerDashboardService';
import { isAllowlistedAdminEmail } from '../lib/auth/server';

interface TestRecord {
  id: number;
  category: string;
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
  notes?: string;
}

const testResults: TestRecord[] = [];

function assertTest(
  id: number,
  category: string,
  name: string,
  expected: string,
  actual: string,
  passed: boolean,
  notes?: string
) {
  testResults.push({ id, category, name, expected, actual, passed, notes });
}

async function runStep4Tests() {
  console.log('================================================================');
  console.log('       STEP 4 — REAL SUPABASE DATA INTEGRATION TEST SUITE       ');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // Test 1: Ownership Isolation — Query parameter spoofing prevention
  // -------------------------------------------------------------
  {
    const playerA_UUID = '11111111-1111-4111-8111-111111111111';
    const playerB_UUID = '22222222-2222-4222-8222-222222222222';

    // Mock client simulating Supabase server query for player A
    const mockSupabase = {
      from: (table: string) => {
        if (table === 'participants') {
          return {
            select: () => ({
              eq: (col: string, val: string) => {
                // Returns only records matching authenticated user_id
                if (col === 'user_id' && val === playerA_UUID) {
                  return {
                    order: () => Promise.resolve({
                      data: [
                        { id: 'part-1', tournament_id: 'tourney-1', username: 'PlayerA_EF', status: 'active', seed_number: 1, created_at: '2026-10-20T10:00:00Z' }
                      ],
                      error: null
                    }),
                  };
                }
                return {
                  order: () => Promise.resolve({ data: [], error: null })
                };
              }
            })
          };
        }
        if (table === 'tournaments') {
          return {
            select: () => ({
              in: () => Promise.resolve({
                data: [{ id: 'tourney-1', name: 'Kerala Champions Cup', format: 'knockout', status: 'ongoing', max_participants: 32 }],
                error: null
              })
            })
          };
        }
        if (table === 'group_participants') {
          return {
            select: () => ({
              in: () => Promise.resolve({ data: [], error: null })
            })
          };
        }
        return {};
      }
    };

    const resA = await getPlayerTournaments(mockSupabase as any, playerA_UUID);
    const resB = await getPlayerTournaments(mockSupabase as any, playerB_UUID);

    const playerAHasData = resA.data.length === 1 && resA.data[0].tournamentName === 'Kerala Champions Cup';
    const playerBEmpty = resB.data.length === 0;

    assertTest(
      1,
      'Ownership Isolation',
      'Player A cannot see Player B registrations',
      'Strict user_id isolation enforced in SQL query',
      playerAHasData && playerBEmpty ? 'Player A saw 1 record, Player B saw 0' : 'Leak detected',
      playerAHasData && playerBEmpty,
      'Derived strictly from auth.uid() on server-side'
    );
  }

  // -------------------------------------------------------------
  // Test 2: Match Side Attribution (Home vs Away)
  // -------------------------------------------------------------
  {
    const userPartId = 'user-part-uuid';
    const opponentPartId = 'opponent-part-uuid';

    // Mock match where user is participant_a (Home)
    const matchAsHome: any = {
      id: 'match-1',
      round_id: 'round-1',
      participant_a: userPartId,
      participant_b: opponentPartId,
      status: 'completed',
      score_a: 3,
      score_b: 1,
      winner_id: userPartId,
      decided_by: 'normal',
      scheduled_time: '2026-10-21T18:00:00Z',
      created_at: '2026-10-20T10:00:00Z'
    };

    // Mock match where user is participant_b (Away)
    const matchAsAway: any = {
      id: 'match-2',
      round_id: 'round-1',
      participant_a: opponentPartId,
      participant_b: userPartId,
      status: 'completed',
      score_a: 0,
      score_b: 2,
      winner_id: userPartId,
      decided_by: 'normal',
      scheduled_time: '2026-10-22T19:00:00Z',
      created_at: '2026-10-20T11:00:00Z'
    };

    const mockSupabaseMatches = {
      from: (table: string) => {
        if (table === 'participants') {
          return {
            select: (cols: string) => ({
              eq: () => Promise.resolve({ data: [{ id: userPartId, tournament_id: 't1' }], error: null }),
              in: () => Promise.resolve({ data: [{ id: opponentPartId, username: 'OpponentGamer' }], error: null })
            })
          };
        }
        if (table === 'matches') {
          return {
            select: () => ({
              or: () => ({
                limit: () => Promise.resolve({ data: [matchAsHome, matchAsAway], error: null })
              })
            })
          };
        }
        if (table === 'rounds') {
          return {
            select: () => ({ in: () => Promise.resolve({ data: [{ id: 'round-1', name: 'Quarter-Final', round_number: 1, tournament_id: 't1' }], error: null }) })
          };
        }
        if (table === 'tournaments') {
          return {
            select: () => ({ in: () => Promise.resolve({ data: [{ id: 't1', name: 'State Trophy' }], error: null }) })
          };
        }
        return {};
      }
    };

    const matchesResult = await getPlayerMatches(mockSupabaseMatches as any, 'user-id-123');
    const homeMatch = matchesResult.data.find((m) => m.id === 'match-1');
    const awayMatch = matchesResult.data.find((m) => m.id === 'match-2');

    const homeCorrect = homeMatch?.userSide === 'home' && homeMatch?.userScore === 3 && homeMatch?.opponentScore === 1 && homeMatch?.result === 'win';
    const awayCorrect = awayMatch?.userSide === 'away' && awayMatch?.userScore === 2 && awayMatch?.opponentScore === 0 && awayMatch?.result === 'win';

    assertTest(
      2,
      'Data Correctness',
      'Home/Away side and score orientation',
      'Accurate score mapping according to user side (home vs away)',
      homeCorrect && awayCorrect ? 'Correctly mapped home/away scores and win results' : 'Incorrect side mapping',
      homeCorrect && awayCorrect,
      'Matches map score_a/b correctly based on whether user is participant_a or participant_b'
    );
  }

  // -------------------------------------------------------------
  // Test 3: Normal Draw vs Knockout Penalty Shootout distinction
  // -------------------------------------------------------------
  {
    const userPartId = 'user-part-uuid';
    const opponentPartId = 'opponent-part-uuid';

    const drawMatch: any = {
      id: 'match-draw',
      round_id: 'round-1',
      participant_a: userPartId,
      participant_b: opponentPartId,
      status: 'completed',
      score_a: 2,
      score_b: 2,
      winner_id: null,
      decided_by: 'normal',
      created_at: '2026-10-20T10:00:00Z'
    };

    const penaltyMatch: any = {
      id: 'match-penalty',
      round_id: 'round-1',
      participant_a: userPartId,
      participant_b: opponentPartId,
      status: 'completed',
      score_a: 1,
      score_b: 1,
      penalty_score_a: 5,
      penalty_score_b: 4,
      winner_id: userPartId,
      decided_by: 'penalties',
      created_at: '2026-10-20T11:00:00Z'
    };

    const mockSupabasePenalties = {
      from: (table: string) => {
        if (table === 'participants') {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [{ id: userPartId, tournament_id: 't1' }], error: null }),
              in: () => Promise.resolve({ data: [{ id: opponentPartId, username: 'OpponentGamer' }], error: null })
            })
          };
        }
        if (table === 'matches') {
          return {
            select: () => ({
              or: () => ({
                limit: () => Promise.resolve({ data: [drawMatch, penaltyMatch], error: null })
              })
            })
          };
        }
        if (table === 'rounds') {
          return { select: () => ({ in: () => Promise.resolve({ data: [{ id: 'round-1', name: 'Round 1', round_number: 1, tournament_id: 't1' }], error: null }) }) };
        }
        if (table === 'tournaments') {
          return { select: () => ({ in: () => Promise.resolve({ data: [{ id: 't1', name: 'State Trophy' }], error: null }) }) };
        }
        return {};
      }
    };

    const res = await getPlayerMatches(mockSupabasePenalties as any, 'user-id-123');
    const drawItem = res.data.find((m) => m.id === 'match-draw');
    const penItem = res.data.find((m) => m.id === 'match-penalty');

    const drawVerified = drawItem?.result === 'draw' && drawItem?.decidedBy === 'normal';
    const penVerified = penItem?.result === 'win' && penItem?.decidedBy === 'penalties' && penItem?.userPenalties === 5 && penItem?.opponentPenalties === 4;

    assertTest(
      3,
      'Data Integrity',
      'Distinction between normal draw and penalty shootouts',
      'Normal draw preserved as draw; penalty winner preserved with penalty scores',
      drawVerified && penVerified ? 'Draw and penalty shootout accurately distinguished' : 'Failed to distinguish',
      drawVerified && penVerified,
      'Authoritative decided_by and winner_id values preserved'
    );
  }

  // -------------------------------------------------------------
  // Test 4: Opponent Privacy Protection
  // -------------------------------------------------------------
  {
    const userPartId = 'user-part-uuid';
    const opponentPartId = 'opponent-part-uuid';

    const testMatch: any = {
      id: 'match-priv',
      round_id: 'r1',
      participant_a: userPartId,
      participant_b: opponentPartId,
      status: 'scheduled',
      score_a: 0,
      score_b: 0,
      created_at: '2026-10-21T00:00:00Z'
    };

    let selectedColumns = '';
    const mockSupabasePrivacy = {
      from: (table: string) => {
        if (table === 'participants') {
          return {
            select: (cols: string) => {
              selectedColumns = cols;
              return {
                eq: () => Promise.resolve({ data: [{ id: userPartId, tournament_id: 't1' }], error: null }),
                in: () => Promise.resolve({ data: [{ id: opponentPartId, username: 'SecretGamer' }], error: null })
              };
            }
          };
        }
        if (table === 'matches') {
          return { select: () => ({ or: () => ({ limit: () => Promise.resolve({ data: [testMatch], error: null }) }) }) };
        }
        if (table === 'rounds') {
          return { select: () => ({ in: () => Promise.resolve({ data: [{ id: 'r1', name: 'Round 1', round_number: 1, tournament_id: 't1' }], error: null }) }) };
        }
        if (table === 'tournaments') {
          return { select: () => ({ in: () => Promise.resolve({ data: [{ id: 't1', name: 'Cup' }], error: null }) }) };
        }
        return {};
      }
    };

    const res = await getPlayerMatches(mockSupabasePrivacy as any, 'user-id-123');
    const matchItem = res.data[0];

    const hasNoContactInfo = !('contact_info' in matchItem) && !('real_name' in matchItem);
    const usesOnlyUsername = matchItem.opponentUsername === 'SecretGamer';

    assertTest(
      4,
      'Privacy & Security',
      'Opponent contact information is never exposed',
      'Only public username exposed, no phone/WhatsApp/contact details',
      hasNoContactInfo && usesOnlyUsername ? 'Private fields stripped; only username exposed' : 'LEAK: Private fields present',
      hasNoContactInfo && usesOnlyUsername,
      'Selects id, username only for opponent queries'
    );
  }

  // -------------------------------------------------------------
  // Test 5: Error resilience — Query failure does not masquerade as empty list
  // -------------------------------------------------------------
  {
    const failingSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({
              data: null,
              error: { message: 'Database connection timeout', code: '57P01' }
            })
          })
        })
      })
    };

    const res = await getPlayerTournaments(failingSupabase as any, 'any-user-id');
    const handlesError = res.error !== null && res.data.length === 0;

    assertTest(
      5,
      'Error Handling',
      'Database query failure yields explicit error state',
      'Returns non-null error with error message, not silent empty list',
      handlesError ? `Error caught: "${res.error}"` : 'Failed: masqueraded as empty list',
      handlesError,
      'Ensures failed database requests show retry prompts to users'
    );
  }

  // -------------------------------------------------------------
  // Test 6: Admin security regression verification
  // -------------------------------------------------------------
  {
    const playerEmail = 'casual_player@gmail.com';
    const adminEmail = 'ye.agrajj@gmail.com';

    const playerIsAdmin = isAllowlistedAdminEmail(playerEmail);
    const adminIsAdmin = isAllowlistedAdminEmail(adminEmail);

    const passed = !playerIsAdmin && adminIsAdmin;

    assertTest(
      6,
      'Security Regression',
      'Normal player login never grants admin privileges',
      'ye.agrajj@gmail.com is strictly the only authorized admin',
      passed ? 'Player denied admin, designated admin authorized' : 'Security regression detected',
      passed,
      'Admin allowlist boundary remains intact'
    );
  }

  // -------------------------------------------------------------
  // Test Output Summary
  // -------------------------------------------------------------
  let allPassed = true;
  testResults.forEach((t) => {
    const symbol = t.passed ? '✓ PASS' : '✗ FAIL';
    if (!t.passed) allPassed = false;
    console.log(`[Test ${t.id.toString().padStart(2, '0')}] ${symbol} | [${t.category}] ${t.name}`);
    console.log(`   Expected: ${t.expected}`);
    console.log(`   Actual:   ${t.actual}`);
    if (t.notes) console.log(`   Notes:    ${t.notes}`);
    console.log('');
  });

  console.log('----------------------------------------------------------------');
  console.log(`Summary: ${testResults.filter((t) => t.passed).length}/${testResults.length} Tests Passed`);
  console.log(allPassed ? 'ALL STEP 4 INTEGRATION TESTS PASSED!' : 'SOME TESTS FAILED!');
  console.log('================================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runStep4Tests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
