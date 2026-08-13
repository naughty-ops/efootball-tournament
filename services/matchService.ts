import { createClient } from '@/lib/supabase/client';
import type { Match, Round, Participant, MatchStatus, Tournament } from '@/types/database';
import type { MatchResultInput } from '@/lib/validations';
import { finalizeGroupStage, prepareKnockoutFromGroups, getGroupKnockoutTransitionPreview, getTournamentGroups } from '@/services/groupService';

export interface FullMatchData extends Match {
  participantAUser?: Participant | null;
  participantBUser?: Participant | null;
  winnerUser?: Participant | null;
}

export interface RoundWithMatches extends Round {
  matches: FullMatchData[];
}

export interface MatchDetailsOverview {
  match: FullMatchData;
  round: Round;
  tournamentId: string;
}

type UnknownQuery = {
  select: (columns: string, options?: unknown) => UnknownQuery;
  eq: (column: string, value: unknown) => UnknownQuery;
  in: (column: string, values: unknown[]) => UnknownQuery;
  order: (column: string, options?: { ascending?: boolean }) => UnknownQuery;
  single: () => Promise<{ data: unknown; error: { code?: string; message?: string; details?: string; hint?: string } | null }>;
  insert: (payload: unknown) => UnknownQuery;
  update: (payload: unknown) => UnknownQuery;
  delete: () => UnknownQuery;
  then: Promise<{ data: unknown; count?: number | null; error: { code?: string; message?: string; details?: string; hint?: string } | null }>['then'];
};

function formatSupabaseError(error: unknown): string {
  if (!error) return 'Unknown database error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const errObj = error as { message?: string; details?: string; hint?: string; code?: string };
    if (errObj.message) return errObj.message;
    if (errObj.details) return errObj.details;
    if (errObj.hint) return errObj.hint;
    if (errObj.code) return `Database error code: ${errObj.code}`;
  }
  return 'Database query error';
}

/**
 * Fetch all matches for a tournament grouped by round
 */
export async function getMatchesByTournament(
  tournamentId: string,
  statusFilter?: string
): Promise<RoundWithMatches[]> {
  const supabase = createClient();

  // 1. Fetch Rounds
  const rRes = await (supabase.from('rounds') as unknown as UnknownQuery)
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('round_number', { ascending: true });

  const rounds = (rRes.data || []) as Round[];
  if (rounds.length === 0) return [];

  // 2. Fetch Participants
  const pRes = await (supabase.from('participants') as unknown as UnknownQuery)
    .select('*')
    .eq('tournament_id', tournamentId);

  const participants = (pRes.data || []) as Participant[];
  const participantMap = new Map<string, Participant>(participants.map((p) => [p.id, p]));

  // 3. Fetch Matches
  const roundIds = rounds.map((r) => r.id);
  const mRes = await (supabase.from('matches') as unknown as UnknownQuery)
    .select('*')
    .in('round_id', roundIds)
    .order('match_position', { ascending: true });

  let matches = (mRes.data || []) as Match[];

  if (statusFilter && statusFilter !== 'all') {
    matches = matches.filter((m) => m.status === statusFilter);
  }

  // Group matches by round_id
  const matchMap = new Map<string, FullMatchData[]>();
  for (const m of matches) {
    const fullMatch: FullMatchData = {
      ...m,
      participantAUser: m.participant_a ? participantMap.get(m.participant_a) || null : null,
      participantBUser: m.participant_b ? participantMap.get(m.participant_b) || null : null,
      winnerUser: m.winner_id ? participantMap.get(m.winner_id) || null : null,
    };

    const list = matchMap.get(m.round_id) || [];
    list.push(fullMatch);
    matchMap.set(m.round_id, list);
  }

  return rounds
    .map((r) => ({
      ...r,
      matches: matchMap.get(r.id) || [],
    }))
    .filter((r) => !statusFilter || statusFilter === 'all' || r.matches.length > 0);
}

/**
 * Fetch single match enforcing tournament isolation (match -> round -> tournament)
 */
export async function getMatchDetails(
  matchId: string,
  tournamentId: string
): Promise<MatchDetailsOverview> {
  const supabase = createClient();

  const { data: matchData, error: mErr } = await (supabase.from('matches') as unknown as UnknownQuery)
    .select('*')
    .eq('id', matchId)
    .single();

  if (mErr || !matchData) {
    throw new Error(`Match not found: ${formatSupabaseError(mErr)}`);
  }

  const matchObj = matchData as Match;

  // Verify round ownership
  const { data: roundData, error: rErr } = await (supabase.from('rounds') as unknown as UnknownQuery)
    .select('*')
    .eq('id', matchObj.round_id)
    .single();

  if (rErr || !roundData) {
    throw new Error(`Round not found: ${formatSupabaseError(rErr)}`);
  }

  const roundObj = roundData as Round;

  if (roundObj.tournament_id !== tournamentId) {
    throw new Error('Access denied: Match does not belong to the specified tournament.');
  }

  // Fetch Participants
  const participantIds = [matchObj.participant_a, matchObj.participant_b, matchObj.winner_id].filter(
    Boolean
  ) as string[];

  let pMap = new Map<string, Participant>();
  if (participantIds.length > 0) {
    const { data: pData } = await (supabase.from('participants') as unknown as UnknownQuery)
      .select('*')
      .in('id', participantIds);
    if (pData) {
      pMap = new Map((pData as Participant[]).map((p) => [p.id, p]));
    }
  }

  const fullMatch: FullMatchData = {
    ...matchObj,
    participantAUser: matchObj.participant_a ? pMap.get(matchObj.participant_a) || null : null,
    participantBUser: matchObj.participant_b ? pMap.get(matchObj.participant_b) || null : null,
    winnerUser: matchObj.winner_id ? pMap.get(matchObj.winner_id) || null : null,
  };

  return {
    match: fullMatch,
    round: roundObj,
    tournamentId,
  };
}

export interface AdminMatchFilterParams {
  tournamentId?: string;
  stage?: string;
  status?: string;
  date?: string;
  search?: string;
}

export interface MatchWithDetails extends FullMatchData {
  tournamentId: string;
  tournamentName: string;
  tournamentStatus: string;
  isGroupStageFinalized: boolean;
  roundName: string;
  stageType: string;
}

export interface MatchDashboardStats {
  totalMatches: number;
  liveCount: number;
  scheduledCount: number;
  completedCount: number;
}

/**
 * Fetch all matches across tournaments for Centralized Match Center
 */
export async function getAllAdminMatches(params?: AdminMatchFilterParams): Promise<MatchWithDetails[]> {
  const supabase = createClient();

  // 1. Fetch Tournaments
  let tQuery = (supabase.from('tournaments') as unknown as UnknownQuery).select('*');
  if (params?.tournamentId && params.tournamentId !== 'all') {
    tQuery = tQuery.eq('id', params.tournamentId);
  }
  const { data: tData, error: tErr } = await tQuery;
  if (tErr) {
    throw new Error(`Failed to fetch tournaments for Match Center: ${formatSupabaseError(tErr)}`);
  }

  const tournaments = (tData || []) as Tournament[];
  if (tournaments.length === 0) return [];

  const tournamentIds = tournaments.map((t) => t.id);
  const tournamentMap = new Map<string, Tournament>(tournaments.map((t) => [t.id, t]));

  // 2. Fetch Rounds, Groups, and Participants
  const [rRes, gRes, pRes] = await Promise.all([
    (supabase.from('rounds') as unknown as UnknownQuery).select('*').in('tournament_id', tournamentIds),
    (supabase.from('groups') as unknown as UnknownQuery).select('*').in('tournament_id', tournamentIds),
    (supabase.from('participants') as unknown as UnknownQuery).select('*').in('tournament_id', tournamentIds),
  ]);

  const rounds = (rRes.data || []) as Round[];
  const groups = (gRes.data || []) as { id: string; name: string; tournament_id: string }[];
  const participants = (pRes.data || []) as Participant[];

  const roundMap = new Map<string, Round>(rounds.map((r) => [r.id, r]));
  const groupMap = new Map<string, { id: string; name: string; tournament_id: string }>(
    groups.map((g) => [g.id, g])
  );
  const participantMap = new Map<string, Participant>(participants.map((p) => [p.id, p]));

  // 3. Fetch Matches by round_id or group_id
  const roundIds = rounds.map((r) => r.id);
  const groupIds = groups.map((g) => g.id);

  const rawMatches: Match[] = [];
  if (roundIds.length > 0) {
    const { data: rMatches } = await (supabase.from('matches') as unknown as UnknownQuery)
      .select('*')
      .in('round_id', roundIds);
    if (rMatches) rawMatches.push(...(rMatches as Match[]));
  }

  if (groupIds.length > 0) {
    const { data: gMatches } = await (supabase.from('matches') as unknown as UnknownQuery)
      .select('*')
      .in('group_id', groupIds);
    if (gMatches) {
      const matchMap = new Map<string, Match>(rawMatches.map((m) => [m.id, m]));
      for (const gm of gMatches as Match[]) {
        if (!matchMap.has(gm.id)) rawMatches.push(gm);
      }
    }
  }

  // 4. Map & Filter Matches
  let result: MatchWithDetails[] = rawMatches.map((m) => {
    let rObj: Round | undefined;
    let gObj: { id: string; name: string; tournament_id: string } | undefined;

    if (m.round_id) rObj = roundMap.get(m.round_id);
    if (m.group_id) gObj = groupMap.get(m.group_id);

    const tId = rObj?.tournament_id || gObj?.tournament_id || '';
    const tObj = tournamentMap.get(tId);

    let stageType = 'Match';
    let roundName = rObj?.name || 'Match';

    if (m.group_id && gObj) {
      stageType = 'Group';
      roundName = gObj.name;
    } else if (rObj) {
      const rName = rObj.name.toLowerCase();
      if (rName.includes('final') && !rName.includes('semi') && !rName.includes('quarter')) {
        stageType = 'Final';
      } else if (rName.includes('semi')) {
        stageType = 'Semi Final';
      } else if (rName.includes('quarter')) {
        stageType = 'Quarter Final';
      } else if (rName.includes('16') || rName.includes('round of 16')) {
        stageType = 'Round of 16';
      } else {
        stageType = rObj.name || 'Knockout';
      }
    }

    const pA = m.participant_a ? participantMap.get(m.participant_a) || null : null;
    const pB = m.participant_b ? participantMap.get(m.participant_b) || null : null;
    const pW = m.winner_id ? participantMap.get(m.winner_id) || null : null;

    return {
      ...m,
      participantAUser: pA,
      participantBUser: pB,
      winnerUser: pW,
      tournamentId: tId,
      tournamentName: tObj?.name || 'Unknown Tournament',
      tournamentStatus: tObj?.status || 'draft',
      isGroupStageFinalized: tObj?.is_group_stage_finalized || false,
      roundName,
      stageType,
    };
  });

  // Stage Filter
  if (params?.stage && params.stage !== 'all') {
    const targetStage = params.stage.toLowerCase().replace(/_/g, '').replace(/\s+/g, '');
    result = result.filter((m) => {
      const sType = m.stageType.toLowerCase().replace(/_/g, '').replace(/\s+/g, '');
      const rName = m.roundName.toLowerCase().replace(/_/g, '').replace(/\s+/g, '');
      if (targetStage === 'group') return m.group_id !== null && m.group_id !== undefined;
      return sType.includes(targetStage) || rName.includes(targetStage) || targetStage.includes(sType);
    });
  }

  // Status Filter
  if (params?.status && params.status !== 'all') {
    result = result.filter((m) => m.status === params.status);
  }

  // Date Filter (Today)
  if (params?.date === 'today') {
    const todayStr = new Date().toISOString().slice(0, 10);
    result = result.filter((m) => {
      if (m.scheduled_time) return m.scheduled_time.startsWith(todayStr);
      if (m.created_at) return m.created_at.startsWith(todayStr);
      return false;
    });
  }

  // Search Query Filter
  if (params?.search && params.search.trim().length > 0) {
    const q = params.search.trim().toLowerCase();
    result = result.filter((m) => {
      const pAName = m.participantAUser?.username?.toLowerCase() || '';
      const pBName = m.participantBUser?.username?.toLowerCase() || '';
      const tName = m.tournamentName.toLowerCase();
      const matchPos = String(m.match_position);
      return pAName.includes(q) || pBName.includes(q) || tName.includes(q) || matchPos.includes(q);
    });
  }

  return result.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

/**
 * Fetch dynamic summary stats for Match Center
 */
export async function getMatchDashboardStats(tournamentId?: string): Promise<MatchDashboardStats> {
  const matches = await getAllAdminMatches({ tournamentId });
  return {
    totalMatches: matches.length,
    liveCount: matches.filter((m) => m.status === 'live').length,
    scheduledCount: matches.filter((m) => m.status === 'pending').length,
    completedCount: matches.filter((m) => m.status === 'completed' || m.status === 'walkover').length,
  };
}

/**
 * Start a scheduled match (Pending -> Live)
 */
export async function startMatch(matchId: string, tournamentId: string): Promise<MatchDetailsOverview> {
  return updateMatchStatus(matchId, tournamentId, 'live');
}

/**
 * Update real-time live score
 */
export async function updateLiveScore(
  matchId: string,
  tournamentId: string,
  scoreA: number,
  scoreB: number
): Promise<MatchDetailsOverview> {
  const supabase = createClient();
  const { match } = await getMatchDetails(matchId, tournamentId);

  // Verification Guards
  const { data: tData } = await (supabase.from('tournaments') as unknown as UnknownQuery)
    .select('*')
    .eq('id', tournamentId)
    .single();
  const tObj = tData as Tournament;

  if (tObj?.status === 'completed') {
    throw new Error('Cannot update score: Tournament is completed and read-only.');
  }

  if (match.group_id && tObj?.is_group_stage_finalized) {
    throw new Error('Cannot update score: Group stage is finalized and locked.');
  }

  const { error } = await (supabase.from('matches') as unknown as UnknownQuery)
    .update({
      score_a: scoreA,
      score_b: scoreB,
      status: 'live',
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId);

  if (error) {
    throw new Error(`Failed to update live score: ${formatSupabaseError(error)}`);
  }

  return getMatchDetails(matchId, tournamentId);
}

/**
 * Determine winner based on scores or administrative selection
 */
export function determineWinner(
  match: Match,
  input: MatchResultInput
): { winnerId: string; status: MatchStatus } {
  if (input.result_type === 'normal') {
    if (!match.participant_a || !match.participant_b) {
      throw new Error('Both participants must be assigned before entering match scores.');
    }
    if (input.score_a === input.score_b) {
      if (match.group_id) {
        // Group matches allow draws!
        return { winnerId: null as unknown as string, status: 'completed' };
      }
      throw new Error('Knockout matches require a winner. Scores cannot be equal.');
    }
    const winnerId = input.score_a > input.score_b ? match.participant_a : match.participant_b;
    return { winnerId, status: 'completed' };
  }

  // Walkover or Disqualification
  if (!input.walkover_winner_id) {
    throw new Error('Please select an advancing winner for the walkover/disqualification.');
  }

  if (
    input.walkover_winner_id !== match.participant_a &&
    input.walkover_winner_id !== match.participant_b
  ) {
    throw new Error('Advancing winner must be one of the match participants.');
  }

  return { winnerId: input.walkover_winner_id, status: 'walkover' };
}

/**
 * Submit Match Result & Automatically Advance Winner to Next Round
 */
export async function submitMatchResult(
  matchId: string,
  tournamentId: string,
  input: MatchResultInput
): Promise<MatchDetailsOverview> {
  const supabase = createClient();
  const { match } = await getMatchDetails(matchId, tournamentId);

  // Stage Protection Guards
  const { data: tData } = await (supabase.from('tournaments') as unknown as UnknownQuery)
    .select('*')
    .eq('id', tournamentId)
    .single();
  const tObj = tData as Tournament;

  if (match.group_id && tObj?.is_group_stage_finalized) {
    throw new Error('Cannot submit result: Group stage is finalized and locked.');
  }

  const { winnerId, status: newStatus } = determineWinner(match, input);

  // If Disqualification, update loser participant status to 'disqualified'
  if (input.result_type === 'disqualification') {
    const loserId = match.participant_a === winnerId ? match.participant_b : match.participant_a;
    if (loserId) {
      await (supabase.from('participants') as unknown as UnknownQuery)
        .update({ status: 'disqualified', updated_at: new Date().toISOString() })
        .eq('id', loserId);
    }
  }

  // 1. Update Current Match Result
  const updatePayload = {
    score_a: input.result_type === 'normal' ? input.score_a : 0,
    score_b: input.result_type === 'normal' ? input.score_b : 0,
    winner_id: winnerId,
    status: newStatus,
    notes: input.notes ? input.notes.trim() : null,
    updated_at: new Date().toISOString(),
  };

  const { error: updateErr } = await (supabase.from('matches') as unknown as UnknownQuery)
    .update(updatePayload)
    .eq('id', matchId);

  if (updateErr) {
    throw new Error(`Failed to submit match result: ${formatSupabaseError(updateErr)}`);
  }

  // 1.5. AUTOMATIC GROUP-TO-KNOCKOUT SHIFT IF ALL GROUP MATCHES ARE FINISHED
  if (match.group_id && tObj?.format === 'group_knockout' && !tObj?.is_group_stage_finalized) {
    try {
      const groupOverview = await getTournamentGroups(tournamentId);
      if (groupOverview.isGroupStageComplete) {
        await finalizeGroupStage(tournamentId);
        const preview = await getGroupKnockoutTransitionPreview(tournamentId);
        if (!preview.isKnockoutAlreadyGenerated && preview.qualifiers.length >= 2) {
          await prepareKnockoutFromGroups(tournamentId);
        }
      }
    } catch (autoErr) {
      console.error('Auto group-to-knockout transition note:', autoErr);
    }
  }

  // 2. AUTOMATIC WINNER ADVANCEMENT & KNOCKOUT ELIMINATION
  if (match.next_match_id && match.winner_slot) {
    const slotKey = match.winner_slot;
    const { error: advErr } = await (supabase.from('matches') as unknown as UnknownQuery)
      .update({
        [slotKey]: winnerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', match.next_match_id);

    if (advErr) {
      console.error('Error advancing winner to next match:', advErr);
    } else {
      // Transition next match status from 'pending' to 'ready' when both participants arrive
      const { data: nextMatchData } = await (supabase.from('matches') as unknown as UnknownQuery)
        .select('*')
        .eq('id', match.next_match_id)
        .single();

      if (nextMatchData) {
        const nMatch = nextMatchData as Match;
        if (nMatch.participant_a && nMatch.participant_b && nMatch.status === 'pending') {
          await (supabase.from('matches') as unknown as UnknownQuery)
            .update({
              status: 'ready',
              updated_at: new Date().toISOString(),
            })
            .eq('id', match.next_match_id);
        }
      }
    }
  }

  // Knockout match loser elimination & winner reinstatement (unless disqualified)
  if (!match.group_id && input.result_type !== 'disqualification') {
    const loserId = match.participant_a === winnerId ? match.participant_b : match.participant_a;
    if (loserId) {
      await (supabase.from('participants') as unknown as UnknownQuery)
        .update({ status: 'eliminated', updated_at: new Date().toISOString() })
        .eq('id', loserId);
    }
    if (winnerId) {
      await (supabase.from('participants') as unknown as UnknownQuery)
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', winnerId);
    }
  }

  // 3. AUTOMATIC TOURNAMENT COMPLETION IF FINAL MATCH
  if (!match.group_id && !match.next_match_id && winnerId) {
    const runnerUpId = match.participant_a === winnerId ? match.participant_b : match.participant_a;
    await (supabase.from('tournaments') as unknown as UnknownQuery)
      .update({
        status: 'completed',
        champion_id: winnerId,
        runner_up_id: runnerUpId || null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tournamentId);
  }

  return getMatchDetails(matchId, tournamentId);
}

/**
 * Edit Completed Match Result with Downstream Protection
 */
export async function editMatchResult(
  matchId: string,
  tournamentId: string,
  input: MatchResultInput
): Promise<MatchDetailsOverview> {
  const supabase = createClient();
  const { match } = await getMatchDetails(matchId, tournamentId);

  // Stage Protection Guards
  const { data: tData } = await (supabase.from('tournaments') as unknown as UnknownQuery)
    .select('*')
    .eq('id', tournamentId)
    .single();
  const tObj = tData as Tournament;

  if (match.group_id && tObj?.is_group_stage_finalized) {
    throw new Error('Cannot edit result: Group stage is finalized and locked.');
  }

  const { winnerId: newWinnerId } = determineWinner(match, input);
  const oldWinnerId = match.winner_id;

  // Downstream Protection Check if winner has changed
  if (match.next_match_id && oldWinnerId && newWinnerId !== oldWinnerId) {
    const { data: nextMatchData } = await (supabase.from('matches') as unknown as UnknownQuery)
      .select('*')
      .eq('id', match.next_match_id)
      .single();

    if (nextMatchData) {
      const nextM = nextMatchData as Match;
      if (nextM.status === 'completed' || nextM.winner_id !== null || nextM.score_a > 0 || nextM.score_b > 0) {
        throw new Error(
          'Cannot edit result because downstream match in the next round has already completed or recorded scores. Reset downstream match first.'
        );
      }
    }
  }

  return submitMatchResult(matchId, tournamentId, input);
}

/**
 * Update Match Status (e.g. Set Live or Set Pending)
 */
export async function updateMatchStatus(
  matchId: string,
  tournamentId: string,
  newStatus: MatchStatus
): Promise<MatchDetailsOverview> {
  const supabase = createClient();
  await getMatchDetails(matchId, tournamentId);

  const { error } = await (supabase.from('matches') as unknown as UnknownQuery)
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId);

  if (error) {
    throw new Error(`Failed to update match status: ${formatSupabaseError(error)}`);
  }

  return getMatchDetails(matchId, tournamentId);
}

/**
 * Update Scheduled Time & Notes
 */
export async function updateMatchSchedule(
  matchId: string,
  tournamentId: string,
  scheduledTime: string | null,
  notes?: string | null
): Promise<MatchDetailsOverview> {
  const supabase = createClient();
  await getMatchDetails(matchId, tournamentId);

  const { error } = await (supabase.from('matches') as unknown as UnknownQuery)
    .update({
      scheduled_time: scheduledTime,
      notes: notes !== undefined ? notes : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId);

  if (error) {
    throw new Error(`Failed to update match schedule: ${formatSupabaseError(error)}`);
  }

  return getMatchDetails(matchId, tournamentId);
}
