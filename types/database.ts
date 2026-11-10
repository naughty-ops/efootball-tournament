export type TournamentFormat = 'knockout' | 'league' | 'group_knockout' | 'single_league_knockout';
export type TournamentStatus = 'draft' | 'registration' | 'ongoing' | 'completed';
export type ParticipantStatus = 'active' | 'eliminated' | 'disqualified';
export type MatchStatus =
  | 'scheduled'
  | 'waiting_for_players'
  | 'in_progress'
  | 'awaiting_result'
  | 'result_verification'
  | 'disputed'
  | 'result_pending_admin'
  | 'completed'
  | 'admin_review'
  | 'SCHEDULED'
  | 'WAITING_FOR_PLAYERS'
  | 'IN_PROGRESS'
  | 'AWAITING_RESULT'
  | 'RESULT_VERIFICATION'
  | 'DISPUTED'
  | 'RESULT_PENDING_ADMIN'
  | 'COMPLETED'
  | 'ADMIN_REVIEW'
  | 'pending'
  | 'ready'
  | 'live'
  | 'walkover'
  | 'cancelled'
  | 'under_review'
  | 'forfeited';

export interface MatchSubmission {
  id: string;
  match_id: string;
  tournament_id: string;
  participant_id: string;
  user_id: string;
  my_score: number;
  opponent_score: number;
  screenshot_url?: string | null;
  screenshot_public_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type MediaEntityType =
  | 'player_avatar'
  | 'tournament_banner'
  | 'tournament_thumbnail'
  | 'match_evidence'
  | 'dispute_evidence'
  | 'admin_media';

export type MediaVisibility = 'public' | 'private';
export type MediaStatus = 'active' | 'orphaned' | 'deleted';

export interface MediaAsset {
  id: string;
  owner_id: string | null;
  entity_type: MediaEntityType;
  entity_id: string | null;
  cloudinary_public_id: string;
  secure_url: string;
  resource_type: string;
  format: string | null;
  width: number | null;
  height: number | null;
  file_size: number | null;
  visibility: MediaVisibility;
  status: MediaStatus;
  created_at: string;
  updated_at: string;
}
export type RegistrationStatus =
  | 'pending_payment'
  | 'payment_submitted'
  | 'under_verification'
  | 'approved'
  | 'rejected'
  | 'confirmed'
  | 'expired'
  | 'cancelled'
  | 'refunded';

export interface ManualPaymentSettings {
  admin_whatsapp_number: string;
  upi_id: string;
  account_holder_name: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  instructions: string;
  verification_notice: string;
}

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
          first_place_prize_paise?: number;
          first_place_notes?: string | null;
          second_place_prize_paise?: number;
          second_place_notes?: string | null;
          third_place_prize_paise?: number;
          third_place_notes?: string | null;
          third_place_id?: string | null;
          prize_distribution?: Record<string, any> | null;
          reserved_slots_count: number;
          confirmed_slots_count: number;
          registration_deadline: string | null;
          is_private?: boolean;
          access_code_hash?: string | null;
          cloudinary_public_id?: string | null;
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
          cloudinary_public_id?: string | null;
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
          first_place_prize_paise?: number;
          first_place_notes?: string | null;
          second_place_prize_paise?: number;
          second_place_notes?: string | null;
          third_place_prize_paise?: number;
          third_place_notes?: string | null;
          third_place_id?: string | null;
          prize_distribution?: Record<string, any> | null;
          reserved_slots_count?: number;
          confirmed_slots_count?: number;
          registration_deadline?: string | null;
          is_private?: boolean;
          access_code_hash?: string | null;
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
          first_place_prize_paise?: number;
          first_place_notes?: string | null;
          second_place_prize_paise?: number;
          second_place_notes?: string | null;
          third_place_prize_paise?: number;
          third_place_notes?: string | null;
          third_place_id?: string | null;
          prize_distribution?: Record<string, any> | null;
          reserved_slots_count?: number;
          confirmed_slots_count?: number;
          registration_deadline?: string | null;
          is_private?: boolean;
          access_code_hash?: string | null;
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
          tournament_id: string | null;
          group_id: string | null;
          participant_a: string | null;
          participant_b: string | null;
          scheduled_time: string | null;
          actual_start_time?: string | null;
          completion_deadline: string | null;
          submission_deadline?: string | null;
          checkin_deadline: string | null;
          grace_period_minutes: number | null;
          player_a_started_at: string | null;
          player_b_started_at: string | null;
          forfeit_reason: string | null;
          walkover_requested_by: string | null;
          walkover_requested_at: string | null;
          matchday: number | null;
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
          tournament_id?: string | null;
          group_id?: string | null;
          participant_a?: string | null;
          participant_b?: string | null;
          scheduled_time?: string | null;
          actual_start_time?: string | null;
          completion_deadline?: string | null;
          submission_deadline?: string | null;
          checkin_deadline?: string | null;
          grace_period_minutes?: number | null;
          player_a_started_at?: string | null;
          player_b_started_at?: string | null;
          forfeit_reason?: string | null;
          walkover_requested_by?: string | null;
          walkover_requested_at?: string | null;
          matchday?: number | null;
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
          tournament_id?: string | null;
          group_id?: string | null;
          participant_a?: string | null;
          participant_b?: string | null;
          scheduled_time?: string | null;
          actual_start_time?: string | null;
          completion_deadline?: string | null;
          submission_deadline?: string | null;
          checkin_deadline?: string | null;
          grace_period_minutes?: number | null;
          player_a_started_at?: string | null;
          player_b_started_at?: string | null;
          forfeit_reason?: string | null;
          walkover_requested_by?: string | null;
          walkover_requested_at?: string | null;
          matchday?: number | null;
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
      match_disputes: {
        Row: {
          id: string;
          match_id: string;
          tournament_id: string;
          reporter_participant_id: string;
          opponent_participant_id: string | null;
          reason: 'opponent_no_show' | 'connection_failure' | 'refusing_to_play' | 'match_not_completed' | 'incorrect_walkover' | 'other';
          details: string | null;
          evidence_url: string | null;
          status: 'open' | 'under_review' | 'resolved' | 'rejected';
          admin_notes: string | null;
          resolution_action: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          match_id: string;
          tournament_id: string;
          reporter_participant_id: string;
          opponent_participant_id?: string | null;
          reason: 'opponent_no_show' | 'connection_failure' | 'refusing_to_play' | 'match_not_completed' | 'incorrect_walkover' | 'other';
          details?: string | null;
          evidence_url?: string | null;
          status?: 'open' | 'under_review' | 'resolved' | 'rejected';
          admin_notes?: string | null;
          resolution_action?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          match_id?: string;
          tournament_id?: string;
          reporter_participant_id?: string;
          opponent_participant_id?: string | null;
          reason?: 'opponent_no_show' | 'connection_failure' | 'refusing_to_play' | 'match_not_completed' | 'incorrect_walkover' | 'other';
          details?: string | null;
          evidence_url?: string | null;
          status?: 'open' | 'under_review' | 'resolved' | 'rejected';
          admin_notes?: string | null;
          resolution_action?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      match_activity_logs: {
        Row: {
          id: string;
          match_id: string;
          tournament_id: string | null;
          actor_id: string | null;
          actor_role: 'player' | 'admin' | 'system';
          action: string;
          details: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          match_id: string;
          tournament_id?: string | null;
          actor_id?: string | null;
          actor_role?: 'player' | 'admin' | 'system';
          action: string;
          details?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          match_id?: string;
          tournament_id?: string | null;
          actor_id?: string | null;
          actor_role?: 'player' | 'admin' | 'system';
          action?: string;
          details?: Record<string, unknown> | null;
          created_at?: string;
        };
      };
      avatars: {
        Row: {
          id: string;
          name: string;
          image_url: string;
          cloudinary_public_id: string | null;
          category: string;
          is_active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          image_url: string;
          cloudinary_public_id?: string | null;
          category?: string;
          is_active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          image_url?: string;
          cloudinary_public_id?: string | null;
          category?: string;
          is_active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      media_assets: {
        Row: {
          id: string;
          owner_id: string | null;
          entity_type: MediaEntityType;
          entity_id: string | null;
          cloudinary_public_id: string;
          secure_url: string;
          resource_type: string;
          format: string | null;
          width: number | null;
          height: number | null;
          file_size: number | null;
          visibility: MediaVisibility;
          status: MediaStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          entity_type: MediaEntityType;
          entity_id?: string | null;
          cloudinary_public_id: string;
          secure_url: string;
          resource_type?: string;
          format?: string | null;
          width?: number | null;
          height?: number | null;
          file_size?: number | null;
          visibility?: MediaVisibility;
          status?: MediaStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string | null;
          entity_type?: MediaEntityType;
          entity_id?: string | null;
          cloudinary_public_id?: string;
          secure_url?: string;
          resource_type?: string;
          format?: string | null;
          width?: number | null;
          height?: number | null;
          file_size?: number | null;
          visibility?: MediaVisibility;
          status?: MediaStatus;
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
          account_status?: 'active' | 'suspended' | 'disabled';
          suspension_reason?: string | null;
          suspended_at?: string | null;
          suspended_by?: string | null;
          admin_notes?: string | null;
          whatsapp_number: string;
          whatsapp_verified: boolean;
          whatsapp_verification_status: 'not_submitted' | 'pending' | 'verified' | 'rejected';
          whatsapp_rejection_reason: string | null;
          whatsapp_verification_requested_at: string | null;
          whatsapp_verified_at: string | null;
          whatsapp_verified_by: string | null;
          verification_revoked_at?: string | null;
          verification_revoked_by?: string | null;
          verification_revocation_reason?: string | null;
          avatar_url?: string | null;
          avatar_id?: string | null;
          cloudinary_public_id?: string | null;
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
          verification_revoked_at?: string | null;
          verification_revoked_by?: string | null;
          verification_revocation_reason?: string | null;
          avatar_url?: string | null;
          avatar_id?: string | null;
          cloudinary_public_id?: string | null;
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
          verification_revoked_at?: string | null;
          verification_revoked_by?: string | null;
          verification_revocation_reason?: string | null;
          avatar_url?: string | null;
          avatar_id?: string | null;
          cloudinary_public_id?: string | null;
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
          status: RegistrationStatus;
          amount_paise: number;
          currency: string;
          payment_method?: string | null;
          payment_reference?: string | null;
          payment_proof_url?: string | null;
          verified_amount_paise?: number | null;
          verified_by?: string | null;
          verified_at?: string | null;
          rejection_reason?: string | null;
          submitted_at?: string | null;
          approved_at?: string | null;
          notes?: string | null;
          terms_accepted?: boolean | null;
          terms_accepted_at?: string | null;
          rules_version?: string | null;
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
          status?: RegistrationStatus;
          amount_paise?: number;
          currency?: string;
          payment_method?: string | null;
          payment_reference?: string | null;
          payment_proof_url?: string | null;
          verified_amount_paise?: number | null;
          verified_by?: string | null;
          verified_at?: string | null;
          rejection_reason?: string | null;
          submitted_at?: string | null;
          approved_at?: string | null;
          notes?: string | null;
          terms_accepted?: boolean | null;
          terms_accepted_at?: string | null;
          rules_version?: string | null;
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
          status?: RegistrationStatus;
          amount_paise?: number;
          currency?: string;
          payment_method?: string | null;
          payment_reference?: string | null;
          payment_proof_url?: string | null;
          verified_amount_paise?: number | null;
          verified_by?: string | null;
          verified_at?: string | null;
          rejection_reason?: string | null;
          submitted_at?: string | null;
          approved_at?: string | null;
          notes?: string | null;
          terms_accepted?: boolean | null;
          terms_accepted_at?: string | null;
          rules_version?: string | null;
          reserved_until?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      site_settings: {
        Row: {
          key: string;
          value: Record<string, unknown> | Array<unknown>;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Record<string, unknown> | Array<unknown>;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Record<string, unknown> | Array<unknown>;
          updated_at?: string;
        };
      };
      analytics_events: {
        Row: {
          id: string;
          event_name: string;
          page_path: string;
          tournament_id?: string | null;
          session_id: string;
          anonymous_visitor_id: string;
          referrer?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          device_type?: string | null;
          browser?: string | null;
          os?: string | null;
          country?: string | null;
          region?: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_name: string;
          page_path: string;
          tournament_id?: string | null;
          session_id: string;
          anonymous_visitor_id: string;
          referrer?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          device_type?: string | null;
          browser?: string | null;
          os?: string | null;
          country?: string | null;
          region?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_name?: string;
          page_path?: string;
          tournament_id?: string | null;
          session_id?: string;
          anonymous_visitor_id?: string;
          referrer?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          device_type?: string | null;
          browser?: string | null;
          os?: string | null;
          country?: string | null;
          region?: string | null;
          created_at?: string;
        };
      };
      homepage_sections: {
        Row: {
          id: string;
          section_key: string;
          section_name: string;
          description: string | null;
          display_order: number;
          is_enabled: boolean;
          is_visible_desktop: boolean;
          is_visible_mobile: boolean;
          status: 'draft' | 'published' | 'archived';
          draft_content: Record<string, any>;
          published_content: Record<string, any>;
          last_published_at: string | null;
          published_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          section_key: string;
          section_name: string;
          description?: string | null;
          display_order?: number;
          is_enabled?: boolean;
          is_visible_desktop?: boolean;
          is_visible_mobile?: boolean;
          status?: 'draft' | 'published' | 'archived';
          draft_content?: Record<string, any>;
          published_content?: Record<string, any>;
          last_published_at?: string | null;
          published_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          section_key?: string;
          section_name?: string;
          description?: string | null;
          display_order?: number;
          is_enabled?: boolean;
          is_visible_desktop?: boolean;
          is_visible_mobile?: boolean;
          status?: 'draft' | 'published' | 'archived';
          draft_content?: Record<string, any>;
          published_content?: Record<string, any>;
          last_published_at?: string | null;
          published_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      homepage_audit_history: {
        Row: {
          id: string;
          section_id: string;
          action: 'created' | 'draft_saved' | 'published' | 'visibility_toggled' | 'reordered' | 'reverted';
          performed_by: string | null;
          performed_by_email: string | null;
          changes: Record<string, any>;
          snapshot: Record<string, any>;
          created_at: string;
        };
        Insert: {
          id?: string;
          section_id: string;
          action: 'created' | 'draft_saved' | 'published' | 'visibility_toggled' | 'reordered' | 'reverted';
          performed_by?: string | null;
          performed_by_email?: string | null;
          changes?: Record<string, any>;
          snapshot?: Record<string, any>;
          created_at?: string;
        };
        Update: {
          id?: string;
          section_id?: string;
          action?: 'created' | 'draft_saved' | 'published' | 'visibility_toggled' | 'reordered' | 'reverted';
          performed_by?: string | null;
          performed_by_email?: string | null;
          changes?: Record<string, any>;
          snapshot?: Record<string, any>;
          created_at?: string;
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
export type Avatar = Database['public']['Tables']['avatars']['Row'];
export type AdminUser = Database['public']['Tables']['admin_users']['Row'];
export type AdminAuditLog = Database['public']['Tables']['admin_audit_logs']['Row'];
export type TournamentRegistration = Database['public']['Tables']['tournament_registrations']['Row'];
export type HomepageSection = Database['public']['Tables']['homepage_sections']['Row'];
export type HomepageSectionInsert = Database['public']['Tables']['homepage_sections']['Insert'];
export type HomepageSectionUpdate = Database['public']['Tables']['homepage_sections']['Update'];
export type HomepageAuditHistory = Database['public']['Tables']['homepage_audit_history']['Row'];

export type HomepageSectionKey =
  | 'navbar'
  | 'announcements'
  | 'hero_banner'
  | 'featured_tournament'
  | 'live_matches'
  | 'upcoming_tournaments'
  | 'leaderboard'
  | 'featured_players'
  | 'platform_statistics'
  | 'sponsors'
  | 'footer';

export type HomepageSectionStatus = 'draft' | 'published' | 'archived';

export interface HomepageOverviewStats {
  totalSections: number;
  publishedCount: number;
  hiddenCount: number;
  draftChangesCount: number;
  lastPublishedAt: string | null;
}

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


