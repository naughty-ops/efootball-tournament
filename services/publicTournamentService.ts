import { createClient } from '@/lib/supabase/client';
import type { Match, Round } from '@/types/database';
import type { TournamentWithStats } from '@/services/tournamentService';
import type { GroupStageOverview } from '@/services/groupService';
import type { BracketOverview } from '@/services/bracketService';
import type { RoundWithMatches } from '@/services/matchService';
import { getTournaments, getTournamentById, getTournamentStageInfo } from '@/services/tournamentService';
import { getTournamentGroups } from '@/services/groupService';
import { getTournamentBracket } from '@/services/bracketService';
import { getMatchesByTournament } from '@/services/matchService';

/**
 * Public-safe participant type — no sensitive fields exposed
 */
export interface PublicParticipant {
  id: string;
  username: string;
  seed_number: number | null;
  status: string;
}

/**
 * Public-safe tournament list (reuses existing getTournaments)
 * All data is public-readable. No admin-only fields exposed.
 */
export async function getPublicTournaments(params?: {
  search?: string;
  status?: string;
}): Promise<TournamentWithStats[]> {
  return getTournaments({
    search: params?.search,
    status: params?.status,
    sort: 'newest',
  });
}

/**
 * Fetch a single tournament for public display.
 * Returns null if tournament not found.
 */
export async function getPublicTournament(id: string): Promise<TournamentWithStats | null> {
  return getTournamentById(id);
}

/**
 * Fetch tournament stage info for public overview tab.
 * All field-safe data — no admin controls.
 */
export async function getPublicTournamentStageInfo(tournamentId: string) {
  return getTournamentStageInfo(tournamentId);
}

/**
 * Fetch participants for public display — strips contact_info and other private fields.
 */
export async function getPublicParticipants(tournamentId: string): Promise<PublicParticipant[]> {
  const supabase = createClient();

  // Explicitly select only safe public fields — no contact_info / internal fields
  const { data, error } = await supabase
    .from('participants')
    .select('id, username, seed_number, status')
    .eq('tournament_id', tournamentId)
    .order('seed_number', { ascending: true });

  if (error) {
    console.error('Error fetching public participants:', error);
    throw new Error('Failed to load participants.');
  }

  return (data || []) as PublicParticipant[];
}

/**
 * Fetch group stage overview (standings, fixtures, rounds).
 * Reuses existing getTournamentGroups engine — no separate logic.
 */
export async function getPublicGroupStage(tournamentId: string): Promise<GroupStageOverview> {
  return getTournamentGroups(tournamentId);
}

/**
 * Fetch knockout bracket data for public display.
 * Reuses existing getTournamentBracket engine.
 */
export async function getPublicBracket(tournamentId: string): Promise<BracketOverview> {
  return getTournamentBracket(tournamentId);
}

/**
 * Fetch all matches (grouped by round) for public display.
 * Reuses existing getMatchesByTournament.
 */
export async function getPublicMatches(tournamentId: string): Promise<RoundWithMatches[]> {
  return getMatchesByTournament(tournamentId);
}

/**
 * Fetch currently live matches across all tournaments or for a specific tournament.
 */
export async function getPublicLiveMatches(tournamentId?: string): Promise<{
  match: Match & { participantAName?: string; participantBName?: string; tournamentName?: string };
  round: Round & { tournamentId: string };
}[]> {
  const supabase = createClient();

  let matchQuery = supabase
    .from('matches')
    .select('*')
    .eq('status', 'live')
    .order('updated_at', { ascending: false });

  if (tournamentId) {
    // Filter via rounds that belong to this tournament
    const { data: rounds } = await supabase
      .from('rounds')
      .select('id')
      .eq('tournament_id', tournamentId);
    const roundIds = (rounds || []).map((r: { id: string }) => r.id);
    if (roundIds.length > 0) {
      matchQuery = matchQuery.in('round_id', roundIds);
    } else {
      return [];
    }
  }

  const { data: liveMatches, error } = await matchQuery;
  if (error || !liveMatches) return [];

  // Collect all relevant participant and round IDs
  const participantIds = new Set<string>();
  const roundIds = new Set<string>();
  for (const m of liveMatches as Match[]) {
    if (m.participant_a) participantIds.add(m.participant_a);
    if (m.participant_b) participantIds.add(m.participant_b);
    if (m.round_id) roundIds.add(m.round_id);
  }

  // Batch-fetch participants and rounds concurrently
  const [participantsRes, roundsRes] = await Promise.all([
    participantIds.size > 0
      ? supabase.from('participants').select('id, username').in('id', Array.from(participantIds))
      : Promise.resolve({ data: [] }),
    roundIds.size > 0
      ? supabase.from('rounds').select('*').in('id', Array.from(roundIds))
      : Promise.resolve({ data: [] }),
  ]);

  const participantMap = new Map<string, string>();
  for (const p of (participantsRes.data || []) as { id: string; username: string }[]) {
    participantMap.set(p.id, p.username);
  }

  const roundMap = new Map<string, Round & { tournamentId: string }>();
  const tournamentIds = new Set<string>();
  for (const r of (roundsRes.data || []) as (Round & { tournament_id: string })[]) {
    roundMap.set(r.id, { ...r, tournamentId: r.tournament_id });
    if (r.tournament_id) tournamentIds.add(r.tournament_id);
  }

  const tournamentNameMap = new Map<string, string>();
  if (tournamentIds.size > 0) {
    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('id, name')
      .in('id', Array.from(tournamentIds));
    for (const t of (tournaments || []) as { id: string; name: string }[]) {
      tournamentNameMap.set(t.id, t.name);
    }
  }

  return (liveMatches as Match[])
    .filter((m) => m.round_id && roundMap.has(m.round_id))
    .map((m) => {
      const round = roundMap.get(m.round_id!)!;
      return {
        match: {
          ...m,
          participantAName: m.participant_a ? participantMap.get(m.participant_a) : undefined,
          participantBName: m.participant_b ? participantMap.get(m.participant_b) : undefined,
          tournamentName: tournamentNameMap.get(round.tournamentId),
        },
        round,
      };
    });
}
