import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  UnifiedTicket,
  TicketOverviewStats,
  OperationalAlerts,
  TicketPerformanceMetrics,
  TicketFilterParams,
  PaginatedTicketsResult,
  TicketMessage,
  TicketAuditLog,
  TicketStatus,
  TicketPriority,
  TicketView,
} from '@/types/tickets';

/**
 * Normalizes legacy and current status strings into strict TicketStatus
 */
export function normalizeTicketStatus(rawStatus?: string | null): TicketStatus {
  if (!rawStatus) return 'open';
  const s = rawStatus.toLowerCase().trim();
  if (s === 'under_review') return 'under_investigation';
  if (s === 'open') return 'open';
  if (s === 'pending_review') return 'pending_review';
  if (s === 'under_investigation') return 'under_investigation';
  if (s === 'waiting_for_player') return 'waiting_for_player';
  if (s === 'resolved') return 'resolved';
  if (s === 'rejected') return 'rejected';
  if (s === 'closed') return 'closed';
  return 'open';
}

/**
 * Normalizes dispute reason into user-friendly ticket category
 */
export function normalizeDisputeCategory(reason?: string | null): string {
  if (!reason) return 'match_dispute';
  const r = reason.toLowerCase().trim();
  if (r === 'conflicting_scores') return 'score_disagreement';
  if (r === 'opponent_no_show') return 'match_not_started';
  if (r === 'timeout_no_result') return 'match_not_completed';
  if (r === 'connection_failure') return 'technical_support';
  if (r === 'refusing_to_play') return 'player_complaint';
  if (r === 'incorrect_walkover') return 'match_dispute';
  return 'match_dispute';
}

/**
 * Computes human-readable relative ticket age
 */
export function formatTicketAge(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'Just now';
}

/**
 * Calculates response/resolution deadline and status
 * - Match disputes have a strict 2-hour SLA
 * - General inquiries have a 24-hour SLA
 */
export function calculateTicketDeadline(
  createdAt: string,
  isDispute: boolean,
  status: TicketStatus
): { deadlineIso: string; status: 'overdue' | 'approaching' | 'healthy'; isOverdue: boolean } {
  const createdMs = new Date(createdAt).getTime();
  const slaHours = isDispute ? 2 : 24;
  const deadlineMs = createdMs + slaHours * 60 * 60 * 1000;
  const deadlineIso = new Date(deadlineMs).toISOString();

  const isClosed = status === 'resolved' || status === 'rejected' || status === 'closed';
  if (isClosed) {
    return { deadlineIso, status: 'healthy', isOverdue: false };
  }

  const nowMs = Date.now();
  const remainingMs = deadlineMs - nowMs;

  if (remainingMs < 0) {
    return { deadlineIso, status: 'overdue', isOverdue: true };
  }

  // Approaching if less than 1 hour remaining for disputes or 4 hours for general
  const warningThresholdMs = isDispute ? 60 * 60 * 1000 : 4 * 60 * 60 * 1000;
  if (remainingMs <= warningThresholdMs) {
    return { deadlineIso, status: 'approaching', isOverdue: false };
  }

  return { deadlineIso, status: 'healthy', isOverdue: false };
}

/**
 * Computes high-level ticket KPI statistics across both support tickets and match disputes
 */
export async function getTicketOverviewStats(): Promise<TicketOverviewStats> {
  const adminClient = createAdminClient();

  const [
    supportTicketsRes,
    disputesRes,
  ] = await Promise.all([
    (adminClient.from('support_tickets') as any).select('id, status, priority, assigned_admin_id, created_at, updated_at'),
    (adminClient.from('match_disputes') as any).select('id, status, priority, assigned_admin_id, created_at, updated_at'),
  ]);

  const supportTickets = (supportTicketsRes.data || []) as any[];
  const disputes = (disputesRes.data || []) as any[];

  const allItems = [
    ...supportTickets.map((t) => {
      const st = normalizeTicketStatus(t.status);
      const dl = calculateTicketDeadline(t.created_at, false, st);
      return {
        status: st,
        priority: (t.priority || 'normal') as TicketPriority,
        isAssigned: Boolean(t.assigned_admin_id),
        updatedAt: new Date(t.updated_at || Date.now()).getTime(),
        isOverdue: dl.isOverdue,
      };
    }),
    ...disputes.map((d) => {
      const st = normalizeTicketStatus(d.status);
      const dl = calculateTicketDeadline(d.created_at, true, st);
      return {
        status: st,
        priority: (d.priority || 'high') as TicketPriority,
        isAssigned: Boolean(d.assigned_admin_id),
        updatedAt: new Date(d.updated_at || Date.now()).getTime(),
        isOverdue: dl.isOverdue,
      };
    }),
  ];

  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

  let totalTickets = allItems.length;
  let totalOpen = 0;
  let pendingReview = 0;
  let underInvestigation = 0;
  let resolved = 0;
  let rejected = 0;
  let urgent = 0;
  let highPriority = 0;
  let normalPriority = 0;
  let unassigned = 0;
  let waitingForPlayer = 0;
  let recentlyUpdated = 0;
  let overdueCount = 0;

  for (const item of allItems) {
    const isClosedOrResolved = item.status === 'resolved' || item.status === 'rejected' || item.status === 'closed';

    if (!isClosedOrResolved) {
      totalOpen++;
      if (!item.isAssigned) unassigned++;
      if (item.priority === 'urgent') urgent++;
      if (item.priority === 'high') highPriority++;
      if (item.priority === 'normal') normalPriority++;
      if (item.isOverdue) overdueCount++;
    }

    if (item.status === 'pending_review' || (item.status === 'open' && !item.isAssigned)) {
      pendingReview++;
    }
    if (item.status === 'under_investigation') {
      underInvestigation++;
    }
    if (item.status === 'waiting_for_player') {
      waitingForPlayer++;
    }
    if (item.status === 'resolved' || item.status === 'closed') {
      resolved++;
    }
    if (item.status === 'rejected') {
      rejected++;
    }
    if (item.updatedAt >= twentyFourHoursAgo) {
      recentlyUpdated++;
    }
  }

  return {
    totalTickets,
    totalOpen,
    pendingReview,
    underInvestigation,
    resolved,
    rejected,
    urgent,
    highPriority,
    normalPriority,
    unassigned,
    waitingForPlayer,
    recentlyUpdated,
    overdueCount,
  };
}

/**
 * Computes live operational alerts across active tickets
 */
export async function getOperationalAlerts(): Promise<OperationalAlerts> {
  const result = await getAllUnifiedTickets({ pageSize: 200, page: 1 });
  const tickets = result.tickets;

  let criticalUnresolved = 0;
  let approachingDeadline = 0;
  let overdueCount = 0;
  let unassignedCount = 0;
  let newPlayerResponses = 0;
  let disputesNeedingAction = 0;

  for (const t of tickets) {
    const isClosed = t.status === 'resolved' || t.status === 'rejected' || t.status === 'closed';
    if (isClosed) continue;

    if (t.priority === 'urgent') {
      criticalUnresolved++;
    }
    if (t.deadline_status === 'approaching') {
      approachingDeadline++;
    }
    if (t.is_overdue) {
      overdueCount++;
    }
    if (!t.assigned_admin_id) {
      unassignedCount++;
    }
    if (t.status === 'pending_review') {
      newPlayerResponses++;
    }
    if (t.source === 'dispute') {
      disputesNeedingAction++;
    }
  }

  return {
    criticalUnresolved,
    approachingDeadline,
    overdueCount,
    unassignedCount,
    newPlayerResponses,
    disputesNeedingAction,
  };
}

/**
 * Computes accountability & SLA performance metrics using actual timestamps
 */
export async function getTicketPerformanceMetrics(): Promise<TicketPerformanceMetrics> {
  const adminClient = createAdminClient();

  const [supportRes, disputesRes, auditLogsRes, messagesRes] = await Promise.all([
    (adminClient.from('support_tickets') as any).select('id, created_at, resolved_at, resolved_by, status'),
    (adminClient.from('match_disputes') as any).select('id, created_at, resolved_at, resolved_by, status'),
    (adminClient.from('ticket_audit_logs') as any).select('id, ticket_id, dispute_id, action, created_at'),
    (adminClient.from('ticket_messages') as any).select('ticket_id, dispute_id, sender_role, created_at').order('created_at', { ascending: true }),
  ]);

  const supportTickets = (supportRes.data || []) as any[];
  const disputes = (disputesRes.data || []) as any[];
  const auditLogs = (auditLogsRes.data || []) as any[];
  const messages = (messagesRes.data || []) as any[];

  // 1. First Response Time (time between ticket creation and first admin message)
  const firstAdminMsgMap = new Map<string, number>();
  for (const msg of messages) {
    const targetId = msg.ticket_id || msg.dispute_id;
    if (targetId && msg.sender_role === 'admin' && !firstAdminMsgMap.has(targetId)) {
      firstAdminMsgMap.set(targetId, new Date(msg.created_at).getTime());
    }
  }

  const allTicketsCombined = [
    ...supportTickets.map((t) => ({ ...t, isDispute: false })),
    ...disputes.map((d) => ({ ...d, isDispute: true })),
  ];

  let totalResponseDiffMs = 0;
  let responseCount = 0;
  for (const t of allTicketsCombined) {
    const firstAdminMs = firstAdminMsgMap.get(t.id);
    if (firstAdminMs) {
      const createdMs = new Date(t.created_at).getTime();
      const diffMs = firstAdminMs - createdMs;
      if (diffMs >= 0) {
        totalResponseDiffMs += diffMs;
        responseCount++;
      }
    }
  }

  const avgFirstResponseMinutes = responseCount > 0 ? Math.round(totalResponseDiffMs / (responseCount * 60 * 1000)) : null;

  // 2. Average Resolution Time (overall and disputes)
  let totalResolutionDiffMs = 0;
  let resolvedCount = 0;
  let totalDisputeResDiffMs = 0;
  let resolvedDisputesCount = 0;

  for (const t of allTicketsCombined) {
    if (t.resolved_at && (t.status === 'resolved' || t.status === 'closed')) {
      const createdMs = new Date(t.created_at).getTime();
      const resolvedMs = new Date(t.resolved_at).getTime();
      const diffMs = resolvedMs - createdMs;
      if (diffMs >= 0) {
        totalResolutionDiffMs += diffMs;
        resolvedCount++;

        if (t.isDispute) {
          totalDisputeResDiffMs += diffMs;
          resolvedDisputesCount++;
        }
      }
    }
  }

  const avgResolutionHours = resolvedCount > 0 ? Number((totalResolutionDiffMs / (resolvedCount * 3600 * 1000)).toFixed(1)) : null;
  const avgDisputeResolutionHours = resolvedDisputesCount > 0 ? Number((totalDisputeResDiffMs / (resolvedDisputesCount * 3600 * 1000)).toFixed(1)) : null;

  // 3. Reopened Ticket Percentage
  const reopenedTicketIds = new Set<string>();
  for (const log of auditLogs) {
    if (log.action === 'ticket_reopened') {
      const id = log.ticket_id || log.dispute_id;
      if (id) reopenedTicketIds.add(id);
    }
  }
  const reopenedPercentage = allTicketsCombined.length > 0 ? Math.round((reopenedTicketIds.size / allTicketsCombined.length) * 100) : 0;

  // 4. Overdue Ticket Percentage
  let overdueCount = 0;
  for (const t of allTicketsCombined) {
    const st = normalizeTicketStatus(t.status);
    const dl = calculateTicketDeadline(t.created_at, t.isDispute, st);
    if (dl.isOverdue) overdueCount++;
  }
  const overduePercentage = allTicketsCombined.length > 0 ? Math.round((overdueCount / allTicketsCombined.length) * 100) : 0;

  // 5. Tickets Resolved Per Administrator
  const adminResolutionMap = new Map<string, number>();
  for (const t of allTicketsCombined) {
    if (t.resolved_by && (t.status === 'resolved' || t.status === 'closed')) {
      const current = adminResolutionMap.get(t.resolved_by) || 0;
      adminResolutionMap.set(t.resolved_by, current + 1);
    }
  }

  const resolvedByAdmin = Array.from(adminResolutionMap.entries()).map(([adminId, count]) => ({
    adminEmail: adminId, // Will display ID/admin handle
    count,
  }));

  return {
    avgFirstResponseMinutes,
    avgResolutionHours,
    avgDisputeResolutionHours,
    reopenedPercentage,
    overduePercentage,
    resolvedByAdmin,
  };
}

/**
 * Fetches recent tickets (both disputes and support) for the dashboard ticker
 */
export async function getRecentTickets(limit: number = 8): Promise<UnifiedTicket[]> {
  const result = await getAllUnifiedTickets({ pageSize: limit, page: 1, sortBy: 'newest' });
  return result.tickets;
}

/**
 * Fetches unified paginated and filtered tickets across support_tickets and match_disputes
 */
export async function getAllUnifiedTickets(params: TicketFilterParams = {}): Promise<PaginatedTicketsResult> {
  const adminClient = createAdminClient();
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(1, Math.min(100, params.pageSize || 10));

  // Query support tickets
  let stQuery = (adminClient.from('support_tickets') as any)
    .select(`
      id, ticket_number, user_id, player_name, player_email, category,
      subject, description, priority, status, assigned_admin_id,
      tournament_id, match_id, evidence_url, evidence_public_id,
      resolution_notes, rejection_reason, resolved_by, resolved_at,
      created_at, updated_at
    `);

  // Query match disputes
  let mdQuery = (adminClient.from('match_disputes') as any)
    .select(`
      id, ticket_number, tournament_id, match_id, reporter_participant_id,
      opponent_participant_id, reason, details, evidence_url, status,
      priority, assigned_admin_id, admin_notes, resolution_action,
      resolved_by, resolved_at, created_at, updated_at,
      reporter_screenshot_url, opponent_screenshot_url,
      reporter_score_a, reporter_score_b, opponent_score_a, opponent_score_b
    `);

  const [stRes, mdRes] = await Promise.all([stQuery, mdQuery]);

  const rawSupport = (stRes.data || []) as any[];
  const rawDisputes = (mdRes.data || []) as any[];

  // Fetch participant, profile, tournament and match reference maps to enrich objects without N+1
  const participantIds = Array.from(
    new Set(rawDisputes.flatMap((d) => [d.reporter_participant_id, d.opponent_participant_id]).filter(Boolean))
  ) as string[];

  const tournamentIds = Array.from(
    new Set([...rawSupport.map((s) => s.tournament_id), ...rawDisputes.map((d) => d.tournament_id)].filter(Boolean))
  ) as string[];

  const matchIds = Array.from(
    new Set([...rawSupport.map((s) => s.match_id), ...rawDisputes.map((d) => d.match_id)].filter(Boolean))
  ) as string[];

  const userIds = Array.from(
    new Set(rawSupport.map((s) => s.user_id).filter(Boolean))
  ) as string[];

  const [participantsRes, tournamentsRes, profilesRes, matchesRes] = await Promise.all([
    participantIds.length > 0
      ? (adminClient.from('participants') as any).select('id, user_id, username, real_name').in('id', participantIds)
      : Promise.resolve({ data: [] }),
    tournamentIds.length > 0
      ? (adminClient.from('tournaments') as any).select('id, name').in('id', tournamentIds)
      : Promise.resolve({ data: [] }),
    userIds.length > 0
      ? (adminClient.from('profiles') as any).select('id, display_name, efootball_id, whatsapp_verified, whatsapp_number, account_status, avatar_url').in('id', userIds)
      : Promise.resolve({ data: [] }),
    matchIds.length > 0
      ? (adminClient.from('matches') as any).select('id, scheduled_time, actual_start_time, status').in('id', matchIds)
      : Promise.resolve({ data: [] }),
  ]);

  const participantMap = new Map<string, any>((participantsRes.data || []).map((p: any) => [p.id, p]));
  const tournamentMap = new Map<string, string>((tournamentsRes.data || []).map((t: any) => [t.id, t.name]));
  const profileMap = new Map<string, any>((profilesRes.data || []).map((pr: any) => [pr.id, pr]));
  const matchMap = new Map<string, any>((matchesRes.data || []).map((m: any) => [m.id, m]));

  // Map Support Tickets into UnifiedTicket
  const supportTickets: UnifiedTicket[] = rawSupport.map((st) => {
    const profile = st.user_id ? profileMap.get(st.user_id) : null;
    const matchData = st.match_id ? matchMap.get(st.match_id) : null;
    const normalizedStatus = normalizeTicketStatus(st.status);
    const deadline = calculateTicketDeadline(st.created_at, false, normalizedStatus);

    return {
      id: st.id,
      source: 'support',
      ticket_number: st.ticket_number,
      category: st.category,
      subject: st.subject,
      description: st.description,
      priority: (st.priority || 'normal') as TicketPriority,
      status: normalizedStatus,
      created_at: st.created_at,
      updated_at: st.updated_at,
      resolved_at: st.resolved_at,
      resolved_by: st.resolved_by,
      resolution_notes: st.resolution_notes,
      rejection_reason: st.rejection_reason,
      assigned_admin_id: st.assigned_admin_id,
      ticket_age_str: formatTicketAge(st.created_at),
      is_overdue: deadline.isOverdue,
      response_deadline_iso: deadline.deadlineIso,
      deadline_status: deadline.status,
      has_new_player_reply: normalizedStatus === 'pending_review',
      user_id: st.user_id,
      player_name: profile?.display_name || st.player_name || 'Player',
      player_email: st.player_email || '',
      efootball_id: profile?.efootball_id || null,
      whatsapp_verified: profile?.whatsapp_verified ?? false,
      whatsapp_number: profile?.whatsapp_number || null,
      account_status: profile?.account_status || 'active',
      avatar_url: profile?.avatar_url || null,
      tournament_id: st.tournament_id,
      tournament_name: st.tournament_id ? tournamentMap.get(st.tournament_id) || 'Tournament' : null,
      match_id: st.match_id,
      match_scheduled_time: matchData?.scheduled_time || null,
      match_actual_start_time: matchData?.actual_start_time || null,
      match_status: matchData?.status || null,
      evidence_url: st.evidence_url,
      evidence_public_id: st.evidence_public_id,
    };
  });

  // Map Match Disputes into UnifiedTicket
  const disputeTickets: UnifiedTicket[] = rawDisputes.map((d) => {
    const reporter = participantMap.get(d.reporter_participant_id);
    const opponent = d.opponent_participant_id ? participantMap.get(d.opponent_participant_id) : null;
    const matchData = d.match_id ? matchMap.get(d.match_id) : null;
    const readableReason = (d.reason || 'match_dispute').replace(/_/g, ' ');
    const normalizedStatus = normalizeTicketStatus(d.status);
    const deadline = calculateTicketDeadline(d.created_at, true, normalizedStatus);

    return {
      id: d.id,
      source: 'dispute',
      ticket_number: d.ticket_number,
      category: normalizeDisputeCategory(d.reason),
      subject: `Match Dispute: ${readableReason.charAt(0).toUpperCase() + readableReason.slice(1)}`,
      description: d.details || `Official match dispute filed by ${reporter?.real_name || reporter?.username || 'participant'}. Reason: ${readableReason}`,
      priority: (d.priority || 'high') as TicketPriority,
      status: normalizedStatus,
      created_at: d.created_at,
      updated_at: d.updated_at,
      resolved_at: d.resolved_at,
      resolved_by: d.resolved_by,
      resolution_notes: d.admin_notes,
      assigned_admin_id: d.assigned_admin_id,
      ticket_age_str: formatTicketAge(d.created_at),
      is_overdue: deadline.isOverdue,
      response_deadline_iso: deadline.deadlineIso,
      deadline_status: deadline.status,
      has_new_player_reply: normalizedStatus === 'pending_review',
      player_id: d.reporter_participant_id,
      player_name: reporter?.real_name || reporter?.username || 'Reporter Player',
      player_email: '',
      tournament_id: d.tournament_id,
      tournament_name: d.tournament_id ? tournamentMap.get(d.tournament_id) || 'Tournament' : null,
      match_id: d.match_id,
      match_scheduled_time: matchData?.scheduled_time || null,
      match_actual_start_time: matchData?.actual_start_time || null,
      match_status: matchData?.status || null,
      opponent_id: d.opponent_participant_id,
      opponent_name: opponent ? opponent.real_name || opponent.username || 'Opponent' : null,
      evidence_url: d.evidence_url || d.reporter_screenshot_url || d.opponent_screenshot_url,
      reporter_screenshot_url: d.reporter_screenshot_url,
      opponent_screenshot_url: d.opponent_screenshot_url,
      reporter_score_a: d.reporter_score_a,
      reporter_score_b: d.reporter_score_b,
      opponent_score_a: d.opponent_score_a,
      opponent_score_b: d.opponent_score_b,
    };
  });

  let unified = [...supportTickets, ...disputeTickets];

  // View Presets
  const view = (params.view || 'all').toLowerCase();
  if (view === 'my_assigned' && params.currentAdminEmail) {
    unified = unified.filter((t) => t.assigned_admin_id === params.currentAdminEmail || t.assigned_admin_id === 'admin');
  } else if (view === 'unassigned') {
    unified = unified.filter((t) => !t.assigned_admin_id && t.status !== 'resolved' && t.status !== 'closed' && t.status !== 'rejected');
  } else if (view === 'urgent') {
    unified = unified.filter((t) => t.priority === 'urgent');
  } else if (view === 'disputes') {
    unified = unified.filter((t) => t.source === 'dispute');
  } else if (view === 'support') {
    unified = unified.filter((t) => t.source === 'support');
  } else if (view === 'awaiting_player') {
    unified = unified.filter((t) => t.status === 'waiting_for_player');
  } else if (view === 'overdue') {
    unified = unified.filter((t) => t.is_overdue && t.status !== 'resolved' && t.status !== 'closed' && t.status !== 'rejected');
  } else if (view === 'resolved') {
    unified = unified.filter((t) => t.status === 'resolved');
  } else if (view === 'rejected') {
    unified = unified.filter((t) => t.status === 'rejected');
  }

  // Individual Filtering
  if (params.status && params.status !== 'all') {
    const targetStatus = normalizeTicketStatus(params.status);
    unified = unified.filter((t) => t.status === targetStatus);
  }

  if (params.category && params.category !== 'all') {
    unified = unified.filter((t) => t.category.toLowerCase() === params.category!.toLowerCase());
  }

  if (params.priority && params.priority !== 'all') {
    unified = unified.filter((t) => t.priority === params.priority);
  }

  if (params.unassigned) {
    unified = unified.filter((t) => !t.assigned_admin_id && t.status !== 'resolved' && t.status !== 'closed');
  }

  if (params.overdue) {
    unified = unified.filter((t) => t.is_overdue);
  }

  if (params.assignedAdminId && params.assignedAdminId !== 'all') {
    unified = unified.filter((t) => t.assigned_admin_id === params.assignedAdminId);
  }

  if (params.tournamentId && params.tournamentId !== 'all') {
    unified = unified.filter((t) => t.tournament_id === params.tournamentId);
  }

  if (params.matchId && params.matchId !== 'all') {
    unified = unified.filter((t) => t.match_id === params.matchId);
  }

  if (params.search && params.search.trim() !== '') {
    const q = params.search.toLowerCase().trim();
    unified = unified.filter(
      (t) =>
        t.ticket_number.toLowerCase().includes(q) ||
        t.player_name.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.player_email.toLowerCase().includes(q) ||
        (t.tournament_name && t.tournament_name.toLowerCase().includes(q)) ||
        (t.match_id && t.match_id.toLowerCase().includes(q)) ||
        (t.efootball_id && t.efootball_id.toLowerCase().includes(q))
    );
  }

  // Sorting
  const sortBy = params.sortBy || 'newest';
  const priorityWeight: Record<TicketPriority, number> = {
    urgent: 4,
    high: 3,
    normal: 2,
    low: 1,
  };

  unified.sort((a, b) => {
    if (sortBy === 'priority') {
      const pDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
      if (pDiff !== 0) return pDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    if (sortBy === 'oldest') {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    if (sortBy === 'updated') {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    }
    if (sortBy === 'deadline') {
      return new Date(a.response_deadline_iso).getTime() - new Date(b.response_deadline_iso).getTime();
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const total = unified.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const paginatedTickets = unified.slice(startIndex, startIndex + pageSize);

  return {
    tickets: paginatedTickets,
    total,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Fetches a single unified ticket by ID enriched with player history, tournaments, and match info
 */
export async function getUnifiedTicketById(id: string): Promise<UnifiedTicket | null> {
  const adminClient = createAdminClient();

  // Try support_tickets first
  const { data: st } = await (adminClient.from('support_tickets') as any)
    .select(`
      id, ticket_number, user_id, player_name, player_email, category,
      subject, description, priority, status, assigned_admin_id,
      tournament_id, match_id, evidence_url, evidence_public_id,
      resolution_notes, rejection_reason, resolved_by, resolved_at,
      created_at, updated_at
    `)
    .eq('id', id)
    .maybeSingle();

  if (st) {
    let profile: any = null;
    let tournamentName: string | null = null;
    let matchData: any = null;
    let playerTournaments: { id: string; name: string }[] = [];
    let previousTickets: any[] = [];

    if (st.user_id) {
      const [prRes, ptRes, prevRes] = await Promise.all([
        (adminClient.from('profiles') as any)
          .select('id, display_name, efootball_id, whatsapp_verified, whatsapp_number, account_status, avatar_url')
          .eq('id', st.user_id)
          .maybeSingle(),
        (adminClient.from('participants') as any)
          .select('tournament_id, tournaments(id, name)')
          .eq('user_id', st.user_id),
        (adminClient.from('support_tickets') as any)
          .select('id, ticket_number, subject, status, created_at')
          .eq('user_id', st.user_id)
          .neq('id', st.id)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      profile = prRes.data;
      playerTournaments = (ptRes.data || [])
        .map((p: any) => p.tournaments)
        .filter(Boolean) as { id: string; name: string }[];
      previousTickets = prevRes.data || [];
    }

    if (st.tournament_id) {
      const { data: tr } = await (adminClient.from('tournaments') as any)
        .select('name')
        .eq('id', st.tournament_id)
        .maybeSingle();
      tournamentName = tr?.name || null;
    }

    if (st.match_id) {
      const { data: mr } = await (adminClient.from('matches') as any)
        .select('id, scheduled_time, actual_start_time, status')
        .eq('id', st.match_id)
        .maybeSingle();
      matchData = mr;
    }

    const normalizedStatus = normalizeTicketStatus(st.status);
    const deadline = calculateTicketDeadline(st.created_at, false, normalizedStatus);

    return {
      id: st.id,
      source: 'support',
      ticket_number: st.ticket_number,
      category: st.category,
      subject: st.subject,
      description: st.description,
      priority: (st.priority || 'normal') as TicketPriority,
      status: normalizedStatus,
      created_at: st.created_at,
      updated_at: st.updated_at,
      resolved_at: st.resolved_at,
      resolved_by: st.resolved_by,
      resolution_notes: st.resolution_notes,
      rejection_reason: st.rejection_reason,
      assigned_admin_id: st.assigned_admin_id,
      ticket_age_str: formatTicketAge(st.created_at),
      is_overdue: deadline.isOverdue,
      response_deadline_iso: deadline.deadlineIso,
      deadline_status: deadline.status,
      has_new_player_reply: normalizedStatus === 'pending_review',
      user_id: st.user_id,
      player_name: profile?.display_name || st.player_name || 'Player',
      player_email: st.player_email || '',
      efootball_id: profile?.efootball_id || null,
      whatsapp_verified: profile?.whatsapp_verified ?? false,
      whatsapp_number: profile?.whatsapp_number || null,
      account_status: profile?.account_status || 'active',
      avatar_url: profile?.avatar_url || null,
      player_tournaments_count: playerTournaments.length,
      player_previous_tickets_count: previousTickets.length,
      player_tournaments: playerTournaments,
      player_previous_tickets: previousTickets,
      tournament_id: st.tournament_id,
      tournament_name: tournamentName,
      match_id: st.match_id,
      match_scheduled_time: matchData?.scheduled_time || null,
      match_actual_start_time: matchData?.actual_start_time || null,
      match_status: matchData?.status || null,
      evidence_url: st.evidence_url,
      evidence_public_id: st.evidence_public_id,
    };
  }

  // Try match_disputes
  const { data: d } = await (adminClient.from('match_disputes') as any)
    .select(`
      id, ticket_number, tournament_id, match_id, reporter_participant_id,
      opponent_participant_id, reason, details, evidence_url, status,
      priority, assigned_admin_id, admin_notes, resolution_action,
      resolved_by, resolved_at, created_at, updated_at,
      reporter_screenshot_url, opponent_screenshot_url,
      reporter_score_a, reporter_score_b, opponent_score_a, opponent_score_b
    `)
    .eq('id', id)
    .maybeSingle();

  if (d) {
    const [repRes, oppRes, tournRes, matchRes] = await Promise.all([
      (adminClient.from('participants') as any)
        .select('id, user_id, username, real_name, profiles(display_name, efootball_id, whatsapp_verified, whatsapp_number, account_status, avatar_url)')
        .eq('id', d.reporter_participant_id)
        .maybeSingle(),
      d.opponent_participant_id
        ? (adminClient.from('participants') as any)
            .select('id, user_id, username, real_name, profiles(display_name, efootball_id)')
            .eq('id', d.opponent_participant_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      (adminClient.from('tournaments') as any).select('name').eq('id', d.tournament_id).maybeSingle(),
      (adminClient.from('matches') as any).select('id, round_id, scheduled_time, actual_start_time, score_a, score_b, status').eq('id', d.match_id).maybeSingle(),
    ]);

    const reporter = repRes.data;
    const opponent = oppRes.data;
    const repProfile = reporter?.profiles;
    const oppProfile = opponent?.profiles;
    const matchData = matchRes.data;
    const readableReason = (d.reason || 'match_dispute').replace(/_/g, ' ');

    let playerTournaments: { id: string; name: string }[] = [];
    let previousTickets: any[] = [];

    if (reporter?.user_id) {
      const [ptRes, prevRes] = await Promise.all([
        (adminClient.from('participants') as any)
          .select('tournament_id, tournaments(id, name)')
          .eq('user_id', reporter.user_id),
        (adminClient.from('match_disputes') as any)
          .select('id, ticket_number, reason, status, created_at')
          .eq('reporter_participant_id', d.reporter_participant_id)
          .neq('id', d.id)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      playerTournaments = (ptRes.data || []).map((p: any) => p.tournaments).filter(Boolean);
      previousTickets = (prevRes.data || []).map((prev: any) => ({
        id: prev.id,
        ticket_number: prev.ticket_number,
        subject: `Dispute: ${prev.reason}`,
        status: normalizeTicketStatus(prev.status),
        created_at: prev.created_at,
      }));
    }

    const normalizedStatus = normalizeTicketStatus(d.status);
    const deadline = calculateTicketDeadline(d.created_at, true, normalizedStatus);

    return {
      id: d.id,
      source: 'dispute',
      ticket_number: d.ticket_number,
      category: normalizeDisputeCategory(d.reason),
      subject: `Match Dispute: ${readableReason.charAt(0).toUpperCase() + readableReason.slice(1)}`,
      description: d.details || `Official match dispute filed by ${reporter?.real_name || reporter?.username || 'participant'}. Reason: ${readableReason}`,
      priority: (d.priority || 'high') as TicketPriority,
      status: normalizedStatus,
      created_at: d.created_at,
      updated_at: d.updated_at,
      resolved_at: d.resolved_at,
      resolved_by: d.resolved_by,
      resolution_notes: d.admin_notes,
      assigned_admin_id: d.assigned_admin_id,
      ticket_age_str: formatTicketAge(d.created_at),
      is_overdue: deadline.isOverdue,
      response_deadline_iso: deadline.deadlineIso,
      deadline_status: deadline.status,
      has_new_player_reply: normalizedStatus === 'pending_review',
      user_id: reporter?.user_id,
      player_id: d.reporter_participant_id,
      player_name: repProfile?.display_name || reporter?.real_name || reporter?.username || 'Reporter Player',
      player_email: '',
      efootball_id: repProfile?.efootball_id || null,
      whatsapp_verified: repProfile?.whatsapp_verified ?? false,
      whatsapp_number: repProfile?.whatsapp_number || null,
      account_status: repProfile?.account_status || 'active',
      avatar_url: repProfile?.avatar_url || null,
      player_tournaments_count: playerTournaments.length,
      player_previous_tickets_count: previousTickets.length,
      player_tournaments: playerTournaments,
      player_previous_tickets: previousTickets,
      tournament_id: d.tournament_id,
      tournament_name: tournRes.data?.name || 'Tournament',
      match_id: d.match_id,
      match_scheduled_time: matchData?.scheduled_time || null,
      match_actual_start_time: matchData?.actual_start_time || null,
      match_status: matchData?.status || null,
      opponent_id: d.opponent_participant_id,
      opponent_name: oppProfile?.display_name || opponent?.real_name || opponent?.username || 'Opponent',
      opponent_efootball_id: oppProfile?.efootball_id || null,
      evidence_url: d.evidence_url || d.reporter_screenshot_url || d.opponent_screenshot_url,
      reporter_screenshot_url: d.reporter_screenshot_url,
      opponent_screenshot_url: d.opponent_screenshot_url,
      reporter_score_a: d.reporter_score_a,
      reporter_score_b: d.reporter_score_b,
      opponent_score_a: d.opponent_score_a,
      opponent_score_b: d.opponent_score_b,
    };
  }

  return null;
}

/**
 * Fetches ticket conversation messages
 */
export async function getTicketMessages(
  entityId: string,
  isDispute: boolean,
  includeInternal: boolean = false
): Promise<TicketMessage[]> {
  const adminClient = createAdminClient();
  let query = (adminClient.from('ticket_messages') as any)
    .select('*')
    .order('created_at', { ascending: true });

  if (isDispute) {
    query = query.eq('dispute_id', entityId);
  } else {
    query = query.eq('ticket_id', entityId);
  }

  if (!includeInternal) {
    query = query.eq('is_internal', false);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  return data as TicketMessage[];
}

/**
 * Fetches ticket administrative audit logs
 */
export async function getTicketAuditLogs(
  entityId: string,
  isDispute: boolean
): Promise<TicketAuditLog[]> {
  const adminClient = createAdminClient();
  let query = (adminClient.from('ticket_audit_logs') as any)
    .select('*')
    .order('created_at', { ascending: false });

  if (isDispute) {
    query = query.eq('dispute_id', entityId);
  } else {
    query = query.eq('ticket_id', entityId);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  return data as TicketAuditLog[];
}

/**
 * Fetches a player's own tickets for the player dashboard
 */
export async function getPlayerTickets(userId: string): Promise<UnifiedTicket[]> {
  const adminClient = createAdminClient();

  const [supportRes, participantRes] = await Promise.all([
    (adminClient.from('support_tickets') as any)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    (adminClient.from('participants') as any)
      .select('id, tournament_id')
      .eq('user_id', userId),
  ]);

  const rawSupport = (supportRes.data || []) as any[];
  const participantIds = ((participantRes.data || []) as any[]).map((p) => p.id);

  let rawDisputes: any[] = [];
  if (participantIds.length > 0) {
    const { data: dData } = await (adminClient.from('match_disputes') as any)
      .select('*')
      .in('reporter_participant_id', participantIds)
      .order('created_at', { ascending: false });
    rawDisputes = dData || [];
  }

  const supportTickets: UnifiedTicket[] = rawSupport.map((st) => {
    const stStatus = normalizeTicketStatus(st.status);
    const dl = calculateTicketDeadline(st.created_at, false, stStatus);
    return {
      id: st.id,
      source: 'support',
      ticket_number: st.ticket_number,
      category: st.category,
      subject: st.subject,
      description: st.description,
      priority: (st.priority || 'normal') as TicketPriority,
      status: stStatus,
      created_at: st.created_at,
      updated_at: st.updated_at,
      resolved_at: st.resolved_at,
      resolution_notes: st.resolution_notes,
      ticket_age_str: formatTicketAge(st.created_at),
      is_overdue: dl.isOverdue,
      response_deadline_iso: dl.deadlineIso,
      deadline_status: dl.status,
      has_new_player_reply: false,
      player_name: st.player_name,
      player_email: st.player_email,
      evidence_url: st.evidence_url,
    };
  });

  const disputeTickets: UnifiedTicket[] = rawDisputes.map((d) => {
    const readableReason = (d.reason || 'match_dispute').replace(/_/g, ' ');
    const stStatus = normalizeTicketStatus(d.status);
    const dl = calculateTicketDeadline(d.created_at, true, stStatus);
    return {
      id: d.id,
      source: 'dispute',
      ticket_number: d.ticket_number,
      category: normalizeDisputeCategory(d.reason),
      subject: `Match Dispute: ${readableReason.charAt(0).toUpperCase() + readableReason.slice(1)}`,
      description: d.details || `Dispute for match ${d.match_id}`,
      priority: (d.priority || 'high') as TicketPriority,
      status: stStatus,
      created_at: d.created_at,
      updated_at: d.updated_at,
      resolved_at: d.resolved_at,
      resolution_notes: d.admin_notes,
      ticket_age_str: formatTicketAge(d.created_at),
      is_overdue: dl.isOverdue,
      response_deadline_iso: dl.deadlineIso,
      deadline_status: dl.status,
      has_new_player_reply: false,
      player_name: 'You',
      player_email: '',
      evidence_url: d.evidence_url || d.reporter_screenshot_url,
    };
  });

  const all = [...supportTickets, ...disputeTickets];
  all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return all;
}
