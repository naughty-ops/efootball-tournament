/**
 * AUTOMATED VERIFICATION TEST SUITE:
 * Admin Tournament Creation, Lifecycle Management, and Open Player Registration
 */

import { isAllowlistedAdminEmail, PRIMARY_ADMIN_EMAIL } from '../lib/auth/server';
import {
  EFOOTBALL_ID_REGEX,
  normalizeEfootballId,
  isValidEfootballId,
  tournamentSchema,
  type TournamentInput,
} from '../lib/validations';
import { ALLOWED_STATUS_TRANSITIONS } from '../services/tournamentService';
import { selfRegisterTournament } from '../services/playerDashboardService';
import type { TournamentStatus } from '../types/database';

interface TestCase {
  id: number;
  category: string;
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
  notes?: string;
}

const testResults: TestCase[] = [];

function recordTest(
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

async function runTestSuite() {
  console.log('================================================================');
  console.log(' TOURNAMENT CREATION & OPEN REGISTRATION TEST SUITE (12 CHECKS) ');
  console.log('================================================================\n');

  // -------------------------------------------------------------------------
  // Test 1: Admin Allowlist Authorization
  // -------------------------------------------------------------------------
  {
    const authorizedEmail = 'ye.agrajj@gmail.com';
    const isAuthorized = isAllowlistedAdminEmail(authorizedEmail);
    recordTest(
      1,
      'Admin Authorization',
      'Primary Admin Allowlist Verification',
      'ye.agrajj@gmail.com must be authorized',
      isAuthorized ? 'Authorized (isAdmin: true)' : 'Unauthorized',
      isAuthorized === true,
      `Matches PRIMARY_ADMIN_EMAIL (${PRIMARY_ADMIN_EMAIL})`
    );
  }

  // -------------------------------------------------------------------------
  // Test 2: Non-Admin Email Rejection
  // -------------------------------------------------------------------------
  {
    const normalPlayer = 'player123@gmail.com';
    const isAuthorized = isAllowlistedAdminEmail(normalPlayer);
    recordTest(
      2,
      'Admin Authorization',
      'Normal Player Access Denial',
      'player123@gmail.com must be denied admin privileges',
      isAuthorized ? 'CRITICAL: Granted admin' : 'Denied (isAdmin: false)',
      isAuthorized === false,
      'Strict server-side allowlist correctly blocks ordinary player'
    );
  }

  // -------------------------------------------------------------------------
  // Test 3: Admin Case-Insensitive and Whitespace Normalization
  // -------------------------------------------------------------------------
  {
    const variantEmail = '  YE.AGRAJJ@GMAIL.COM  ';
    const isAuthorized = isAllowlistedAdminEmail(variantEmail);
    recordTest(
      3,
      'Admin Authorization',
      'Email Case & Whitespace Normalization',
      'Admin email with uppercase and spaces must still match',
      isAuthorized ? 'Normalized and Authorized' : 'Normalization Failed',
      isAuthorized === true,
      'Trim and lowercase sanitization verified'
    );
  }

  // -------------------------------------------------------------------------
  // Test 4: Canonical eFootball ID Regex Validation
  // -------------------------------------------------------------------------
  {
    const sampleId = 'ABCD-123-456-789';
    const isValid = isValidEfootballId(sampleId);
    recordTest(
      4,
      'eFootball ID Validation',
      'Canonical eFootball ID Format',
      'Format ABCD-123-456-789 must pass regex validation',
      isValid ? 'Valid standard eFootball ID' : 'Failed regex validation',
      isValid === true,
      `Matched against pattern: ${EFOOTBALL_ID_REGEX}`
    );
  }

  // -------------------------------------------------------------------------
  // Test 5: Invalid eFootball ID Rejection
  // -------------------------------------------------------------------------
  {
    const invalidIds = ['123', 'ABCD-EFG-HIJ', 'ABCD-123-456-78900', 'INVALID-FORMAT', '!!!???'];
    const allRejected = invalidIds.every((id) => !isValidEfootballId(id));
    recordTest(
      5,
      'eFootball ID Validation',
      'Malformed ID Rejection',
      'Malformed/non-standard IDs must be rejected',
      allRejected ? 'All malformed IDs rejected' : 'Some malformed IDs accepted',
      allRejected === true,
      `Tested variants: ${invalidIds.join(', ')}`
    );
  }

  // -------------------------------------------------------------------------
  // Test 6: eFootball ID Normalization
  // -------------------------------------------------------------------------
  {
    const rawContinuous = '  abcd123456789  ';
    const normalized = normalizeEfootballId(rawContinuous);
    const expected = 'ABCD-123-456-789';
    recordTest(
      6,
      'eFootball ID Validation',
      'Automatic 13-Character Hyphenation',
      `"${rawContinuous}" should normalize to "${expected}"`,
      `Normalized to "${normalized}"`,
      normalized === expected && isValidEfootballId(normalized),
      'Normalizer automatically formats clean 13-character input'
    );
  }

  // -------------------------------------------------------------------------
  // Test 7: Tournament Creation Input Schema Validation
  // -------------------------------------------------------------------------
  {
    const validPayload: TournamentInput = {
      name: 'V1.2 Open Registration Test Cup',
      description: 'Official test cup for open player registration',
      format: 'knockout',
      status: 'registration',
      max_participants: 16,
      rules_text: 'Best of 1 knockout format with extra time and penalties',
      banner_image: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2',
      start_date: '2026-11-01T10:00:00Z',
      end_date: '2026-11-05T18:00:00Z',
      qualifiers_per_group: 2,
      rounds_per_pair: 1,
      is_paid: false,
    };
    const parsed = tournamentSchema.safeParse(validPayload);
    recordTest(
      7,
      'Tournament Creation Schema',
      'Valid Tournament Input Schema',
      'Payload conforms to tournamentSchema without errors',
      parsed.success ? 'Schema validation succeeded' : `Failed: ${parsed.error?.issues[0]?.message}`,
      parsed.success === true,
      'All tournament fields validated'
    );
  }

  // -------------------------------------------------------------------------
  // Test 8: Tournament Input Schema Rejection on Invalid Date Order
  // -------------------------------------------------------------------------
  {
    const invalidDatesPayload = {
      name: 'Invalid Date Tournament',
      format: 'knockout' as const,
      status: 'draft' as const,
      max_participants: 16,
      start_date: '2026-12-01T00:00:00Z',
      end_date: '2026-11-01T00:00:00Z', // Earlier than start date!
    };
    const parsed = tournamentSchema.safeParse(invalidDatesPayload);
    recordTest(
      8,
      'Tournament Creation Schema',
      'End Date < Start Date Rejection',
      'Schema must reject end dates earlier than start dates',
      !parsed.success ? 'Properly rejected by schema refinement' : 'Invalid dates accepted',
      parsed.success === false,
      parsed.error?.issues[0]?.message || 'Refinement triggered'
    );
  }

  // -------------------------------------------------------------------------
  // Test 9: Tournament Status Transition Lifecycle Rules
  // -------------------------------------------------------------------------
  {
    // draft -> registration: allowed
    const draftToReg = ALLOWED_STATUS_TRANSITIONS['draft'].includes('registration');
    // registration -> draft: allowed (pause/close registration)
    const regToDraft = ALLOWED_STATUS_TRANSITIONS['registration'].includes('draft');
    // registration -> ongoing: allowed (start tournament)
    const regToOngoing = ALLOWED_STATUS_TRANSITIONS['registration'].includes('ongoing');
    // completed -> draft: disallowed
    const completedToDraft = ALLOWED_STATUS_TRANSITIONS['completed'].includes('draft');

    const transitionsPass = draftToReg && regToDraft && regToOngoing && !completedToDraft;

    recordTest(
      9,
      'Lifecycle Engine',
      'Status Transition Rules Validation',
      'Allowed: draft<->registration, registration->ongoing; Disallowed: completed->draft',
      transitionsPass ? 'All state machine transitions strictly verified' : 'Invalid transition permitted',
      transitionsPass,
      'Ensures admin cannot revert completed tournaments to draft'
    );
  }

  // -------------------------------------------------------------------------
  // Test 10: Player Registration Guard — Tournament Status Verification
  // -------------------------------------------------------------------------
  {
    const mockDraftTourney = { id: 'tourney-draft-1', name: 'Draft Tourney', status: 'draft', max_participants: 16 };
    const mockSupabase = {
      from: (table: string) => ({
        select: () => ({
          eq: (field: string, val: any) => ({
            maybeSingle: async () => {
              if (table === 'profiles') return { data: { id: 'u1', efootball_id: 'ABCD-111-222-333', account_status: 'active' }, error: null };
              if (table === 'tournaments') return { data: mockDraftTourney, error: null };
              return { data: null, error: null };
            },
          }),
        }),
      }),
    };

    const res = await selfRegisterTournament(mockSupabase as any, 'u1', 'tourney-draft-1');
    recordTest(
      10,
      'Registration Service',
      'Registration Blocked on Non-Registration Status',
      'Reject registration when tournament status is "draft"',
      res.success ? 'Allowed registration in draft' : `Blocked: "${res.message}"`,
      res.success === false && res.message.includes('closed'),
      'Tournament status must be "registration" for players to join'
    );
  }

  // -------------------------------------------------------------------------
  // Test 11: Player Registration Guard — Capacity Check
  // -------------------------------------------------------------------------
  {
    const mockFullTourney = { id: 'tourney-full-1', name: 'Full Cup', status: 'registration', max_participants: 2 };
    const mockSupabase = {
      from: (table: string) => ({
        select: (cols: any, opts?: any) => ({
          eq: (field: string, val: any) => ({
            maybeSingle: async () => {
              if (table === 'profiles') return { data: { id: 'u2', efootball_id: 'ABCD-444-555-666', account_status: 'active' }, error: null };
              if (table === 'tournaments') return { data: mockFullTourney, error: null };
              return { data: null, error: null };
            },
            then: (resolve: any) => {
              if (opts?.count === 'exact') {
                return resolve({ count: 2, error: null });
              }
              return resolve({ data: [], error: null });
            },
          }),
        }),
      }),
    };

    const res = await selfRegisterTournament(mockSupabase as any, 'u2', 'tourney-full-1');
    recordTest(
      11,
      'Registration Service',
      'Capacity Limit Enforcement',
      'Reject registration when participant count reaches max_participants',
      res.success ? 'Allowed registration beyond capacity' : `Blocked: "${res.message}"`,
      res.success === false && res.message.includes('full'),
      'Prevents overselling slots'
    );
  }

  // -------------------------------------------------------------------------
  // Test 12: Player Registration Guard — Duplicate Prevention
  // -------------------------------------------------------------------------
  {
    const mockOpenTourney = { id: 'tourney-open-1', name: 'Open Cup', status: 'registration', max_participants: 16 };
    const mockSupabase = {
      from: (table: string) => ({
        select: (cols: any, opts?: any) => ({
          eq: (field: string, val: any) => ({
            eq: (field2: string, val2: any) => ({
              maybeSingle: async () => {
                // User already registered check
                if (table === 'participants' && field === 'tournament_id' && field2 === 'user_id') {
                  return { data: { id: 'existing-p-1', tournament_id: 'tourney-open-1', user_id: 'u3' }, error: null };
                }
                return { data: null, error: null };
              },
            }),
            maybeSingle: async () => {
              if (table === 'profiles') return { data: { id: 'u3', efootball_id: 'ABCD-777-888-999', account_status: 'active' }, error: null };
              if (table === 'tournaments') return { data: mockOpenTourney, error: null };
              return { data: null, error: null };
            },
            then: (resolve: any) => {
              if (opts?.count === 'exact') return resolve({ count: 5, error: null });
              return resolve({ data: [], error: null });
            },
          }),
        }),
      }),
    };

    const res = await selfRegisterTournament(mockSupabase as any, 'u3', 'tourney-open-1');
    recordTest(
      12,
      'Registration Service',
      'Duplicate Registration Guard',
      'Reject registration if user or eFootball ID already registered in tournament',
      res.success ? 'Allowed duplicate registration' : `Blocked: "${res.message}"`,
      res.success === false && res.message.includes('already registered'),
      'Ensures exactly 1 slot per user/ID'
    );
  }

  // -------------------------------------------------------------------------
  // Report Summary Table
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('                       TEST SUITE RESULTS                       ');
  console.log('================================================================\n');

  let passedCount = 0;
  testResults.forEach((t) => {
    const statusIcon = t.passed ? '[PASS]' : '[FAIL]';
    if (t.passed) passedCount++;
    console.log(`${statusIcon} Test ${t.id}: ${t.name} (${t.category})`);
    console.log(`       Expected: ${t.expected}`);
    console.log(`       Actual:   ${t.actual}`);
    if (t.notes) console.log(`       Notes:    ${t.notes}`);
    console.log('');
  });

  console.log('----------------------------------------------------------------');
  console.log(`SUMMARY: ${passedCount} / ${testResults.length} Tests Passed (${Math.round((passedCount / testResults.length) * 100)}% Success Rate)`);
  console.log('----------------------------------------------------------------\n');

  if (passedCount !== testResults.length) {
    console.error('CRITICAL: Not all verification tests passed!');
    process.exit(1);
  } else {
    console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY.');
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error running test suite:', err);
  process.exit(1);
});
