import { createClient } from '@/lib/supabase/client';
import type { Tournament, Match, Round } from '@/types/database';
import { getTournamentById } from '@/services/tournamentService';
import { generateKnockoutBracket } from '@/services/bracketService';
import { generateLeagueFixtures } from '@/services/leagueService';
import { setupTournamentGroups } from '@/services/groupService';

type UnknownQuery = {
  select: (columns: string, options?: unknown) => UnknownQuery;
  eq: (column: string, value: unknown) => UnknownQuery;
  in: (column: string, values: unknown[]) => UnknownQuery;
  single: () => Promise<{ data: unknown; error: { code?: string; message?: string; details?: string; hint?: string } | null }>;
  delete: () => UnknownQuery;
  then: Promise<{ data: unknown; count?: number | null; error: { code?: string; message?: string; details?: string; hint?: string } | null }>['then'];
};

export interface FixtureStatusSummary {
  isGenerated: boolean;
  totalRounds: number;
  totalMatches: number;
  completedMatches: number;
  pendingMatches: number;
  format: string;
}

/**
 * Get comprehensive fixture generation status for a tournament
 */
export async function getFixtureStatus(tournamentId: string): Promise<FixtureStatusSummary> {
  const supabase = createClient();
  const tObj = await getTournamentById(tournamentId);

  const { data: rData } = await (supabase.from('rounds') as unknown as UnknownQuery)
    .select('*')
    .eq('tournament_id', tournamentId);

  const rounds = (rData || []) as Round[];
  if (rounds.length === 0) {
    return {
      isGenerated: false,
      totalRounds: 0,
      totalMatches: 0,
      completedMatches: 0,
      pendingMatches: 0,
      format: tObj?.format || 'knockout',
    };
  }

  const roundIds = rounds.map((r) => r.id);
  const { data: mData } = await (supabase.from('matches') as unknown as UnknownQuery)
    .select('*')
    .in('round_id', roundIds);

  const matches = (mData || []) as Match[];
  const completedMatches = matches.filter(
    (m) => m.status === 'completed' || m.status === 'walkover'
  ).length;

  return {
    isGenerated: matches.length > 0,
    totalRounds: rounds.length,
    totalMatches: matches.length,
    completedMatches: completedMatches,
    pendingMatches: matches.length - completedMatches,
    format: tObj?.format || 'knockout',
  };
}

/**
 * Unified Auto-Generate Fixtures Router based on Tournament Format
 */
export async function generateTournamentFixtures(
  tournamentId: string,
  options?: { groupCount?: number; roundsPerPair?: number }
): Promise<void> {
  const tObj = await getTournamentById(tournamentId);
  if (!tObj) throw new Error('Tournament not found.');

  switch (tObj.format) {
    case 'knockout':
      await generateKnockoutBracket(tournamentId);
      break;

    case 'league':
      await generateLeagueFixtures(tournamentId, options?.roundsPerPair || tObj.rounds_per_pair || 1);
      break;

    case 'group_knockout':
      await setupTournamentGroups(
        tournamentId,
        options?.groupCount || 2,
        tObj.qualifiers_per_group || 2,
        options?.roundsPerPair || tObj.rounds_per_pair || 1
      );
      break;

    default:
      throw new Error(`Unsupported tournament format: ${tObj.format}`);
  }
}

/**
 * Regenerate Fixtures with safety checks
 */
export async function regenerateTournamentFixtures(
  tournamentId: string,
  options?: { groupCount?: number; roundsPerPair?: number }
): Promise<void> {
  const status = await getFixtureStatus(tournamentId);
  if (status.completedMatches > 0) {
    throw new Error('Cannot regenerate fixtures for a tournament containing completed match results.');
  }

  await generateTournamentFixtures(tournamentId, options);
}
