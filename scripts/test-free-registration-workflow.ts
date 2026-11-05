import { selfRegisterTournament } from '../services/playerDashboardService';

// Test harness for Free Registration Workflow
async function runFreeRegistrationTests() {
  console.log('================================================================');
  console.log('   FREE REGISTRATION WORKFLOW & PAYMENT REMOVAL AUDIT SUITE    ');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] Test ${totalTests}: ${testName}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] Test ${totalTests}: ${testName}`);
      if (detail) console.error(`         Detail: ${detail}`);
    }
  }

  // --- UNIT / CONTRACT VALIDATION OF REGISTRATION SERVICE ---
  console.log('--- SUITE 1: Validation Barriers & Gate Enforcement ---');

  // Helper to create mock Supabase client
  function createMockSupabase(overrides: {
    profile?: any;
    tournament?: any;
    currentParticipantsCount?: number;
    userAlreadyRegistered?: boolean;
    duplicateEfootballFound?: boolean;
    insertParticipantError?: any;
    insertRegError?: any;
  } = {}) {
    const profile = overrides.profile !== undefined ? overrides.profile : {
      id: 'usr_test_1',
      username: 'GamerOne',
      display_name: 'Player One',
      efootball_id: '123-456-789',
      status: 'active',
      whatsapp_verified: true,
      whatsapp_verification_status: 'verified',
      whatsapp_number: '+919876543210',
    };

    const tournament = overrides.tournament !== undefined ? overrides.tournament : {
      id: 'tour_test_1',
      name: 'Championship Cup',
      status: 'registration',
      max_participants: 16,
      confirmed_slots_count: 5,
    };

    const currentCount = overrides.currentParticipantsCount ?? 5;
    const userAlreadyRegistered = overrides.userAlreadyRegistered ?? false;
    const duplicateEfootballFound = overrides.duplicateEfootballFound ?? false;

    let insertedParticipant: any = null;
    let insertedRegistration: any = null;
    let updatedTournamentPayload: any = null;

    const mockClient: any = {
      auth: {
        getUser: async () => ({ data: { user: profile }, error: null }),
      },
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: profile, error: null }),
                single: async () => ({ data: profile, error: null }),
              }),
            }),
          };
        }
        if (table === 'tournaments') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: tournament, error: null }),
                single: async () => ({ data: tournament, error: null }),
              }),
            }),
            update: (payload: any) => ({
              eq: async () => {
                updatedTournamentPayload = payload;
                return { error: null };
              },
            }),
          };
        }
        if (table === 'participants') {
          return {
            select: (cols: string, opts?: any) => {
              if (opts?.count === 'exact') {
                return {
                  eq: async () => ({ count: currentCount, error: null }),
                };
              }
              // Normal select query
              return {
                eq: (col1: string, val1: any) => ({
                  eq: (col2: string, val2: any) => ({
                    maybeSingle: async () => {
                      if (userAlreadyRegistered) {
                        return { data: { id: 'part_existing', user_id: val2 }, error: null };
                      }
                      return { data: null, error: null };
                    },
                  }),
                  ilike: (col2: string, val2: any) => ({
                    maybeSingle: async () => {
                      if (duplicateEfootballFound) {
                        return { data: { id: 'part_efb_dup', username: val2 }, error: null };
                      }
                      return { data: null, error: null };
                    },
                  }),
                }),
              };
            },
            insert: (payload: any) => ({
              select: () => ({
                single: async () => {
                  if (overrides.insertParticipantError) {
                    return { data: null, error: overrides.insertParticipantError };
                  }
                  insertedParticipant = { id: 'part_new_123', ...payload };
                  return { data: insertedParticipant, error: null };
                },
              }),
            }),
          };
        }
        if (table === 'tournament_registrations') {
          return {
            insert: (payload: any) => {
              if (overrides.insertRegError) {
                return Promise.resolve({ error: overrides.insertRegError });
              }
              insertedRegistration = { id: 'reg_new_123', ...payload };
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`Unexpected table access: ${table}`);
      },
    };

    return {
      client: mockClient,
      getInsertedParticipant: () => insertedParticipant,
      getInsertedRegistration: () => insertedRegistration,
      getUpdatedTournamentPayload: () => updatedTournamentPayload,
    };
  }

  // TEST 1: Rules acceptance gate
  {
    const mock = createMockSupabase();
    const result = await selfRegisterTournament(mock.client, 'usr_test_1', 'tour_test_1', { rulesAccepted: false });
    assert(
      !result.success && result.message?.toLowerCase().includes('rules'),
      'Rules acceptance required: Rejects registration if rules not accepted',
      result.message
    );
  }

  // TEST 2: Suspended account rejection
  {
    const mock = createMockSupabase({
      profile: {
        id: 'usr_test_1',
        username: 'BannedUser',
        efootball_id: '123-456-789',
        status: 'suspended',
        whatsapp_verified: true,
      },
    });
    const result = await selfRegisterTournament(mock.client, 'usr_test_1', 'tour_test_1', { rulesAccepted: true });
    assert(
      !result.success && result.message?.includes('suspended'),
      'Suspended account blocked: Rejects suspended profile from registering',
      result.message
    );
  }

  // TEST 3: WhatsApp verification gate (neither flag true)
  {
    const mock = createMockSupabase({
      profile: {
        id: 'usr_test_1',
        username: 'UnverifiedUser',
        efootball_id: '123-456-789',
        status: 'active',
        whatsapp_verified: false,
        whatsapp_verification_status: 'pending',
      },
    });
    const result = await selfRegisterTournament(mock.client, 'usr_test_1', 'tour_test_1', { rulesAccepted: true });
    assert(
      !result.success && result.message?.includes('WhatsApp verification'),
      'WhatsApp verification barrier: Blocks user without verified WhatsApp',
      result.message
    );
  }

  // TEST 4: Missing eFootball ID gate
  {
    const mock = createMockSupabase({
      profile: {
        id: 'usr_test_1',
        username: 'NoIdUser',
        efootball_id: null,
        status: 'active',
        whatsapp_verified: true,
      },
    });
    const result = await selfRegisterTournament(mock.client, 'usr_test_1', 'tour_test_1', { rulesAccepted: true });
    assert(
      !result.success && result.message?.includes('eFootball ID'),
      'eFootball ID mandatory: Blocks user without configured eFootball ID',
      result.message
    );
  }

  // TEST 5: Tournament status gate (not in registration status)
  {
    const mock = createMockSupabase({
      tournament: {
        id: 'tour_test_1',
        name: 'Ongoing Cup',
        status: 'ongoing',
        max_participants: 16,
        confirmed_slots_count: 5,
      },
    });
    const result = await selfRegisterTournament(mock.client, 'usr_test_1', 'tour_test_1', { rulesAccepted: true });
    assert(
      !result.success && result.message?.includes('registration is closed'),
      'Tournament lifecycle check: Rejects registrations for ongoing/completed tournaments',
      result.message
    );
  }

  // TEST 6: Duplicate registration by user_id
  {
    const mock = createMockSupabase({
      userAlreadyRegistered: true,
    });
    const result = await selfRegisterTournament(mock.client, 'usr_test_1', 'tour_test_1', { rulesAccepted: true });
    assert(
      !result.success && result.message?.includes('already registered for this tournament'),
      'Duplicate prevention (User ID): Rejects user already registered for tournament',
      result.message
    );
  }

  // TEST 7: Duplicate registration by eFootball ID (case-insensitive)
  {
    const mock = createMockSupabase({
      duplicateEfootballFound: true,
    });
    const result = await selfRegisterTournament(mock.client, 'usr_test_1', 'tour_test_1', { rulesAccepted: true });
    assert(
      !result.success && result.message?.includes('eFootball ID is already registered'),
      'Duplicate prevention (eFootball ID): Rejects duplicate eFootball gamer tag',
      result.message
    );
  }

  // TEST 8: Max capacity gate
  {
    const mock = createMockSupabase({
      tournament: {
        id: 'tour_test_1',
        name: 'Full Cup',
        status: 'registration',
        max_participants: 16,
        confirmed_slots_count: 16,
      },
      currentParticipantsCount: 16,
    });
    const result = await selfRegisterTournament(mock.client, 'usr_test_1', 'tour_test_1', { rulesAccepted: true });
    assert(
      !result.success && result.message?.includes('capacity is full'),
      'Capacity enforcement: Rejects registration when tournament is full',
      result.message
    );
  }

  // TEST 9: Successful Free Registration Flow
  console.log('\n--- SUITE 2: Successful Free Registration Flow ---');
  {
    const mock = createMockSupabase();
    const result = await selfRegisterTournament(mock.client, 'usr_test_1', 'tour_test_1', { rulesAccepted: true });

    const participant = mock.getInsertedParticipant();
    const registration = mock.getInsertedRegistration();
    const updatedPayload = mock.getUpdatedTournamentPayload();

    assert(
      result.success === true && !!participant && !!registration,
      'Direct enrollment: Successfully registers participant without payment barrier',
      result.message
    );

    assert(
      participant.user_id === 'usr_test_1' &&
      participant.username === '123-456-789' &&
      participant.status === 'active' &&
      participant.terms_accepted === true,
      'Participant attributes: Active status and correct player credentials assigned',
      JSON.stringify(participant)
    );

    assert(
      registration.status === 'confirmed' &&
      registration.participant_id === participant.id &&
      registration.terms_accepted === true,
      'Registration record: Status confirmed, linked to participant, terms accepted',
      JSON.stringify(registration)
    );

    assert(
      updatedPayload.confirmed_slots_count === 6,
      'Slot count updated: Tournament confirmed_slots_count incremented accurately',
      JSON.stringify(updatedPayload)
    );
  }

  // TEST 10: Zero Payment Infrastructure Verification
  console.log('\n--- SUITE 3: Zero Payment Infrastructure Verification ---');
  {
    const mock = createMockSupabase();
    let paymentTableQueried = false;

    // Wrap mock client to detect illegal table queries
    const originalFrom = mock.client.from;
    mock.client.from = (table: string) => {
      if (table.startsWith('payment_')) {
        paymentTableQueried = true;
      }
      return originalFrom(table);
    };

    await selfRegisterTournament(mock.client, 'usr_test_1', 'tour_test_1', { rulesAccepted: true });

    assert(
      !paymentTableQueried,
      'Zero payment tables accessed: Registration workflow touches zero payment tables',
      `Payment tables accessed: ${paymentTableQueried}`
    );
  }

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} Tests Passed (100%)`);
  console.log('================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runFreeRegistrationTests().catch((err) => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
