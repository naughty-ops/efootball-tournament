export type TournamentFormat = 'knockout' | 'league' | 'group_knockout' | 'single_league_knockout';
export type TournamentStatus = 'draft' | 'registration' | 'ongoing' | 'completed';
export type ParticipantStatus = 'active' | 'eliminated' | 'disqualified';
export type MatchStatus = 'pending' | 'ready' | 'scheduled' | 'live' | 'completed' | 'walkover' | 'cancelled';
export type RegistrationStatus = 'pending_payment' | 'confirmed' | 'expired' | 'cancelled' | 'refunded';
export type PaymentOrderStatus = 'created' | 'attempted' | 'paid' | 'failed' | 'expired';
export type PaymentTransactionStatus = 'captured' | 'failed' | 'refunded' | 'partially_refunded';
export type RefundRequestStatus = 'pending_review' | 'approved' | 'rejected' | 'processed' | 'failed';

export interface Database {
  public: {
    Tables: {
      tournaments: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          format: TournamentFormat;
          status: TournamentStatus;
          start_date: string | null;
          end_date: string | null;
          rules_text: string | null;
          banner_image: string | null;
          max_participants: number;
          qualifiers_per_group: number;
          rounds_per_pair: number;
          is_group_stage_finalized: boolean;
          champion_id: string | null;
          runner_up_id: string | null;
          completed_at: string | null;
          is_paid: boolean;
          entry_fee_paise: number;
          currency: string;
          prize_pool_paise: number;
          reserved_slots_count: number;
          confirmed_slots_count: number;
          registration_deadline: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          format?: TournamentFormat;
          status?: TournamentStatus;
          start_date?: string | null;
          end_date?: string | null;
          rules_text?: string | null;
          banner_image?: string | null;
          max_participants?: number;
          qualifiers_per_group?: number;
          rounds_per_pair?: number;
          is_group_stage_finalized?: boolean;
          champion_id?: string | null;
          runner_up_id?: string | null;
          completed_at?: string | null;
          is_paid?: boolean;
          entry_fee_paise?: number;
          currency?: string;
          prize_pool_paise?: number;
          reserved_slots_count?: number;
          confirmed_slots_count?: number;
          registration_deadline?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          format?: TournamentFormat;
          status?: TournamentStatus;
          start_date?: string | null;
          end_date?: string | null;
          rules_text?: string | null;
          banner_image?: string | null;
          max_participants?: number;
          qualifiers_per_group?: number;
          rounds_per_pair?: number;
          is_group_stage_finalized?: boolean;
          champion_id?: string | null;
          runner_up_id?: string | null;
          completed_at?: string | null;
          is_paid?: boolean;
          entry_fee_paise?: number;
          currency?: string;
          prize_pool_paise?: number;
          reserved_slots_count?: number;
          confirmed_slots_count?: number;
          registration_deadline?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      participants: {
        Row: {
          id: string;
          tournament_id: string;
          user_id: string | null;
          username: string;
          real_name: string | null;
          contact_info: string | null;
          seed_number: number | null;
          status: ParticipantStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          user_id?: string | null;
          username: string;
          real_name?: string | null;
          contact_info?: string | null;
          seed_number?: number | null;
          status?: ParticipantStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tournament_id?: string;
          user_id?: string | null;
          username?: string;
          real_name?: string | null;
          contact_info?: string | null;
          seed_number?: number | null;
          status?: ParticipantStatus;
          created_at?: string;
          updated_at?: string;
        };
      };
      tournament_participants_public: {
        Row: {
          id: string;
          tournament_id: string;
          username: string;
          seed_number: number | null;
          status: ParticipantStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
      };
      groups: {
        Row: {
          id: string;
          tournament_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          tournament_id?: string;
          name?: string;
          created_at?: string;
        };
      };
      group_participants: {
        Row: {
          id: string;
          group_id: string;
          participant_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          participant_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          participant_id?: string;
          created_at?: string;
        };
      };
      rounds: {
        Row: {
          id: string;
          tournament_id: string;
          round_number: number;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          round_number: number;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          tournament_id?: string;
          round_number?: number;
          name?: string;
          created_at?: string;
        };
      };
      matches: {
        Row: {
          id: string;
          round_id: string;
          group_id: string | null;
          participant_a: string | null;
          participant_b: string | null;
          scheduled_time: string | null;
          status: MatchStatus;
          score_a: number;
          score_b: number;
          decided_by: 'normal' | 'penalties' | 'extra_time' | null;
          penalty_score_a: number | null;
          penalty_score_b: number | null;
          winner_id: string | null;
          notes: string | null;
          match_position: number;
          next_match_id: string | null;
          winner_slot: 'participant_a' | 'participant_b' | null;
          live_room_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          round_id: string;
          group_id?: string | null;
          participant_a?: string | null;
          participant_b?: string | null;
          scheduled_time?: string | null;
          status?: MatchStatus;
          score_a?: number;
          score_b?: number;
          decided_by?: 'normal' | 'penalties' | 'extra_time' | null;
          penalty_score_a?: number | null;
          penalty_score_b?: number | null;
          winner_id?: string | null;
          notes?: string | null;
          match_position?: number;
          next_match_id?: string | null;
          winner_slot?: 'participant_a' | 'participant_b' | null;
          live_room_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          round_id?: string;
          group_id?: string | null;
          participant_a?: string | null;
          participant_b?: string | null;
          scheduled_time?: string | null;
          status?: MatchStatus;
          score_a?: number;
          score_b?: number;
          decided_by?: 'normal' | 'penalties' | 'extra_time' | null;
          penalty_score_a?: number | null;
          penalty_score_b?: number | null;
          winner_id?: string | null;
          notes?: string | null;
          match_position?: number;
          next_match_id?: string | null;
          winner_slot?: 'participant_a' | 'participant_b' | null;
          live_room_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      knockout_bracket_drafts: {
        Row: {
          id: string;
          tournament_id: string;
          version: number;
          status: 'draft' | 'published';
          draft_payload: any;
          created_at: string;
          updated_at: string;
          published_at: string | null;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          version?: number;
          status?: 'draft' | 'published';
          draft_payload: any;
          created_at?: string;
          updated_at?: string;
          published_at?: string | null;
        };
        Update: {
          id?: string;
          tournament_id?: string;
          version?: number;
          status?: 'draft' | 'published';
          draft_payload?: any;
          created_at?: string;
          updated_at?: string;
          published_at?: string | null;
        };
      };
      knockout_bracket_logs: {
        Row: {
          id: string;
          tournament_id: string;
          action: string;
          details: any;
          created_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          action: string;
          details?: any;
          created_at?: string;
        };
        Update: {
          id?: string;
          tournament_id?: string;
          action?: string;
          details?: any;
          created_at?: string;
        };
      };
      match_predictions: {
        Row: {
          id: string;
          match_id: string;
          user_id: string;
          predicted_player_id: string;
          predicted_at: string;
          locked_at: string | null;
          result: 'pending' | 'correct' | 'wrong' | 'void';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          match_id: string;
          user_id: string;
          predicted_player_id: string;
          predicted_at?: string;
          locked_at?: string | null;
          result?: 'pending' | 'correct' | 'wrong' | 'void';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          match_id?: string;
          user_id?: string;
          predicted_player_id?: string;
          predicted_at?: string;
          locked_at?: string | null;
          result?: 'pending' | 'correct' | 'wrong' | 'void';
          created_at?: string;
          updated_at?: string;
        };
      };
      live_viewer_sessions: {
        Row: {
          id: string;
          match_id: string;
          user_id: string | null;
          session_id: string;
          device_type: string;
          joined_at: string;
          left_at: string | null;
          duration_seconds: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          match_id: string;
          user_id?: string | null;
          session_id: string;
          device_type?: string;
          joined_at?: string;
          left_at?: string | null;
          duration_seconds?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          match_id?: string;
          user_id?: string | null;
          session_id?: string;
          device_type?: string;
          joined_at?: string;
          left_at?: string | null;
          duration_seconds?: number;
          created_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          email?: string | null;
          display_name: string;
          efootball_id: string;
          efootball_id_verified: boolean;
          efootball_verification_status: 'pending' | 'verified' | 'rejected';
          efootball_rejection_reason: string | null;
          account_status: 'active' | 'suspended' | 'disabled';
          suspension_reason: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          admin_notes: string | null;
          whatsapp_number: string;
          whatsapp_verified: boolean;
          whatsapp_verification_status: 'not_submitted' | 'pending' | 'verified' | 'rejected';
          whatsapp_rejection_reason: string | null;
          whatsapp_verification_requested_at: string | null;
          whatsapp_verified_at: string | null;
          whatsapp_verified_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string;
          efootball_id?: string;
          efootball_id_verified?: boolean;
          efootball_verification_status?: 'pending' | 'verified' | 'rejected';
          efootball_rejection_reason?: string | null;
          account_status?: 'active' | 'suspended' | 'disabled';
          suspension_reason?: string | null;
          suspended_at?: string | null;
          suspended_by?: string | null;
          admin_notes?: string | null;
          whatsapp_number?: string;
          whatsapp_verified?: boolean;
          whatsapp_verification_status?: 'not_submitted' | 'pending' | 'verified' | 'rejected';
          whatsapp_rejection_reason?: string | null;
          whatsapp_verification_requested_at?: string | null;
          whatsapp_verified_at?: string | null;
          whatsapp_verified_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          display_name?: string;
          efootball_id?: string;
          efootball_id_verified?: boolean;
          efootball_verification_status?: 'pending' | 'verified' | 'rejected';
          efootball_rejection_reason?: string | null;
          account_status?: 'active' | 'suspended' | 'disabled';
          suspension_reason?: string | null;
          suspended_at?: string | null;
          suspended_by?: string | null;
          admin_notes?: string | null;
          whatsapp_number?: string;
          whatsapp_verified?: boolean;
          whatsapp_verification_status?: 'not_submitted' | 'pending' | 'verified' | 'rejected';
          whatsapp_rejection_reason?: string | null;
          whatsapp_verification_requested_at?: string | null;
          whatsapp_verified_at?: string | null;
          whatsapp_verified_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      admin_audit_logs: {
        Row: {
          id: string;
          admin_id: string;
          target_user_id: string | null;
          action: string;
          entity_type: string;
          details: Record<string, unknown> | null;
          previous_values: Record<string, unknown> | null;
          new_values: Record<string, unknown> | null;
          reason: string | null;
          status: 'success' | 'failure';
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          target_user_id?: string | null;
          action: string;
          entity_type?: string;
          details?: Record<string, unknown> | null;
          previous_values?: Record<string, unknown> | null;
          new_values?: Record<string, unknown> | null;
          reason?: string | null;
          status?: 'success' | 'failure';
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          target_user_id?: string | null;
          action?: string;
          entity_type?: string;
          details?: Record<string, unknown> | null;
          previous_values?: Record<string, unknown> | null;
          new_values?: Record<string, unknown> | null;
          reason?: string | null;
          status?: 'success' | 'failure';
          created_at?: string;
        };
      };
      admin_users: {
        Row: {
          id: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          created_at?: string;
        };
      };
      tournament_registrations: {
        Row: {
          id: string;
          tournament_id: string;
          user_id: string;
          participant_id: string | null;
          payment_transaction_id: string | null;
          status: RegistrationStatus;
          amount_paise: number;
          currency: string;
          reserved_until: string | null;
          confirmed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          user_id: string;
          participant_id?: string | null;
          payment_transaction_id?: string | null;
          status?: RegistrationStatus;
          amount_paise?: number;
          currency?: string;
          reserved_until?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tournament_id?: string;
          user_id?: string;
          participant_id?: string | null;
          payment_transaction_id?: string | null;
          status?: RegistrationStatus;
          amount_paise?: number;
          currency?: string;
          reserved_until?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      payment_orders: {
        Row: {
          id: string;
          registration_id: string;
          tournament_id: string;
          user_id: string;
          gateway?: string;
          gateway_order_id?: string | null;
          cf_order_id?: string | null;
          payment_session_id?: string | null;
          razorpay_order_id: string | null;
          amount_paise: number;
          currency: string;
          status: PaymentOrderStatus;
          receipt: string;
          attempts: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          registration_id: string;
          tournament_id: string;
          user_id: string;
          gateway?: string;
          gateway_order_id?: string | null;
          cf_order_id?: string | null;
          payment_session_id?: string | null;
          razorpay_order_id?: string | null;
          amount_paise: number;
          currency?: string;
          status?: PaymentOrderStatus;
          receipt: string;
          attempts?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          registration_id?: string;
          tournament_id?: string;
          user_id?: string;
          gateway?: string;
          gateway_order_id?: string | null;
          cf_order_id?: string | null;
          payment_session_id?: string | null;
          razorpay_order_id?: string | null;
          amount_paise?: number;
          currency?: string;
          status?: PaymentOrderStatus;
          receipt?: string;
          attempts?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      payment_transactions: {
        Row: {
          id: string;
          order_id: string;
          tournament_id: string;
          user_id: string;
          gateway?: string;
          gateway_payment_id?: string | null;
          gateway_signature?: string | null;
          razorpay_payment_id: string | null;
          razorpay_signature: string | null;
          amount_paise: number;
          currency: string;
          status: PaymentTransactionStatus;
          payment_method: string | null;
          bank_reference: string | null;
          error_code: string | null;
          error_description: string | null;
          verified_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          tournament_id: string;
          user_id: string;
          gateway?: string;
          gateway_payment_id?: string | null;
          gateway_signature?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          amount_paise: number;
          currency?: string;
          status?: PaymentTransactionStatus;
          payment_method?: string | null;
          bank_reference?: string | null;
          error_code?: string | null;
          error_description?: string | null;
          verified_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          tournament_id?: string;
          user_id?: string;
          gateway?: string;
          gateway_payment_id?: string | null;
          gateway_signature?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          amount_paise?: number;
          currency?: string;
          status?: PaymentTransactionStatus;
          payment_method?: string | null;
          bank_reference?: string | null;
          error_code?: string | null;
          error_description?: string | null;
          verified_at?: string;
          created_at?: string;
        };
      };
      payment_refund_requests: {
        Row: {
          id: string;
          transaction_id: string;
          order_id: string;
          tournament_id: string;
          user_id: string;
          gateway?: string;
          gateway_refund_id?: string | null;
          amount_paise: number;
          currency: string;
          reason: string;
          status: RefundRequestStatus;
          admin_notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          razorpay_refund_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          transaction_id: string;
          order_id: string;
          tournament_id: string;
          user_id: string;
          gateway?: string;
          gateway_refund_id?: string | null;
          amount_paise: number;
          currency?: string;
          reason: string;
          status?: RefundRequestStatus;
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          razorpay_refund_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          transaction_id?: string;
          order_id?: string;
          tournament_id?: string;
          user_id?: string;
          gateway?: string;
          gateway_refund_id?: string | null;
          amount_paise?: number;
          currency?: string;
          reason?: string;
          status?: RefundRequestStatus;
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          razorpay_refund_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      payment_webhook_events: {
        Row: {
          id: string;
          event_id: string;
          event_type: string;
          payload: Record<string, unknown>;
          status: string;
          processed_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          event_type: string;
          payload: Record<string, unknown>;
          status?: string;
          processed_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          event_type?: string;
          payload?: Record<string, unknown>;
          status?: string;
          processed_at?: string;
        };
      };
    };
  };
}

export type Tournament = Database['public']['Tables']['tournaments']['Row'];
export type Participant = Database['public']['Tables']['participants']['Row'];
export type TournamentParticipantPublic = Database['public']['Tables']['tournament_participants_public']['Row'];
export type Group = Database['public']['Tables']['groups']['Row'];
export type GroupParticipant = Database['public']['Tables']['group_participants']['Row'];
export type Round = Database['public']['Tables']['rounds']['Row'];
export type Match = Database['public']['Tables']['matches']['Row'];
export type KnockoutBracketDraft = Database['public']['Tables']['knockout_bracket_drafts']['Row'];
export type KnockoutBracketLog = Database['public']['Tables']['knockout_bracket_logs']['Row'];
export type MatchPrediction = Database['public']['Tables']['match_predictions']['Row'];
export type LiveViewerSession = Database['public']['Tables']['live_viewer_sessions']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type AdminUser = Database['public']['Tables']['admin_users']['Row'];
export type AdminAuditLog = Database['public']['Tables']['admin_audit_logs']['Row'];
export type TournamentRegistration = Database['public']['Tables']['tournament_registrations']['Row'];
export type PaymentOrder = Database['public']['Tables']['payment_orders']['Row'];
export type PaymentTransaction = Database['public']['Tables']['payment_transactions']['Row'];
export type PaymentRefundRequest = Database['public']['Tables']['payment_refund_requests']['Row'];
export type PaymentWebhookEvent = Database['public']['Tables']['payment_webhook_events']['Row'];

export interface PredictionAggregateStats {
  totalPredictions: number;
  playerACount: number;
  playerBCount: number;
  playerAPercent: number;
  playerBPercent: number;
  correctCount: number;
  wrongCount: number;
  voidCount: number;
  isLocked: boolean;
}

export interface DraftMatchNode {
  id: string;
  round_id: string;
  match_position: number;
  participant_a: string | null;
  participant_b: string | null;
  score_a: number;
  score_b: number;
  decided_by?: 'normal' | 'penalties' | 'extra_time' | null;
  penalty_score_a?: number | null;
  penalty_score_b?: number | null;
  status: MatchStatus;
  winner_id: string | null;
  next_match_id: string | null;
  winner_slot: 'participant_a' | 'participant_b' | null;
  notes: string | null;
}

export interface DraftRoundNode {
  id: string;
  tournament_id: string;
  round_number: number;
  name: string;
  matches: DraftMatchNode[];
}

export interface KnockoutDraftPayload {
  rounds: DraftRoundNode[];
  updatedAt: string;
  version: number;
}

export interface BracketValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  impactedCompletedMatches: string[];
}

export type WhatsAppVerificationStatus = 'not_submitted' | 'pending' | 'verified' | 'rejected';
export type EfootballVerificationStatus = 'pending' | 'verified' | 'rejected';


