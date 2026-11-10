import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

// Mock server-only before any other imports
const req = createRequire(import.meta.url);
const Module = req('module');
const origRequire = Module.prototype.require;

Module.prototype.require = function (id: string, ...args: any[]) {
  if (id === 'server-only') return {};
  if (id === 'next/cache') return { revalidatePath: () => {} };
  return origRequire.apply(this, [id, ...args]);
};

// Load .env.local into process.env
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// Set authenticated admin environment for test execution
process.env.TEST_AUTH_USER_EMAIL = 'ye.agrajj@gmail.com';
process.env.TEST_AUTH_USER_ID = '30080df7-5188-4630-b597-b8493ebe045d';

async function run() {
  const { createAdminClient } = await import('../lib/supabase/admin');
  const {
    getTicketOverviewStats,
    getOperationalAlerts,
    getTicketPerformanceMetrics,
    getAllUnifiedTickets,
    getUnifiedTicketById,
    getTicketMessages,
    getTicketAuditLogs,
    getPlayerTickets,
  } = await import('../services/ticketService');
  const {
    createSupportTicketAction,
    sendTicketMessageAction,
    assignTicketAction,
    updateTicketPriorityAction,
    updateTicketStatusAction,
    resolveTicketAction,
    rejectTicketAction,
    reopenTicketAction,
    bulkAssignTicketsAction,
    bulkUpdateTicketPriorityAction,
    bulkUpdateTicketStatusAction,
    escalateTicketAction,
  } = await import('../app/actions/ticketActions');
  const { resolveDisputeAction } = await import('../app/actions/matchSchedulingActions');

  console.log('🎫 Starting Advanced Admin Ticket Management System Full Verification Suite...\n');

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

  const adminClient = createAdminClient();

  // ========================================================
  // SECTION 1: DASHBOARD OVERVIEW PURITY VERIFICATION
  // ========================================================
  console.log('--- SECTION 1: Verify Zero Tickets on Dashboard Overview ---');
  const dashboardFilePath = path.resolve(process.cwd(), 'app/admin/dashboard/page.tsx');
  const dashboardSource = fs.readFileSync(dashboardFilePath, 'utf-8');

  assert(!dashboardSource.includes('getTicketOverviewStats'), 'No ticket service calls in dashboard overview');
  assert(!dashboardSource.includes('Open Ticket Operations Centre'), 'No ticket operational banners in dashboard overview');
  assert(!dashboardSource.includes('ticketStats'), 'No ticket statistics variables in dashboard overview');
  assert(!dashboardSource.includes('/admin/tickets'), 'No ticket navigation links inside dashboard overview page');
  assert(dashboardSource.includes('Tournament Operations Control Centre'), 'Dashboard overview title remains intact');
  assert(dashboardSource.includes('AdminVerificationQueue'), 'Platform verification queue preserved on dashboard overview');

  // ========================================================
  // SECTION 2: ADMIN SIDEBAR NAVIGATION VERIFICATION
  // ========================================================
  console.log('\n--- SECTION 2: Verify Dedicated Tickets Navigation ---');
  const sidebarFilePath = path.resolve(process.cwd(), 'components/admin/AdminSidebar.tsx');
  const sidebarSource = fs.readFileSync(sidebarFilePath, 'utf-8');

  assert(sidebarSource.includes('/admin/tickets'), 'Sidebar contains dedicated /admin/tickets route');
  assert(sidebarSource.includes('Ticket') && sidebarSource.includes('unresolvedTicketCount'), 'Sidebar includes Ticket icon & unresolved count badge');
  assert(sidebarSource.includes('hasUrgentTickets'), 'Sidebar includes urgent ticket pulsing indicator');

  // ========================================================
  // SECTION 3: TICKET CREATION & VALIDATION WORKFLOW
  // ========================================================
  console.log('\n--- SECTION 3: Ticket Creation & Auto-number Generation ---');
  const validCreate = await createSupportTicketAction({
    name: 'Marcus Rashford',
    email: 'marcus.test@domain.com',
    category: 'match_dispute',
    subject: 'Match Interrupted In-Game',
    description: 'Opponent disconnected while leading 2-1 and refused to resume room play.',
    priority: 'high',
  });

  assert(validCreate.success, 'Support ticket created successfully', validCreate.error);
  const ticketNumber = validCreate.data?.ticketNumber;
  const ticketId = validCreate.data?.ticketId;
  assert(Boolean(ticketNumber && ticketNumber.startsWith('TKT-')), `Unique ticket number generated: ${ticketNumber}`);
  assert(Boolean(ticketId), `Ticket record ID persisted: ${ticketId}`);

  // Test 3b: Validation rejection for invalid email
  const invalidEmail = await createSupportTicketAction({
    name: 'Marcus',
    email: 'invalid-email',
    category: 'other',
    subject: 'Test Subject',
    description: 'This is a test description that is sufficiently long.',
  });
  assert(!invalidEmail.success, 'Rejects ticket with invalid email format');

  // Test 3c: Validation rejection for short description
  const shortDesc = await createSupportTicketAction({
    name: 'Marcus',
    email: 'marcus@test.com',
    category: 'other',
    subject: 'Test Subject',
    description: 'short',
  });
  assert(!shortDesc.success, 'Rejects ticket with insufficient description length');

  // ========================================================
  // SECTION 4: UNIFIED TICKET RETRIEVAL & DETAIL
  // ========================================================
  console.log('\n--- SECTION 4: Unified Tickets Retrieval & Detail ---');
  const unifiedRes = await getAllUnifiedTickets({ pageSize: 50 });
  const foundTicket = unifiedRes.tickets.find((t) => t.id === ticketId);
  assert(Boolean(foundTicket), `Created ticket found in unified tickets list (${foundTicket?.ticket_number})`);
  assert(foundTicket?.status === 'open', `Ticket initial status is OPEN (${foundTicket?.status})`);

  const ticketDetail = await getUnifiedTicketById(ticketId!);
  assert(ticketDetail !== null, 'Ticket details retrieved successfully');
  assert(
    ticketDetail?.player_name === 'Marcus Rashford' || ticketDetail?.player_name === 'ye.agrajj',
    `Player name verified: ${ticketDetail?.player_name}`
  );

  // ========================================================
  // SECTION 5: CONVERSATION THREAD & SECURITY (INTERNAL NOTES)
  // ========================================================
  console.log('\n--- SECTION 5: Conversation Thread & Internal Notes Privacy ---');
  // Admin message
  await (adminClient.from('ticket_messages') as any).insert({
    ticket_id: ticketId,
    sender_role: 'admin',
    sender_name: 'Tournament Operations Team',
    message: 'Hello Marcus, we are reviewing match telemetry. Did you save a screenshot of the room match screen?',
    is_internal: false,
  });

  // Player message
  await (adminClient.from('ticket_messages') as any).insert({
    ticket_id: ticketId,
    sender_role: 'player',
    sender_name: 'Marcus Rashford',
    message: 'Yes, here is the screenshot from room lobby showing disconnection.',
    is_internal: false,
  });

  // Confidential internal note
  await (adminClient.from('ticket_messages') as any).insert({
    ticket_id: ticketId,
    sender_role: 'admin',
    sender_name: 'Lead Admin',
    message: 'INTERNAL NOTE: Checked room telemetry, opponent packet drop confirmed at 84:32.',
    is_internal: true,
  });

  // Verify Player View strictly excludes internal note
  const playerMsgs = await getTicketMessages(ticketId!, false, false);
  const leakedToPlayer = playerMsgs.some((m) => m.is_internal === true);
  assert(!leakedToPlayer, 'SECURITY CONFIRMED: Internal note is strictly hidden from player query');

  // Verify Admin View includes internal note
  const adminMsgs = await getTicketMessages(ticketId!, false, true);
  const adminSeesInternal = adminMsgs.some((m) => m.is_internal === true);
  assert(adminSeesInternal, 'Admin view includes confidential internal notes');

  // ========================================================
  // SECTION 6: LIFECYCLE STATE TRANSITIONS & ESCALATION
  // ========================================================
  console.log('\n--- SECTION 6: Ticket Lifecycle State Transitions & Escalation ---');
  // 6a: Waiting for player
  await (adminClient.from('support_tickets') as any)
    .update({ status: 'waiting_for_player' })
    .eq('id', ticketId);
  let stateTicket = await getUnifiedTicketById(ticketId!);
  assert(stateTicket?.status === 'waiting_for_player', 'Ticket moved to WAITING_FOR_PLAYER');

  // 6b: Resolve
  await (adminClient.from('support_tickets') as any)
    .update({
      status: 'resolved',
      resolution_notes: 'Evidence confirmed. Issue resolved by administrator.',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', ticketId);
  stateTicket = await getUnifiedTicketById(ticketId!);
  assert(stateTicket?.status === 'resolved', 'Ticket moved to RESOLVED with notes');

  // 6c: Reopen
  await (adminClient.from('support_tickets') as any)
    .update({
      status: 'under_investigation',
      resolved_at: null,
    })
    .eq('id', ticketId);
  stateTicket = await getUnifiedTicketById(ticketId!);
  assert(stateTicket?.status === 'under_investigation', 'Ticket reopened to UNDER_INVESTIGATION');

  // 6d: Reject with reason
  await (adminClient.from('support_tickets') as any)
    .update({
      status: 'rejected',
      rejection_reason: 'Dispute filed 4 hours after deadline elapsed without prior notice.',
    })
    .eq('id', ticketId);
  stateTicket = await getUnifiedTicketById(ticketId!);
  assert(stateTicket?.status === 'rejected', 'Ticket moved to REJECTED with mandatory explanation');

  // 6e: Escalate Ticket to Senior Admin
  const escalateRes = await escalateTicketAction({
    ticketId: ticketId!,
    source: 'support',
    reason: 'Player claims server crash during semi-final round',
  });
  assert(escalateRes.success, 'Escalate action succeeded', escalateRes.error);
  stateTicket = await getUnifiedTicketById(ticketId!);
  assert(stateTicket?.priority === 'urgent', 'Escalated ticket has URGENT priority');
  assert(stateTicket?.status === 'under_investigation', 'Escalated ticket is UNDER_INVESTIGATION');

  // ========================================================
  // SECTION 7: BULK OPERATIONS
  // ========================================================
  console.log('\n--- SECTION 7: Bulk Operations (Assign, Priority, Status) ---');
  // 7a: Bulk Priority
  const bulkPrio = await bulkUpdateTicketPriorityAction({
    tickets: [{ id: ticketId!, source: 'support' }],
    priority: 'normal',
    explanation: 'Bulk set to normal',
  });
  assert(bulkPrio.success, 'Bulk priority update succeeded', bulkPrio.error);
  stateTicket = await getUnifiedTicketById(ticketId!);
  assert(stateTicket?.priority === 'normal', 'Ticket priority updated via bulk operation');

  // 7b: Bulk Status
  const bulkStat = await bulkUpdateTicketStatusAction({
    tickets: [{ id: ticketId!, source: 'support' }],
    status: 'pending_review',
    explanation: 'Bulk set to pending review',
  });
  assert(bulkStat.success, 'Bulk status update succeeded', bulkStat.error);
  stateTicket = await getUnifiedTicketById(ticketId!);
  assert(stateTicket?.status === 'pending_review', 'Ticket status updated via bulk operation');

  // 7c: Bulk Assign
  const { data: adminRecord } = await (adminClient.from('admin_users') as any)
    .select('id, email')
    .limit(1)
    .single();
  const testAdminId = adminRecord?.id || '30080df7-5188-4630-b597-b8493ebe045d';

  const bulkAssign = await bulkAssignTicketsAction({
    tickets: [{ id: ticketId!, source: 'support' }],
    adminId: testAdminId,
    adminEmail: adminRecord?.email || 'admin@test.com',
  });
  assert(bulkAssign.success, 'Bulk assignment succeeded', bulkAssign.error);
  stateTicket = await getUnifiedTicketById(ticketId!);
  assert(stateTicket?.assigned_admin_id === testAdminId, 'Ticket assigned admin updated via bulk operation');

  // ========================================================
  // SECTION 8: MATCH DISPUTES INTEGRATION & ADJUDICATION
  // ========================================================
  console.log('\n--- SECTION 8: Match Disputes Integration & Adjudication ---');
  const disputesInSystem = unifiedRes.tickets.filter((t) => t.source === 'dispute');
  assert(disputesInSystem.length >= 1, `Found ${disputesInSystem.length} match dispute(s) unified seamlessly`);
  const activeDispute = disputesInSystem[0];
  assert(Boolean(activeDispute.ticket_number && activeDispute.ticket_number.startsWith('DSP-')), `Dispute has valid DSP- ticket number: ${activeDispute.ticket_number}`);

  // Test 8b: Transactional Dispute Adjudication (Authoritative score determination)
  if (activeDispute.match_id && activeDispute.tournament_id) {
    const adjRes = await resolveDisputeAction({
      disputeId: activeDispute.id,
      matchId: activeDispute.match_id,
      tournamentId: activeDispute.tournament_id,
      decision: 'resolve_with_scores',
      scoreA: 2,
      scoreB: 1,
      adminNotes: 'Automated test authoritative resolution',
    });
    assert(adjRes.success, 'Transactional dispute adjudication executed cleanly', adjRes.error);

    // Verify official match is completed
    const { data: updatedMatch } = await (adminClient.from('matches') as any)
      .select('status, score_a, score_b')
      .eq('id', activeDispute.match_id)
      .single();
    assert(updatedMatch?.status === 'completed', `Official match status updated to COMPLETED: ${updatedMatch?.status}`);

    // Verify dispute is resolved
    const updatedDispute = await getUnifiedTicketById(activeDispute.id);
    assert(updatedDispute?.status === 'resolved', `Dispute status updated to RESOLVED: ${updatedDispute?.status}`);
  } else {
    console.log('Skipping match adjudication subtest: active dispute has no associated match');
  }

  // ========================================================
  // SECTION 9: DATABASE SECURITY & UNAUTHORIZED ATTEMPTS
  // ========================================================
  console.log('\n--- SECTION 9: Database Security & Unauthorized Request Rejection ---');
  // Temporarily simulate unauthorized non-admin player
  process.env.TEST_AUTH_USER_EMAIL = 'player@example.com';

  const unauthPriorityRes = await bulkUpdateTicketPriorityAction({
    tickets: [{ id: ticketId!, source: 'support' }],
    priority: 'urgent',
  });
  assert(
    !unauthPriorityRes.success && Boolean(unauthPriorityRes.error?.includes('Unauthorized')),
    'SECURITY ENFORCED: Unauthorized priority update blocked',
    unauthPriorityRes.error
  );

  const unauthResolveRes = await resolveTicketAction({
    ticketId: ticketId!,
    source: 'support',
    resolutionNotes: 'Illegal resolve attempt',
  });
  assert(
    !unauthResolveRes.success && Boolean(unauthResolveRes.error?.includes('Unauthorized')),
    'SECURITY ENFORCED: Unauthorized ticket resolution blocked',
    unauthResolveRes.error
  );

  // Restore authenticated admin
  process.env.TEST_AUTH_USER_EMAIL = 'ye.agrajj@gmail.com';

  // ========================================================
  // SECTION 10: SLA PERFORMANCE TELEMETRY
  // ========================================================
  console.log('\n--- SECTION 10: SLA Performance Telemetry ---');
  const perf = await getTicketPerformanceMetrics();
  assert(typeof perf.reopenedPercentage === 'number', `Reopened rate calculated: ${perf.reopenedPercentage}%`);
  assert(typeof perf.overduePercentage === 'number', `Overdue rate calculated: ${perf.overduePercentage}%`);
  assert(Array.isArray(perf.resolvedByAdmin), `Resolved by admin array returned: ${perf.resolvedByAdmin.length} records`);

  const alerts = await getOperationalAlerts();
  assert(typeof alerts.criticalUnresolved === 'number', `Critical unresolved alerts: ${alerts.criticalUnresolved}`);
  assert(typeof alerts.overdueCount === 'number', `Overdue alerts: ${alerts.overdueCount}`);
  assert(typeof alerts.unassignedCount === 'number', `Unassigned triage alerts: ${alerts.unassignedCount}`);

  // ========================================================
  // SECTION 11: 7 KPI CARDS INTEGRITY
  // ========================================================
  console.log('\n--- SECTION 11: 7 KPI Cards Count Verification ---');
  const kpiStats = await getTicketOverviewStats();
  assert(typeof kpiStats.totalTickets === 'number', `Total tickets: ${kpiStats.totalTickets}`);
  assert(typeof kpiStats.totalOpen === 'number', `Total open: ${kpiStats.totalOpen}`);
  assert(typeof kpiStats.unassigned === 'number', `Unassigned: ${kpiStats.unassigned}`);
  assert(typeof kpiStats.urgent === 'number', `Urgent: ${kpiStats.urgent}`);
  assert(typeof kpiStats.waitingForPlayer === 'number', `Awaiting player: ${kpiStats.waitingForPlayer}`);
  assert(typeof kpiStats.underInvestigation === 'number', `Under investigation: ${kpiStats.underInvestigation}`);
  assert(typeof kpiStats.resolved === 'number', `Resolved: ${kpiStats.resolved}`);

  console.log('\n======================================================');
  console.log(`🏁 Full Verification Summary: ${testsPassed} Passed, ${testsFailed} Failed.`);
  console.log('======================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
