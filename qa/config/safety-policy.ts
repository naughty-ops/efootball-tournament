/**
 * QA Safety Policy Gate
 * 
 * Enforces non-destructive boundaries across test executions:
 * - Never modify actual real user records or balances
 * - Isolated QA tournament prefix: [QA-AUTONOMOUS]
 * - Test emails strictly restricted to *.test.internal or QA designated IDs
 * - Zero real money or real external SMS/WhatsApp calls
 */

export const SAFETY_POLICY = {
  tournamentPrefix: '[QA-AUTONOMOUS]',
  testEmailDomain: '@test.internal',
  allowRealPayouts: false,
  allowExternalNotifications: false,
  allowDestructiveDatabaseDrops: false,

  isSafeTestEmail(email: string): boolean {
    return email.endsWith(this.testEmailDomain) || email.startsWith('qa_') || email.includes('recovery_tester');
  },

  isSafeTestTournament(title: string): boolean {
    return title.includes('[QA-AUTONOMOUS]') || title.includes('QA MASTER LEAGUE');
  },

  assertSafeTarget(actionDescription: string, isProduction: boolean) {
    if (isProduction && !actionDescription.startsWith('READ_ONLY_')) {
      throw new Error(`SAFETY GATE BLOCK: Destructive/Stateful action '${actionDescription}' is strictly forbidden on production.`);
    }
  }
};
