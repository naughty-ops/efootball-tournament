import { createClient } from '@/lib/supabase/client';
import type { Match, Participant } from '@/types/database';

export interface PlayerStatsCard {
  participant: Participant;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  cleanSheets: number;
  winStreak: number;
  unbeatenStreak: number;
  biggestWinMargin: number;
  biggestWinText: string;
}

export interface SeasonRecordsOverview {
  topScorer: PlayerStatsCard | null;
  mostWins: PlayerStatsCard | null;
  mostPoints: PlayerStatsCard | null;
  bestGoalDiff: PlayerStatsCard | null;
  fewestConceded: PlayerStatsCard | null;
  longestWinStreak: { participant: Participant; count: number } | null;
  longestUnbeatenStreak: { participant: Participant; count: number } | null;
  biggestWinMatch: { winner: Participant; loser: Participant; scoreText: string; margin: number } | null;
  allPlayerStats: PlayerStatsCard[];
}

type UnknownQuery = {
  select: (columns: string, options?: unknown) => UnknownQuery;
  eq: (column: string, value: unknown) => UnknownQuery;
  in: (column: string, values: unknown[]) => UnknownQuery;
  order: (column: string, options?: { ascending?: boolean }) => UnknownQuery;
  then: Promise<{ data: unknown[] | null; error: unknown }>['then'];
};

export async function getTournamentSeasonRecords(tournamentId: string): Promise<SeasonRecordsOverview> {
  const supabase = createClient();

  // 1. Fetch participants
  const { data: ps } = await (supabase.from('participants') as unknown as UnknownQuery)
    .select('*')
    .eq('tournament_id', tournamentId);

  const participants = (ps || []) as Participant[];
  if (participants.length === 0) {
    return {
      topScorer: null,
      mostWins: null,
      mostPoints: null,
      bestGoalDiff: null,
      fewestConceded: null,
      longestWinStreak: null,
      longestUnbeatenStreak: null,
      biggestWinMatch: null,
      allPlayerStats: [],
    };
  }

  const pMap = new Map<string, Participant>(participants.map((p) => [p.id, p]));

  // 2. Fetch completed matches
  const { data: matches } = await (supabase.from('matches') as unknown as UnknownQuery)
    .select('*')
    .order('created_at', { ascending: true });

  const allMatches = ((matches || []) as Match[]).filter(
    (m) => (m.status === 'completed' || m.status === 'walkover') && m.participant_a && m.participant_b
  );

  // Initialize stats map
  const statsMap = new Map<string, PlayerStatsCard>();
  for (const p of participants) {
    statsMap.set(p.id, {
      participant: p,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      cleanSheets: 0,
      winStreak: 0,
      unbeatenStreak: 0,
      biggestWinMargin: 0,
      biggestWinText: '',
    });
  }

  // Track match outcomes per player chronologically for streak computation
  const playerOutcomesMap = new Map<string, ('W' | 'D' | 'L')[]>();
  for (const p of participants) playerOutcomesMap.set(p.id, []);

  let biggestWinMatchInfo: { winner: Participant; loser: Participant; scoreText: string; margin: number } | null = null;
  let maxMargin = 0;

  for (const m of allMatches) {
    const rowA = statsMap.get(m.participant_a!);
    const rowB = statsMap.get(m.participant_b!);
    if (!rowA || !rowB) continue;

    rowA.played += 1;
    rowB.played += 1;

    if (m.status === 'walkover') {
      if (m.winner_id === rowA.participant.id) {
        rowA.wins += 1;
        rowA.points += 3;
        rowB.losses += 1;
        playerOutcomesMap.get(rowA.participant.id)?.push('W');
        playerOutcomesMap.get(rowB.participant.id)?.push('L');
      } else {
        rowB.wins += 1;
        rowB.points += 3;
        rowA.losses += 1;
        playerOutcomesMap.get(rowB.participant.id)?.push('W');
        playerOutcomesMap.get(rowA.participant.id)?.push('L');
      }
    } else {
      rowA.goalsFor += m.score_a;
      rowA.goalsAgainst += m.score_b;
      rowA.goalDifference = rowA.goalsFor - rowA.goalsAgainst;

      rowB.goalsFor += m.score_b;
      rowB.goalsAgainst += m.score_a;
      rowB.goalDifference = rowB.goalsFor - rowB.goalsAgainst;

      if (m.score_b === 0) rowA.cleanSheets += 1;
      if (m.score_a === 0) rowB.cleanSheets += 1;

      if (m.score_a > m.score_b) {
        rowA.wins += 1;
        rowA.points += 3;
        rowB.losses += 1;
        playerOutcomesMap.get(rowA.participant.id)?.push('W');
        playerOutcomesMap.get(rowB.participant.id)?.push('L');

        const margin = m.score_a - m.score_b;
        if (margin > rowA.biggestWinMargin) {
          rowA.biggestWinMargin = margin;
          rowA.biggestWinText = `${m.score_a} - ${m.score_b} vs ${rowB.participant.username}`;
        }
        if (margin > maxMargin) {
          maxMargin = margin;
          biggestWinMatchInfo = {
            winner: rowA.participant,
            loser: rowB.participant,
            scoreText: `${m.score_a} - ${m.score_b}`,
            margin,
          };
        }
      } else if (m.score_b > m.score_a) {
        rowB.wins += 1;
        rowB.points += 3;
        rowA.losses += 1;
        playerOutcomesMap.get(rowB.participant.id)?.push('W');
        playerOutcomesMap.get(rowA.participant.id)?.push('L');

        const margin = m.score_b - m.score_a;
        if (margin > rowB.biggestWinMargin) {
          rowB.biggestWinMargin = margin;
          rowB.biggestWinText = `${m.score_b} - ${m.score_a} vs ${rowA.participant.username}`;
        }
        if (margin > maxMargin) {
          maxMargin = margin;
          biggestWinMatchInfo = {
            winner: rowB.participant,
            loser: rowA.participant,
            scoreText: `${m.score_b} - ${m.score_a}`,
            margin,
          };
        }
      } else {
        rowA.draws += 1;
        rowA.points += 1;
        rowB.draws += 1;
        rowB.points += 1;
        playerOutcomesMap.get(rowA.participant.id)?.push('D');
        playerOutcomesMap.get(rowB.participant.id)?.push('D');
      }
    }
  }

  // Compute streaks
  for (const p of participants) {
    const card = statsMap.get(p.id);
    if (!card) continue;
    const outcomes = playerOutcomesMap.get(p.id) || [];

    let currentWin = 0;
    let maxWin = 0;
    let currentUnbeaten = 0;
    let maxUnbeaten = 0;

    for (const res of outcomes) {
      if (res === 'W') {
        currentWin++;
        if (currentWin > maxWin) maxWin = currentWin;
      } else {
        currentWin = 0;
      }

      if (res === 'W' || res === 'D') {
        currentUnbeaten++;
        if (currentUnbeaten > maxUnbeaten) maxUnbeaten = currentUnbeaten;
      } else {
        currentUnbeaten = 0;
      }
    }

    card.winStreak = maxWin;
    card.unbeatenStreak = maxUnbeaten;
  }

  const allPlayerStats = Array.from(statsMap.values());

  const topScorer = [...allPlayerStats].sort((a, b) => b.goalsFor - a.goalsFor)[0] || null;
  const mostWins = [...allPlayerStats].sort((a, b) => b.wins - a.wins)[0] || null;
  const mostPoints = [...allPlayerStats].sort((a, b) => b.points - a.points)[0] || null;
  const bestGoalDiff = [...allPlayerStats].sort((a, b) => b.goalDifference - a.goalDifference)[0] || null;
  const fewestConceded = [...allPlayerStats].filter((s) => s.played > 0).sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0] || null;

  const longestWinStreak = [...allPlayerStats]
    .filter((s) => s.winStreak > 0)
    .sort((a, b) => b.winStreak - a.winStreak)
    .map((s) => ({ participant: s.participant, count: s.winStreak }))[0] || null;

  const longestUnbeatenStreak = [...allPlayerStats]
    .filter((s) => s.unbeatenStreak > 0)
    .sort((a, b) => b.unbeatenStreak - a.unbeatenStreak)
    .map((s) => ({ participant: s.participant, count: s.unbeatenStreak }))[0] || null;

  return {
    topScorer: topScorer && topScorer.goalsFor > 0 ? topScorer : null,
    mostWins: mostWins && mostWins.wins > 0 ? mostWins : null,
    mostPoints: mostPoints && mostPoints.points > 0 ? mostPoints : null,
    bestGoalDiff: bestGoalDiff && bestGoalDiff.played > 0 ? bestGoalDiff : null,
    fewestConceded,
    longestWinStreak,
    longestUnbeatenStreak,
    biggestWinMatch: biggestWinMatchInfo,
    allPlayerStats,
  };
}
