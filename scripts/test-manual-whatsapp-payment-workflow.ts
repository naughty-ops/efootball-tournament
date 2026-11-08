import { generateWhatsAppPaymentLink, generateAdminContactPlayerLink } from '../lib/whatsappPayment';
import { selfRegisterTournament } from '../services/playerDashboardService';

console.log('🧪 Starting Manual WhatsApp Payment & Admin Approval System Tests...\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`❌ FAIL: ${testName}${details ? ` - ${details}` : ''}`);
    testsFailed++;
  }
}

async function runTests() {
  // TEST 1: WhatsApp Link Generation
  console.log('--- Test Suite 1: WhatsApp Link Generator ---');
  const paymentLink = generateWhatsAppPaymentLink({
    adminWhatsAppNumber: '+919207516227',
    tournamentName: 'Champions eFootball Trophy',
    tournamentId: 'tourn-1234-5678',
    userName: 'Lionel Player',
    efootballId: '123-456-789',
    userPhone: '+919876543210',
    entryFeeINR: 100,
    registrationId: 'reg-abcd-9999',
  });

  assert(paymentLink.startsWith('https://wa.me/919207516227?text='), 'Link starts with wa.me/cleanPhone');
  assert(paymentLink.includes(encodeURIComponent('Champions eFootball Trophy')), 'Contains encoded tournament name');
  assert(paymentLink.includes(encodeURIComponent('123-456-789')), 'Contains encoded eFootball ID');
  assert(paymentLink.includes(encodeURIComponent('₹100')), 'Contains entry fee in INR ₹');
  assert(paymentLink.includes(encodeURIComponent('reg-abcd-9999')), 'Contains registration request ID');

  const adminLink = generateAdminContactPlayerLink({
    playerPhone: '+91 98765 43210',
    tournamentName: 'Champions Cup',
    registrationId: 'reg-abcd-9999',
    playerName: 'Lionel',
  });
  assert(adminLink.startsWith('https://wa.me/919876543210?text='), 'Admin contact link strips formatting');

  // TEST 2: Free Tournament instant registration preserves existing logic
  console.log('\n--- Test Suite 2: Free Tournament Instant Enrollment ---');
  const mockFreeTourney = {
    id: 'free-tourn-1',
    name: 'Free Open Cup',
    status: 'registration',
    max_participants: 16,
    is_paid: false,
    entry_fee_paise: 0,
    currency: 'INR',
  };

  const mockProfile = {
    id: 'user-free-1',
    display_name: 'Free Competitor',
    efootball_id: 'FREE-123',
    whatsapp_number: '+919999988888',
    whatsapp_verified: true,
    account_status: 'active',
  };

  let participantsInserted: any[] = [];
  let registrationsInserted: any[] = [];

  const mockSupabaseFree: any = {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: mockProfile, error: null }),
            }),
          }),
        };
      }
      if (table === 'tournaments') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: mockFreeTourney, error: null }),
            }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      if (table === 'participants') {
        return {
          select: (fields: string, opts?: any) => ({
            eq: (col: string, val: string) => ({
              ilike: () => ({
                maybeSingle: async () => ({ data: null }),
              }),
              maybeSingle: async () => ({ data: null }),
              then: (fn: any) => fn({ count: 5, error: null }),
            }),
          }),
          insert: (data: any) => {
            participantsInserted.push(data);
            return {
              select: () => ({
                single: async () => ({ data: { id: 'part-free-new' }, error: null }),
              }),
            };
          },
        };
      }
      if (table === 'tournament_registrations') {
        return {
          insert: (data: any) => {
            registrationsInserted.push(data);
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    },
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-free-1' } } }),
    },
  };

  const freeResult = await selfRegisterTournament(mockSupabaseFree, 'user-free-1', 'free-tourn-1');
  assert(freeResult.success === true, 'Free tournament registration succeeds');
  assert(freeResult.isPaid === false, 'Free tournament flagged as isPaid: false');
  assert(freeResult.participantId === 'part-free-new', 'Free tournament returns participantId instantly');
  assert(participantsInserted.length === 1, 'Participant record inserted immediately');
  assert(registrationsInserted.length === 1 && registrationsInserted[0].status === 'confirmed', 'Registration marked confirmed');

  // TEST 3: Paid Tournament Registration (Manual WhatsApp workflow)
  console.log('\n--- Test Suite 3: Paid Tournament Manual Registration ---');
  const mockPaidTourney = {
    id: 'paid-tourn-1',
    name: 'Pro Premier Cup',
    status: 'registration',
    max_participants: 32,
    is_paid: true,
    entry_fee_paise: 5000, // ₹50
    currency: 'INR',
  };

  let paidParticipantsInserted: any[] = [];
  let paidRegistrationsInserted: any[] = [];

  const mockSupabasePaid: any = {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: mockProfile, error: null }),
            }),
          }),
        };
      }
      if (table === 'tournaments') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: mockPaidTourney, error: null }),
            }),
          }),
        };
      }
      if (table === 'participants') {
        return {
          select: () => ({
            eq: () => ({
              ilike: () => ({
                maybeSingle: async () => ({ data: null }),
              }),
              maybeSingle: async () => ({ data: null }),
              then: (fn: any) => fn({ count: 10, error: null }),
            }),
          }),
          insert: (data: any) => {
            paidParticipantsInserted.push(data);
            return {
              select: () => ({
                single: async () => ({ data: { id: 'part-paid-new' }, error: null }),
              }),
            };
          },
        };
      }
      if (table === 'tournament_registrations') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () => ({
                  maybeSingle: async () => ({ data: null }),
                }),
              }),
            }),
          }),
          insert: (data: any) => {
            paidRegistrationsInserted.push(data);
            return {
              select: () => ({
                single: async () => ({
                  data: {
                    id: 'reg-paid-1234',
                    amount_paise: data.amount_paise,
                    currency: data.currency,
                    status: data.status,
                  },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      return {};
    },
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-free-1' } } }),
    },
  };

  const paidResult = await selfRegisterTournament(mockSupabasePaid, 'user-free-1', 'paid-tourn-1');
  assert(paidResult.success === true, 'Paid tournament registration request created successfully');
  assert(paidResult.isPaid === true, 'Paid tournament flagged as isPaid: true');
  assert(paidResult.status === 'pending_payment', 'Initial status is pending_payment');
  assert(paidResult.registrationId === 'reg-paid-1234', 'Returns valid registrationId');
  assert(paidResult.entryFeeINR === 50, 'Calculates correct INR entry fee of ₹50');
  assert(paidParticipantsInserted.length === 0, 'Does NOT insert into participants before payment approval');
  assert(paidRegistrationsInserted.length === 1, 'Inserts into tournament_registrations');
  assert(paidRegistrationsInserted[0].payment_method === 'whatsapp_manual', 'Records payment_method as whatsapp_manual');

  console.log('\n========================================');
  console.log(`Results: ${testsPassed} Passed, ${testsFailed} Failed.`);
  console.log('========================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
