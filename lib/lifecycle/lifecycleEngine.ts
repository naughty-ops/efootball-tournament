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

export function isKnockoutRoundName(name: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  if (n.includes('matchday') || n.includes('league') || n.includes('group stage') || n.startsWith('md')) {
    return false;
  }
  return (
    n.includes('quarter') ||
    n.includes('semi') ||
    n.includes('final') ||
    n.includes('playoff') ||
    n.includes('eliminator') ||
    n.includes('round of') ||
    n.includes('bracket') ||
    n.startsWith('qf') ||
    n.startsWith('sf')
  );
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

  const roundMap = new Map<string, Round>(rounds.map((r) => [r.id, r]));

  // Ongoing status handling: ONLY consider matches belonging to explicit Knockout rounds
  const knockoutMatches = matches.filter((m) => {
    if (!m.round_id) return false;
    const r = roundMap.get(m.round_id);
    return r ? isKnockoutRoundName(r.name) : false;
  });

  if (tournament.format === 'group_knockout' || (tournament.format as string) === 'single_league_knockout') {
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
    const knockoutRounds = rounds.filter((r) => knockoutRoundIds.has(r.id) && isKnockoutRoundName(r.name));

    if (knockoutRounds.length > 0) {
      const maxRoundNum = Math.max(...knockoutRounds.map((r) => r.round_number));
      const finalRound =
        knockoutRounds.find((r) => r.round_number === maxRoundNum) ||
        knockoutRounds.find((r) => {
          const n = r.name.toLowerCase().trim();
          return n === 'grand final' || n === 'final' || n === 'finals';
        });
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
