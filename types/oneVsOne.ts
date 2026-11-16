export type OneVsOneCardStatus = 'active' | 'inactive' | 'maintenance';

export type OneVsOneMatchStatus =
  | 'waiting'
  | 'matched'
  | 'room_submitted'
  | 'ready'
  | 'in_progress'
  | 'result_submitted'
  | 'completed'
  | 'disputed'
  | 'cancelled'
  | 'expired';

export type OneVsOneMatchMode = 'free' | 'dry_run' | 'real';

export interface OneVsOneCard {
  id: string;
  name: string;
  entry_amount: number;
  advertised_payout: number;
  status: OneVsOneCardStatus;
  display_order: number;
  max_concurrent_matches: number;
  max_daily_matches: number;
  availability_start: string | null;
  availability_end: string | null;
  created_at: string;
  updated_at: string;
  active_matches_count?: number;
  waiting_players_count?: number;
  in_progress_matches_count?: number;
}

export interface OneVsOnePlayerInfo {
  id: string;
  match_id: string;
  user_id: string;
  player_position: 1 | 2;
  ready_status: 'pending' | 'ready';
  is_active: boolean;
  joined_at: string;
  ready_at: string | null;
  room_viewed_at: string | null;
  profile?: {
    display_name: string | null;
    efootball_id: string | null;
    avatar_url: string | null;
  } | null;
}

export interface OneVsOneResult {
  id: string;
  match_id: string;
  submitted_by: string;
  claimed_winner_id: string;
  player_one_score: number;
  player_two_score: number;
  screenshot_url: string | null;
  opponent_screenshot_url?: string | null;
  screenshot_signed_url?: string | null;
  opponent_screenshot_signed_url?: string | null;
  status: 'submitted' | 'confirmed' | 'disputed' | 'verified';
  opponent_confirmed_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
}

export interface OneVsOneDispute {
  id: string;
  match_id: string;
  submitted_by: string;
  reason: string;
  description: string;
  evidence_url: string | null;
  status: 'open' | 'under_review' | 'resolved' | 'dismissed';
  admin_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface OneVsOneMatchDetail {
  id: string;
  match_code: string;
  card_id: string;
  status: OneVsOneMatchStatus;
  match_mode: OneVsOneMatchMode;
  room_id: string | null;
  room_password: string | null;
  room_submitted_by: string | null;
  room_submitted_at: string | null;
  created_by: string;
  matched_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  card?: OneVsOneCard | null;
  players: OneVsOnePlayerInfo[];
  result?: OneVsOneResult | null;
  dispute?: OneVsOneDispute | null;
  settlement?: OneVsOneSettlement | null;
  userPosition?: 1 | 2 | null;
  opponent?: OneVsOnePlayerInfo | null;
}

export type OneVsOneSettlementStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'under_review'
  | 'cancelled';

export type OneVsOneSettlementMode = 'free' | 'dry_run' | 'real';

export interface OneVsOneSettlement {
  id: string;
  settlement_ref: string;
  match_id: string;
  winner_id: string | null;
  card_id: string;
  amount_paise: number;
  amount_inr: number;
  currency: string;
  mode: OneVsOneSettlementMode;
  status: OneVsOneSettlementStatus;
  wallet_transaction_id: string | null;
  idempotency_key: string;
  failure_reason: string | null;
  retry_count: number;
  settled_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  winner_profile?: {
    display_name: string | null;
    efootball_id: string | null;
    avatar_url: string | null;
  } | null;
  match?: OneVsOneMatchDetail | null;
}

export interface OneVsOneCreditTicketInput {
  matchId: string;
  expectedPayoutInr: number;
  settlementRef?: string | null;
  issueCategory: 'missing_wallet_credit' | 'incorrect_credit_amount' | 'settlement_delay' | 'other_credit_issue';
  description: string;
  evidenceFile?: File | null;
}

export interface OneVsOneEligibilityRecord {
  id: string;
  user_id: string;
  acknowledgement_timestamp: string;
  policy_version: string;
  jurisdiction: string;
  eligibility_status: string;
}

export interface OneVsOneArenaStats {
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

export interface AvailableWaitingMatch {
  id: string;
  match_code: string;
  card_id: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  card?: OneVsOneCard | null;
  creator_profile?: {
    display_name: string | null;
    avatar_url: string | null;
    efootball_id?: string | null;
  } | null;
}

export interface ArenaLeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  initials?: string;
  total_winnings_inr: number;
  wins_count: number;
  played_count: number;
}
