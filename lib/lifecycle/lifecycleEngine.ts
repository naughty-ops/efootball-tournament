import type { Tournament, Match, Round, Participant } from '@/types/database';

export type TournamentSubStage =
  | 'draft'
  | 'registration'
  | 'group_stage'
  | 'group_stage_finalized'
  | 'knockout'
  | 'final'
  | 'completed';

export interface StageInfo {
  subStage: TournamentSubStage;
  label: string;
  description: string;
  participantsCount: number;
  maxParticipants: number;
  groupMatchesTotal: number;
  groupMatchesCompleted: number;
  isGroupStageComplete: boolean;
  isGroupStageFinalized: boolean;
  qualifiersCount: number;
  knockoutMatchesTotal: number;
  knockoutMatchesCompleted: number;
  finalMatch: Match | null;
  finalWinner: Participant | null;
  champion: Participant | null;
  allowedActions: string[];
}

/**
 * Determine exact tournament sub-stage from tournament data, matches, rounds, and groups
 */
export function getTournamentSubStage(
  tournament: Tournament,
  matches: Match[],
  rounds: Round[]
): TournamentSubStage {
  if (tournament.status === 'completed') return 'completed';
  if (tournament.status === 'draft') return 'draft';
  if (tournament.status === 'registration') return 'registration';

  // Ongoing status handling
  const knockoutMatches = matches.filter((m) => (m.group_id === null || m.group_id === undefined) && m.round_id !== null && m.round_id !== undefined);

  if (tournament.format === 'group_knockout') {
    if (knockoutMatches.length === 0) {
      if (!tournament.is_group_stage_finalized) {
        return 'group_stage';
      }
      return 'group_stage_finalized';
    }
  }

  // Knockout phase
  if (knockoutMatches.length > 0) {
    const knockoutRoundIds = new Set(knockoutMatches.map((m) => m.round_id).filter(Boolean));
    const knockoutRounds = rounds.filter((r) => knockoutRoundIds.has(r.id));

    if (knockoutRounds.length > 0) {
      const maxRoundNum = Math.max(...knockoutRounds.map((r) => r.round_number));
      const finalRound = knockoutRounds.find((r) => r.round_number === maxRoundNum);
      const finalMatch = finalRound ? knockoutMatches.find((m) => m.round_id === finalRound.id) : null;

      if (finalMatch && (finalMatch.status === 'completed' || finalMatch.status === 'walkover')) {
        return 'final';
      }
    }

    return 'knockout';
  }

  return 'group_stage';
}

/**
 * Validate stage transition and return helpful error if transition is invalid
 */
export function validateStageTransition(
  currentStage: TournamentSubStage,
  targetStage: TournamentSubStage,
  format: string
): { isValid: boolean; errorMessage?: string } {
  if (currentStage === targetStage) return { isValid: true };

  if (currentStage === 'completed') {
    return { isValid: false, errorMessage: 'Tournament is completed and read-only.' };
  }

  if (currentStage === 'draft' || currentStage === 'registration') {
    if (targetStage === 'group_stage' && format !== 'group_knockout') {
      return { isValid: false, errorMessage: 'Group stage is only available for Group + Knockout format.' };
    }
    if (targetStage === 'knockout' && format === 'group_knockout') {
      return { isValid: false, errorMessage: 'Group + Knockout tournaments must complete the Group Stage first.' };
    }
    if (targetStage === 'completed') {
      return { isValid: false, errorMessage: 'Cannot mark tournament completed before playing matches.' };
    }
  }

  if (currentStage === 'group_stage') {
    if (targetStage === 'knockout') {
      return { isValid: false, errorMessage: 'Complete and finalize the group stage first.' };
    }
    if (targetStage === 'completed') {
      return { isValid: false, errorMessage: 'Cannot complete tournament from Group Stage.' };
    }
  }

  if (currentStage === 'group_stage_finalized') {
    if (targetStage === 'completed') {
      return { isValid: false, errorMessage: 'Knockout Stage must be played before completing the tournament.' };
    }
  }

  if (currentStage === 'knockout' || currentStage === 'final') {
    if (targetStage === 'completed' && currentStage !== 'final') {
      return { isValid: false, errorMessage: 'Final match must be completed before marking tournament complete.' };
    }
  }

  return { isValid: true };
}
