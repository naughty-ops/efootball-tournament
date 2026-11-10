export type TicketSource = 'dispute' | 'support';

export type TicketStatus =
  | 'open'
  | 'pending_review'
  | 'under_investigation'
  | 'waiting_for_player'
  | 'resolved'
  | 'rejected'
  | 'closed';

export type TicketPriority = 'urgent' | 'high' | 'normal' | 'low';

export type TicketCategory =
  | 'match_dispute'
  | 'match_not_started'
  | 'score_disagreement'
  | 'screenshot_evidence'
  | 'player_complaint'
  | 'tournament_issue'
  | 'technical_support'
  | 'other';

export type TicketView =
  | 'all'
  | 'my_assigned'
  | 'unassigned'
  | 'urgent'
  | 'disputes'
  | 'support'
  | 'awaiting_player'
  | 'overdue'
  | 'resolved'
  | 'rejected';

export interface UnifiedTicket {
  id: string;
  source: TicketSource;
  ticket_number: string;
  category: TicketCategory | string;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolution_notes?: string | null;
  rejection_reason?: string | null;
  assigned_admin_id?: string | null;
  assigned_admin_email?: string | null;

  // SLA & Operational flags
  ticket_age_str: string;
  is_overdue: boolean;
  response_deadline_iso: string;
  deadline_status: 'overdue' | 'approaching' | 'healthy';
  has_new_player_reply: boolean;

  // Player details
  user_id?: string | null;
  player_id?: string | null;
  player_name: string;
  player_email: string;
  efootball_id?: string | null;
  whatsapp_verified?: boolean;
  whatsapp_number?: string | null;
  account_status?: string | null;
  avatar_url?: string | null;
  player_tournaments_count?: number;
  player_previous_tickets_count?: number;
  player_tournaments?: { id: string; name: string }[];
  player_previous_tickets?: { id: string; ticket_number: string; subject: string; status: TicketStatus; created_at: string }[];

  // Tournament & Match Context (if applicable)
  tournament_id?: string | null;
  tournament_name?: string | null;
  match_id?: string | null;
  match_scheduled_time?: string | null;
  match_actual_start_time?: string | null;
  match_status?: string | null;
  opponent_id?: string | null;
  opponent_name?: string | null;
  opponent_efootball_id?: string | null;

  // Evidence
  evidence_url?: string | null;
  evidence_public_id?: string | null;
  reporter_screenshot_url?: string | null;
  opponent_screenshot_url?: string | null;
  reporter_score_a?: number | null;
  reporter_score_b?: number | null;
  opponent_score_a?: number | null;
  opponent_score_b?: number | null;
}

export interface TicketMessage {
  id: string;
  ticket_id?: string | null;
  dispute_id?: string | null;
  sender_id?: string | null;
  sender_role: 'player' | 'admin' | 'system';
  sender_name: string;
  message: string;
  is_internal: boolean;
  evidence_url?: string | null;
  evidence_public_id?: string | null;
  created_at: string;
}

export interface TicketAuditLog {
  id: string;
  ticket_id?: string | null;
  dispute_id?: string | null;
  admin_id?: string | null;
  admin_name?: string | null;
  action: string;
  previous_value?: string | null;
  new_value?: string | null;
  explanation?: string | null;
  created_at: string;
}

export interface TicketOverviewStats {
  totalTickets: number;
  totalOpen: number;
  pendingReview: number;
  underInvestigation: number;
  resolved: number;
  rejected: number;
  urgent: number;
  highPriority: number;
  normalPriority: number;
  unassigned: number;
  waitingForPlayer: number;
  recentlyUpdated: number;
  overdueCount: number;
}

export interface OperationalAlerts {
  criticalUnresolved: number;
  approachingDeadline: number;
  overdueCount: number;
  unassignedCount: number;
  newPlayerResponses: number;
  disputesNeedingAction: number;
}

export interface TicketPerformanceMetrics {
  avgFirstResponseMinutes: number | null;
  avgResolutionHours: number | null;
  avgDisputeResolutionHours: number | null;
  reopenedPercentage: number;
  overduePercentage: number;
  resolvedByAdmin: { adminEmail: string; count: number }[];
}

export interface TicketFilterParams {
  view?: TicketView | string;
  status?: string;
  category?: string;
  priority?: string;
  search?: string;
  tournamentId?: string;
  matchId?: string;
  assignedAdminId?: string;
  currentAdminEmail?: string;
  unassigned?: boolean;
  overdue?: boolean;
  sortBy?: 'newest' | 'oldest' | 'priority' | 'updated' | 'deadline';
  page?: number;
  pageSize?: number;
}

export interface PaginatedTicketsResult {
  tickets: UnifiedTicket[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
