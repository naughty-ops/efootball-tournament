import { createClient } from '@/lib/supabase/client';
import type { Tournament, TournamentStatus, TournamentFormat, Participant, Group, Round, Match } from '@/types/database';
import type { TournamentInput } from '@/lib/validations';
import { getTournamentSubStage } from '@/lib/lifecycle/lifecycleEngine';
import { FullMatchData } from '@/services/matchService';
import { generateKnockoutBracket, getTournamentBracket } from '@/services/bracketService';
import { getTournamentGroups, setupTournamentGroups } from '@/services/groupService';

export interface TournamentWithStats extends Tournament {
  participant_count: number;
  championUser?: Participant | null;
  runnerUpUser?: Participant | null;
}

export interface GetTournamentsParams {
  search?: string;
  status?: string;
  sort?: 'newest' | 'oldest' | 'start_date';
}

export const ALLOWED_STATUS_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ['registration', 'ongoing'],
  registration: ['ongoing', 'draft'],
  ongoing: ['completed', 'draft', 'registration'],
  completed: ['ongoing'],
};

interface SupabaseTournamentRow extends Tournament {
  participants?: { count: number }[];
  champion?: Participant | null;
  runner_up?: Participant | null;
}

type UnknownQuery = {
  select: (columns: string) => UnknownQuery;
  ilike: (column: string, pattern: string) => UnknownQuery;
  eq: (column: string, value: unknown) => UnknownQuery;
  in: (column: string, values: unknown[]) => UnknownQuery;
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => UnknownQuery;
  single: () => Promise<{ data: unknown; error: { code?: string; message?: string; details?: string; hint?: string } | null }>;
  insert: (payload: unknown) => UnknownQuery;
  update: (payload: unknown) => UnknownQuery;
  delete: () => UnknownQuery;
  then: Promise<{ data: unknown; error: { code?: string; message?: string; details?: string; hint?: string } | null }>['then'];
};

function formatSupabaseError(error: unknown): string {
  if (!error) return 'Unknown database error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;
    const msg = (errObj.message || errObj.details || errObj.hint || errObj.code || errObj.error_description) as string | undefined;
    if (msg) return String(msg);
  }
  try {
    const jsonStr = JSON.stringify(error, Object.getOwnPropertyNames(error));
    return jsonStr !== '{}' && jsonStr !== '[]' ? jsonStr : 'Database request failed. Please check table constraints or permissions.';
  } catch {
    return 'Database error occurred (unserializable)';
  }
}

/**
 * Fetch tournaments with optional search, status filtering, and sorting
 */
export async function getTournaments(params?: GetTournamentsParams): Promise<TournamentWithStats[]> {
  const supabase = createClient();
  let query = (supabase.from('tournaments') as unknown as UnknownQuery).select(
    '*, participants:participants!participants_tournament_id_fkey(count), champion:participants!tournaments_champion_id_fkey(*), runner_up:participants!tournaments_runner_up_id_fkey(*)'
  );

  if (params?.search && params.search.trim().length > 0) {
    query = query.ilike('name', `%${params.search.trim()}%`);
  }

  if (params?.status && params.status !== 'all') {
    query = query.eq('status', params.status as TournamentStatus);
  }

  if (params?.sort === 'oldest') {
    query = query.order('created_at', { ascending: true });
  } else if (params?.sort === 'start_date') {
    query = query.order('start_date', { ascending: true, nullsFirst: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching tournaments:', error);
    throw new Error(`Failed to load tournaments: ${formatSupabaseError(error)}`);
  }

  const rows = (data || []) as SupabaseTournamentRow[];

  return rows.map((t) => ({
    ...t,
    participant_count: t.participants?.[0]?.count ?? 0,
    championUser: t.champion ?? null,
    runnerUpUser: t.runner_up ?? null,
  }));
}

/**
 * Fetch a single tournament by UUID with participant count, champion, and runner-up
 */
export async function getTournamentById(id: string): Promise<TournamentWithStats | null> {
  const supabase = createClient();
  const { data, error } = await (supabase.from('tournaments') as unknown as UnknownQuery)
    .select(
      '*, participants:participants!participants_tournament_id_fkey(count), champion:participants!tournaments_champion_id_fkey(*), runner_up:participants!tournaments_runner_up_id_fkey(*)'
    )
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('Error fetching tournament by ID:', error);
    throw new Error(`Failed to load tournament: ${formatSupabaseError(error)}`);
  }

  const row = data as SupabaseTournamentRow;

  return {
    ...row,
    participant_count: row.participants?.[0]?.count ?? 0,
    championUser: row.champion ?? null,
    runnerUpUser: row.runner_up ?? null,
  };
}

/**
 * Create a new tournament in Supabase
 */
export async function createTournament(input: TournamentInput): Promise<Tournament> {
  const supabase = createClient();

  const dbFormat = input.format === 'single_league_knockout' ? 'group_knockout' : (input.format as TournamentFormat);

  const insertPayload = {
    name: input.name,
    description: input.description || null,
    format: dbFormat,
    status: input.status as TournamentStatus,
    start_date: input.start_date ? new Date(input.start_date).toISOString() : null,
    end_date: input.end_date ? new Date(input.end_date).toISOString() : null,
    rules_text: input.rules_text || null,
    banner_image: input.banner_image || null,
    max_participants: input.max_participants,
  };

  const { data, error } = await (supabase.from('tournaments') as unknown as UnknownQuery)
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) {
    console.error('Error creating tournament:', error);
    throw new Error(`Failed to create tournament: ${formatSupabaseError(error)}`);
  }

  return data as Tournament;
}

/**
 * Update an existing tournament by UUID
 */
export async function updateTournament(id: string, input: TournamentInput): Promise<Tournament> {
  const supabase = createClient();

  const dbFormat = input.format === 'single_league_knockout' ? 'group_knockout' : (input.format as TournamentFormat);

  const updatePayload = {
    name: input.name,
    description: input.description || null,
    format: dbFormat,
    status: input.status as TournamentStatus,
    start_date: input.start_date ? new Date(input.start_date).toISOString() : null,
    end_date: input.end_date ? new Date(input.end_date).toISOString() : null,
    rules_text: input.rules_text || null,
    banner_image: input.banner_image || null,
    max_participants: input.max_participants,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await (supabase.from('tournaments') as unknown as UnknownQuery)
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('Error updating tournament:', error);
    throw new Error(`Failed to update tournament: ${formatSupabaseError(error)}`);
  }

  return data as Tournament;
}

/**
 * Update tournament status with lifecycle validation rules
 */
export async function updateTournamentStatus(
  id: string,
  currentStatus: TournamentStatus,
  newStatus: TournamentStatus
): Promise<Tournament> {
  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid status transition from "${currentStatus}" to "${newStatus}".`);
  }

  const supabase = createClient();
  const { data, error } = await (supabase.from('tournaments') as unknown as UnknownQuery)
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('Error updating tournament status:', error);
    throw new Error(`Failed to update status: ${formatSupabaseError(error)}`);
  }

  return data as Tournament;
}

/**
 * Delete a tournament by UUID
 */
export async function deleteTournament(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('tournaments').delete().eq('id', id);

  if (error) {
    console.error('Error deleting tournament:', error);
    throw new Error(`Failed to delete tournament: ${formatSupabaseError(error)}`);
  }
}

/**
 * Get comprehensive stage info and lifecycle state for a tournament
 */
export async function getTournamentStageInfo(tournamentId: string) {
  const supabase = createClient();
  const t = await getTournamentById(tournamentId);
  if (!t) throw new Error('Tournament not found');

  const [
    { data: participants },
    { data: groups },
    { data: rounds },
  ] = await Promise.all([
    supabase.from('participants').select('*').eq('tournament_id', tournamentId),
    supabase.from('groups').select('*').eq('tournament_id', tournamentId),
    supabase.from('rounds').select('*').eq('tournament_id', tournamentId),
  ]);

  const psList = (participants || []) as Participant[];
  const gList = (groups || []) as Group[];
  const rList = (rounds || []) as Round[];

  const participantMap = new Map<string, Participant>(psList.map((p) => [p.id, p]));

  const roundIds = rList.map((r) => r.id);
  const groupIds = gList.map((g) => g.id);

  const rawMatches: Match[] = [];

  const [rMatchesRes, gMatchesRes] = await Promise.all([
    roundIds.length > 0
      ? (supabase.from('matches') as unknown as UnknownQuery).select('*').in('round_id', roundIds)
      : Promise.resolve({ data: [] }),
    groupIds.length > 0
      ? (supabase.from('matches') as unknown as UnknownQuery).select('*').in('group_id', groupIds)
      : Promise.resolve({ data: [] }),
  ]);

  if (rMatchesRes.data) {
    rawMatches.push(...(rMatchesRes.data as Match[]));
  }

  if (gMatchesRes.data) {
    const matchMap = new Map<string, Match>(rawMatches.map((m) => [m.id, m]));
    for (const gm of gMatchesRes.data as Match[]) {
      if (!matchMap.has(gm.id)) {
        rawMatches.push(gm);
      }
    }
  }

  const mList: FullMatchData[] = rawMatches.map((m) => ({
    ...m,
    participantAUser: m.participant_a ? participantMap.get(m.participant_a) || null : null,
    participantBUser: m.participant_b ? participantMap.get(m.participant_b) || null : null,
    winnerUser: m.winner_id ? participantMap.get(m.winner_id) || null : null,
  }));

  const subStage = getTournamentSubStage(t, mList, rList);

  const groupMatches = mList.filter((m) => m.group_id !== null && m.group_id !== undefined);
  const knockoutMatches = mList.filter((m) => (m.group_id === null || m.group_id === undefined) && m.round_id !== null && m.round_id !== undefined);

  const groupMatchesTotal = groupMatches.length;
  const groupMatchesCompleted = groupMatches.filter(
    (m) => m.status === 'completed' || m.status === 'walkover'
  ).length;
  const isGroupStageComplete = groupMatchesTotal > 0 && groupMatchesCompleted === groupMatchesTotal;

  const knockoutMatchesTotal = knockoutMatches.length;
  const knockoutMatchesCompleted = knockoutMatches.filter(
    (m) => m.status === 'completed' || m.status === 'walkover'
  ).length;

  let finalMatch: FullMatchData | null = null;
  let finalWinner: Participant | null = null;

  if (knockoutMatches.length > 0) {
    const knockoutRoundIds = new Set(knockoutMatches.map((m) => m.round_id).filter(Boolean));
    const knockoutRounds = rList.filter((r) => knockoutRoundIds.has(r.id));

    if (knockoutRounds.length > 0) {
      const maxRoundNum = Math.max(...knockoutRounds.map((r) => r.round_number));
      const finalRound = knockoutRounds.find((r) => r.round_number === maxRoundNum);
      if (finalRound) {
        finalMatch = knockoutMatches.find((m) => m.round_id === finalRound.id) || null;
        if (finalMatch?.winnerUser) {
          finalWinner = finalMatch.winnerUser;
        } else if (finalMatch?.winner_id) {
          finalWinner = participantMap.get(finalMatch.winner_id) || null;
        }
      }
    }
  }

  let champion: Participant | null = null;
  if (t.champion_id) {
    champion = psList.find((p) => p.id === t.champion_id) || null;
  } else if (finalWinner && t.status === 'completed') {
    champion = finalWinner;
  }

  return {
    tournament: t,
    subStage,
    participants: psList,
    participantsCount: psList.length,
    maxParticipants: t.max_participants,
    groups: gList,
    rounds: rList,
    matches: mList,
    groupMatchesTotal,
    groupMatchesCompleted,
    isGroupStageComplete,
    isGroupStageFinalized: t.is_group_stage_finalized,
    knockoutMatchesTotal,
    knockoutMatchesCompleted,
    finalMatch,
    finalWinner,
    champion,
  };
}

/**
 * Explicitly start a tournament after validating configuration and participant counts
 */
export async function startTournament(tournamentId: string): Promise<Tournament> {
  const info = await getTournamentStageInfo(tournamentId);

  if (info.participantsCount < 2) {
    throw new Error(`Cannot start tournament: At least 2 participants are required (currently ${info.participantsCount}).`);
  }

  // Automatic fixture generation depending on format & existing rounds
  if (info.tournament.format === 'knockout') {
    const bracket = await getTournamentBracket(tournamentId);
    if (bracket.rounds.length === 0) {
      await generateKnockoutBracket(tournamentId);
    }
  } else if (info.tournament.format === 'group_knockout') {
    const groupOverview = await getTournamentGroups(tournamentId);
    if (groupOverview.groups.length === 0) {
      const groupCount = Math.max(2, Math.min(8, Math.floor(info.participantsCount / 4) || 2));
      await setupTournamentGroups(tournamentId, groupCount, 2, 1);
    }
  }

  return updateTournamentStatus(tournamentId, info.tournament.status, 'ongoing');
}

/**
 * Complete a tournament after the Final match is played and a Champion is determined
 */
export async function completeTournament(tournamentId: string): Promise<Tournament> {
  const supabase = createClient();
  const info = await getTournamentStageInfo(tournamentId);

  if (!info.finalMatch || (info.finalMatch.status !== 'completed' && info.finalMatch.status !== 'walkover') || !info.finalWinner) {
    throw new Error('Cannot complete tournament: The Final match has not been played or completed with a valid winner yet.');
  }

  const championId = info.finalWinner.id;

  const { data, error } = await (supabase.from('tournaments') as unknown as UnknownQuery)
    .update({
      status: 'completed',
      champion_id: championId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tournamentId)
    .select('*')
    .single();

  if (error) {
    console.error('Error completing tournament:', error);
    throw new Error(`Failed to complete tournament: ${formatSupabaseError(error)}`);
  }

  return data as Tournament;
}
