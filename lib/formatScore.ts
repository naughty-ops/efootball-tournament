import type { Match } from '@/types/database';

export interface ScoreData {
  score_a: number;
  score_b: number;
  decided_by?: string | null;
  penalty_score_a?: number | null;
  penalty_score_b?: number | null;
  status?: string | null;
}

/**
 * Format a match score string.
 * For penalty shootouts: "3 (4)–(3) 3"
 * For normal matches: "3–1"
 */
export function formatMatchScore(match: ScoreData | null | undefined): string {
  if (!match) return '0–0';

  const isPenalty =
    match.decided_by === 'penalties' &&
    match.penalty_score_a !== null &&
    match.penalty_score_a !== undefined &&
    match.penalty_score_b !== null &&
    match.penalty_score_b !== undefined;

  if (isPenalty) {
    return `${match.score_a} (${match.penalty_score_a})–(${match.penalty_score_b}) ${match.score_b}`;
  }

  return `${match.score_a}–${match.score_b}`;
}

/**
 * Format participant score display in bracket nodes.
 * E.g., for Player A: "3 (4)" if decided by penalties, otherwise "3".
 */
export function formatBracketParticipantScore(
  mainScore: number,
  match?: ScoreData | null,
  isPlayerA: boolean = true
): string {
  if (
    match &&
    match.decided_by === 'penalties' &&
    match.penalty_score_a !== null &&
    match.penalty_score_a !== undefined &&
    match.penalty_score_b !== null &&
    match.penalty_score_b !== undefined
  ) {
    const penScore = isPlayerA ? match.penalty_score_a : match.penalty_score_b;
    return `${mainScore} (${penScore})`;
  }

  return `${mainScore}`;
}

export interface PenaltyValidationInput {
  decided_by?: string | null;
  penalty_score_a?: number | null;
  penalty_score_b?: number | null;
  winner_id?: string | null;
  participant_a?: string | null;
  participant_b?: string | null;
}

/**
 * Validates penalty shootout data integrity.
 * Returns isValid and error message if invalid.
 */
export function validatePenaltyResult(data: PenaltyValidationInput): { isValid: boolean; error?: string } {
  if (data.decided_by === 'penalties') {
    if (data.penalty_score_a === null || data.penalty_score_a === undefined) {
      return { isValid: false, error: 'Penalty score for Player A is required for penalty shootout.' };
    }
    if (data.penalty_score_b === null || data.penalty_score_b === undefined) {
      return { isValid: false, error: 'Penalty score for Player B is required for penalty shootout.' };
    }
    if (data.penalty_score_a === data.penalty_score_b) {
      return { isValid: false, error: 'Penalty shootout scores cannot be tied. A winner must be decided.' };
    }
    if (!data.winner_id) {
      return { isValid: false, error: 'A winner must be selected for penalty shootout.' };
    }

    if (data.participant_a && data.participant_b) {
      if (data.penalty_score_a > data.penalty_score_b && data.winner_id !== data.participant_a) {
        return { isValid: false, error: 'Winner does not match higher penalty score (Player A scored higher).' };
      }
      if (data.penalty_score_b > data.penalty_score_a && data.winner_id !== data.participant_b) {
        return { isValid: false, error: 'Winner does not match higher penalty score (Player B scored higher).' };
      }
    }
  }

  return { isValid: true };
}
