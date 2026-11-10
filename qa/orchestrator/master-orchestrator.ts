import { AgentManager } from './agent-manager';
import { ExecutionTracker } from './execution-tracker';
import { EvidenceManager } from './evidence-manager';
import { ReportGenerator } from './report-generator';
import { ENV, VIEWPORTS } from '../config/environments';

// Import all 10 independent agents
import { runAgent01Auth } from '../agents/agent-01-auth';
import { runAgent02Profile } from '../agents/agent-02-profile';
import { runAgent03Discovery } from '../agents/agent-03-discovery';
import { runAgent04Registration } from '../agents/agent-04-registration';
import { runAgent05Match } from '../agents/agent-05-match';
import { runAgent06Disputes } from '../agents/agent-06-disputes';
import { runAgent07Wallet } from '../agents/agent-07-wallet';
import { runAgent08Admin } from '../agents/agent-08-admin';
import { runAgent09Security } from '../agents/agent-09-security';
import { runAgent10Performance } from '../agents/agent-10-performance';

// Import 20-Player Tournament Simulation
import { runTwentyPlayerTournamentSimulation } from '../scenarios/complete-tournament/twenty-player-simulation';

export async function runMasterQAOrchestrator() {
  console.log('========================================================================');
  console.log('      MASTER QA ORCHESTRATOR: 10-AGENT AUTONOMOUS SYSTEM VERIFICATION   ');
  console.log('========================================================================\n');
  console.log(`🎯 Active Target URL: ${ENV.activeTarget}`);
  console.log(`🌐 Production Baseline: ${ENV.productionUrl}`);
  console.log(`⚡ Supabase Host: ${ENV.supabaseUrl ? new URL(ENV.supabaseUrl).host : 'Mock/Offline'}\n`);

  const agentManager = new AgentManager();
  const tracker = ExecutionTracker.getInstance();
  const evidence = new EvidenceManager();
  const reporter = new ReportGenerator();

  try {
    await agentManager.initialize();

    // 1. Run Agent 01: Authentication
    console.log('🚀 Spawning Agent 01 (Auth)...');
    const a1 = await agentManager.createAgentContext('AGENT-01-AUTH', 'Authentication Worker', VIEWPORTS.desktopFHD);
    await runAgent01Auth(a1.page, tracker, evidence);
    await agentManager.closeAgent('AGENT-01-AUTH');

    // 2. Run Agent 02: Profile & Identity
    console.log('🚀 Spawning Agent 02 (Profile)...');
    const a2 = await agentManager.createAgentContext('AGENT-02-PROFILE', 'Profile Worker', VIEWPORTS.desktopFHD);
    await runAgent02Profile(a2.page, tracker, evidence);
    await agentManager.closeAgent('AGENT-02-PROFILE');

    // 3. Run Agent 03: Tournament Discovery
    console.log('🚀 Spawning Agent 03 (Discovery)...');
    const a3 = await agentManager.createAgentContext('AGENT-03-DISCOVERY', 'Discovery Worker', VIEWPORTS.desktopFHD);
    await runAgent03Discovery(a3.page, tracker, evidence);
    await agentManager.closeAgent('AGENT-03-DISCOVERY');

    // 4. Run Agent 04: Registration Engine
    console.log('🚀 Spawning Agent 04 (Registration)...');
    const a4 = await agentManager.createAgentContext('AGENT-04-REGISTRATION', 'Registration Worker', VIEWPORTS.desktopFHD);
    await runAgent04Registration(a4.page, tracker, evidence);
    await agentManager.closeAgent('AGENT-04-REGISTRATION');

    // 5. Run Agent 05: Match Engine
    console.log('🚀 Spawning Agent 05 (Match)...');
    const a5 = await agentManager.createAgentContext('AGENT-05-MATCH', 'Match Worker', VIEWPORTS.desktopFHD);
    await runAgent05Match(a5.page, tracker, evidence);
    await agentManager.closeAgent('AGENT-05-MATCH');

    // 6. Run Agent 06: Disputes & Evidence
    console.log('🚀 Spawning Agent 06 (Disputes)...');
    const a6 = await agentManager.createAgentContext('AGENT-06-DISPUTES', 'Disputes Worker', VIEWPORTS.desktopFHD);
    await runAgent06Disputes(a6.page, tracker, evidence);
    await agentManager.closeAgent('AGENT-06-DISPUTES');

    // 7. Run Agent 07: Wallet & Financial Ledger
    console.log('🚀 Spawning Agent 07 (Wallet)...');
    const a7 = await agentManager.createAgentContext('AGENT-07-WALLET', 'Wallet Worker', VIEWPORTS.desktopFHD);
    await runAgent07Wallet(a7.page, tracker, evidence);
    await agentManager.closeAgent('AGENT-07-WALLET');

    // 8. Run Agent 08: Tournament Administrator
    console.log('🚀 Spawning Agent 08 (Admin)...');
    const a8 = await agentManager.createAgentContext('AGENT-08-ADMIN', 'Admin Worker', VIEWPORTS.desktopFHD);
    await runAgent08Admin(a8.page, tracker, evidence);
    await agentManager.closeAgent('AGENT-08-ADMIN');

    // 9. Run Agent 09: Super Admin & Security
    console.log('🚀 Spawning Agent 09 (Security)...');
    const a9 = await agentManager.createAgentContext('AGENT-09-SECURITY', 'Security Worker', VIEWPORTS.desktopFHD);
    await runAgent09Security(a9.page, tracker, evidence);
    await agentManager.closeAgent('AGENT-09-SECURITY');

    // 10. Run Agent 10: Performance & Compatibility
    console.log('🚀 Spawning Agent 10 (Performance)...');
    const a10 = await agentManager.createAgentContext('AGENT-10-PERFORMANCE', 'Performance Worker', VIEWPORTS.desktopFHD);
    await runAgent10Performance(a10.page, tracker, evidence);
    await agentManager.closeAgent('AGENT-10-PERFORMANCE');

    // PART 4: Run Mandatory 20-Player League Simulation (Berger Round-Robin)
    console.log('\n🌟 Launching Mandatory 20-Player League Simulation...');
    const simResult = await runTwentyPlayerTournamentSimulation(tracker, evidence);

    // Generate All 16 QA Reports
    reporter.generateAllReports(simResult);

    // Print summary to console
    const summary = tracker.getSummary();
    console.log('========================================================================');
    console.log(`🏁 MISSION SUMMARY: ${summary.passed}/${summary.total} Passed (${summary.passRate}) | P0: ${summary.criticalBugs} | P1: ${summary.highBugs}`);
    console.log('========================================================================\n');
  } catch (err: any) {
    console.error('❌ Master Orchestrator Fatal Exception:', err);
  } finally {
    await agentManager.shutdown();
  }
}

// Allow direct CLI execution
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  runMasterQAOrchestrator().catch(console.error);
}
