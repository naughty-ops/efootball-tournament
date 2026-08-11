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

export type LiveMatchEntry = {
  match: Match & { participantAName?: string; participantBName?: string; tournamentName?: string };
  round: Round & { tournamentId: string };
};

// Lightweight In-Memory TTL Cache for Instant Navigation (< 50ms responses)
const CACHE_TTL_MS = 10000; // 10 seconds
let cachedTournaments: { data: TournamentWithStats[]; timestamp: number; key: string } | null = null;
let cachedLiveMatches: { data: LiveMatchEntry[]; timestamp: number; key: string } | null = null;

export function clearPublicCache() {
  cachedTournaments = null;
  cachedLiveMatches = null;
}

/**
 * Public-safe tournament list with SWR-style in-memory cache
 */
export async function getPublicTournaments(params?: {
  search?: string;
  status?: string;
  bypassCache?: boolean;
}): Promise<TournamentWithStats[]> {
  const cacheKey = `${params?.search || ''}_${params?.status || ''}`;
  const now = Date.now();

  if (!params?.bypassCache && cachedTournaments && cachedTournaments.key === cacheKey && now - cachedTournaments.timestamp < CACHE_TTL_MS) {
    return cachedTournaments.data;
  }

  const data = await getTournaments({
    search: params?.search,
    status: params?.status,
    sort: 'newest',
  });

  cachedTournaments = { data, timestamp: now, key: cacheKey };
  return data;
}

/**
 * Fetch a single tournament for public display.
 */
export async function getPublicTournament(id: string): Promise<TournamentWithStats | null> {
  return getTournamentById(id);
}

/**
 * Fetch tournament stage info for public overview tab.
 */
export async function getPublicTournamentStageInfo(tournamentId: string) {
  return getTournamentStageInfo(tournamentId);
}

/**
 * Fetch participants for public display — strips contact_info and other private fields.
 */
export async function getPublicParticipants(tournamentId: string): Promise<PublicParticipant[]> {
  const supabase = createClient();

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
 * Fetch group stage overview.
 */
export async function getPublicGroupStage(tournamentId: string): Promise<GroupStageOverview> {
  return getTournamentGroups(tournamentId);
}

/**
 * Fetch knockout bracket data.
 */
export async function getPublicBracket(tournamentId: string): Promise<BracketOverview> {
  return getTournamentBracket(tournamentId);
}

/**
 * Fetch all matches for public display.
 */
export async function getPublicMatches(tournamentId: string): Promise<RoundWithMatches[]> {
  return getMatchesByTournament(tournamentId);
}

/**
 * Fetch currently live matches with in-memory TTL caching
 */
export async function getPublicLiveMatches(
  tournamentId?: string,
  bypassCache = false
): Promise<LiveMatchEntry[]> {
  const cacheKey = tournamentId || 'all';
  const now = Date.now();

  if (!bypassCache && cachedLiveMatches && cachedLiveMatches.key === cacheKey && now - cachedLiveMatches.timestamp < CACHE_TTL_MS) {
    return cachedLiveMatches.data;
  }

  const supabase = createClient();

  let matchQuery = supabase
    .from('matches')
    .select('id, round_id, group_id, participant_a, participant_b, scheduled_time, status, score_a, score_b, winner_id, notes, match_position, updated_at')
    .eq('status', 'live')
    .order('updated_at', { ascending: false });

  if (tournamentId) {
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
      ? supabase.from('rounds').select('id, name, round_number, tournament_id').in('id', Array.from(roundIds))
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

  const result = (liveMatches as Match[])
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

  cachedLiveMatches = { data: result, timestamp: now, key: cacheKey };
  return result;
}
