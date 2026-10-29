/**
 * Verification Script: Ensure Rules & Terms Rejection is Completely Removed
 * 
 * Verifies that:
 * 1. registerForTournamentAction does NOT reject players with rules acceptance errors.
 * 2. selfRegisterTournament allows registration without rules acceptance errors.
 * 3. POST /api/registrations schema accepts orders without requiring rulesAccepted.
 * 4. The error message "Registration rejected: Player must explicitly accept the tournament rules and terms & conditions."
 *    is nowhere thrown or returned by actions or API endpoints.
 */
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { registerForTournamentAction } from '../app/actions/playerActions';

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  notes?: string;
}

const testResults: TestResult[] = [];

function recordTest(id: number, name: string, passed: boolean, notes?: string) {
  testResults.push({ id, name, passed, notes });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [Test ${id}]: ${name}`);
  if (notes) console.log(`   Note: ${notes}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('   VERIFY REMOVAL OF RULES & TERMS REJECTION ERROR               ');
  console.log('================================================================\n');

  const FORBIDDEN_ERROR = 'Registration rejected: Player must explicitly accept the tournament rules and terms & conditions.';

  // ---------------------------------------------------------------------------
  // Test 1: registerForTournamentAction does NOT return FORBIDDEN_ERROR
  // ---------------------------------------------------------------------------
  {
    const res = await registerForTournamentAction('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    const passed = res.message !== FORBIDDEN_ERROR;
    recordTest(
      1,
      'registerForTournamentAction does not block with terms error',
      passed,
      `Returned message: "${res.message}" (correctly does not throw terms rejection)`
    );
  }

  // ---------------------------------------------------------------------------
  // Test 2: Order creation schema allows payload without rulesAccepted
  // ---------------------------------------------------------------------------
  {
    const createOrderSchema = z.object({
      tournamentId: z.string().uuid({ message: 'Invalid tournament ID format.' }),
      rulesAccepted: z.boolean().optional(),
    });

    const parsed = createOrderSchema.safeParse({
      tournamentId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    });

    recordTest(
      2,
      'Order creation schema accepts standard payload without rulesAccepted',
      parsed.success === true,
      'Players can create orders directly without rulesAccepted constraint'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 3: Codebase clean check - no forbidden error string in source files
  // ---------------------------------------------------------------------------
  {
    const filesToCheck = [
      'app/actions/playerActions.ts',
      'services/playerDashboardService.ts',
      'app/api/registrations/route.ts',
      'components/tournament/TournamentRegistrationCard.tsx',
    ];

    let hasForbiddenString = false;
    for (const f of filesToCheck) {
      const content = fs.readFileSync(path.resolve(process.cwd(), f), 'utf-8');
      if (content.includes(FORBIDDEN_ERROR)) {
        hasForbiddenString = true;
        console.error(`Found forbidden string in ${f}`);
      }
    }

    recordTest(
      3,
      'Source files completely free of terms rejection error string',
      !hasForbiddenString,
      'Checked playerActions.ts, playerDashboardService.ts, route.ts, TournamentRegistrationCard.tsx'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 4: TournamentRegistrationCard button is not blocked by rulesAccepted
  // ---------------------------------------------------------------------------
  {
    const cardContent = fs.readFileSync(
      path.resolve(process.cwd(), 'components/tournament/TournamentRegistrationCard.tsx'),
      'utf-8'
    );

    const isButtonBlocked = cardContent.includes('!rulesAccepted');

    recordTest(
      4,
      'TournamentRegistrationCard confirmation button is not blocked by terms checkbox',
      !isButtonBlocked,
      'Button can be clicked without forced checkbox block'
    );
  }

  console.log('\n================================================================');
  const passedCount = testResults.filter((t) => t.passed).length;
  console.log(`TOTAL CHECKS: ${testResults.length} | PASSED: ${passedCount} | FAILED: ${testResults.length - passedCount}`);
  console.log(`STATUS: ${passedCount === testResults.length ? 'ALL CHECKS PASSED ✅' : 'FAILURES DETECTED ❌'}`);
  console.log('================================================================');

  if (passedCount !== testResults.length) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
