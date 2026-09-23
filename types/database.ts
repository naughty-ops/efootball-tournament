export type TournamentFormat = 'knockout' | 'league' | 'group_knockout' | 'single_league_knockout';
export type TournamentStatus = 'draft' | 'registration' | 'ongoing' | 'completed';
export type ParticipantStatus = 'active' | 'eliminated' | 'disqualified';
export type MatchStatus = 'pending' | 'ready' | 'scheduled' | 'live' | 'completed' | 'walkover' | 'cancelled';

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
          created_at?: string;
          updated_at?: string;
        };
      };
      participants: {
        Row: {
          id: string;
          tournament_id: string;
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
          username?: string;
          real_name?: string | null;
          contact_info?: string | null;
          seed_number?: number | null;
          status?: ParticipantStatus;
          created_at?: string;
          updated_at?: string;
        };
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
    };
  };
}

export type Tournament = Database['public']['Tables']['tournaments']['Row'];
export type Participant = Database['public']['Tables']['participants']['Row'];
export type Group = Database['public']['Tables']['groups']['Row'];
export type GroupParticipant = Database['public']['Tables']['group_participants']['Row'];
export type Round = Database['public']['Tables']['rounds']['Row'];
export type Match = Database['public']['Tables']['matches']['Row'];
export type KnockoutBracketDraft = Database['public']['Tables']['knockout_bracket_drafts']['Row'];
export type KnockoutBracketLog = Database['public']['Tables']['knockout_bracket_logs']['Row'];

export interface DraftMatchNode {
  id: string;
  round_id: string;
  match_position: number;
  participant_a: string | null;
  participant_b: string | null;
  score_a: number;
  score_b: number;
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

