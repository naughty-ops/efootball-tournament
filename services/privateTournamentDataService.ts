import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tournament, Group, Match, Participant, Round, Database } from '@/types/database';
import {
  TournamentWithStats,
  sanitizeTournamentObject,
} from '@/services/tournamentService';
import { getTournamentSubStage } from '@/lib/lifecycle/lifecycleEngine';
import { isKnockoutRoundName } from '@/services/bracketService';
import { calculateBracketSize, calculateByes } from '@/lib/bracket/bracketEngine';
import { isLeagueRoundName, GroupStageOverview } from '@/services/groupService';
import { calculateGroupStandings } from '@/lib/group/groupEngine';
import { applyStandingOverrides, parseStandingOverrides } from '@/lib/group/standingOverrideEngine';
import type { FullMatchData, RoundWithMatches, BracketOverview } from '@/services/bracketService';

export interface AuthorizedPrivateTournamentData {
  tournament: TournamentWithStats;
  participants: Participant[];
  stageInfo: Record<string, any> | null;
  groupStage: GroupStageOverview | null;
  bracket: BracketOverview | null;
  rounds: RoundWithMatches[];
}

/**
 * Dedicated, optimized private tournament data retrieval pipeline.
 *
 * Replaces the multi-service nested query pattern (which generated 15-20 redundant queries)
 * with a single parallel batch directly querying PostgreSQL tables via adminClient.
 *
 * Strictly avoids querying tournament_participants_public view (which intentionally excludes
 * private tournaments), querying the underlying participants table directly with a safe column projection.
 */
export async function getAuthorizedPrivateTournamentData(
  tournamentId: string,
  adminClient: SupabaseClient<Database>
): Promise<AuthorizedPrivateTournamentData | null> {
  // Execute the 5 core dataset queries in a single parallel batch
  const [
    tournamentRes,
    participantsRes,
    groupsRes,
    roundsRes,
    matchesRes,
  ] = await Promise.all([
    (adminClient.from('tournaments') as any)
      .select('*')
      .eq('id', tournamentId)
      .maybeSingle(),

    (adminClient.from('participants') as any)
      .select('id, tournament_id, username, real_name, seed_number, status, created_at')
      .eq('tournament_id', tournamentId)
      .order('seed_number', { ascending: true }),

    (adminClient.from('groups') as any)
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('name', { ascending: true }),

    (adminClient.from('rounds') as any)
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('round_number', { ascending: true }),

    (adminClient.from('matches') as any)
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('match_position', { ascending: true }),
  ]);

  if (tournamentRes.error || !tournamentRes.data) {
    if (tournamentRes.error) {
      console.error('[Private Data Service] Failed fetching tournament:', tournamentRes.error);
    }
    return null;
  }

  const rawTournament = tournamentRes.data as Tournament;

  // 1. Process Participants (Empty array is a valid result if no participants registered yet)
  const rawParticipants = (participantsRes.data || []) as Participant[];
  const participants: Participant[] = rawParticipants.map((p) => ({
    ...p,
    username: p.real_name || p.username,
  }));
  const participantMap = new Map<string, Participant>(participants.map((p) => [p.id, p]));

  // 2. Process Matches and enrich with populated participant details
  const rawMatches = (matchesRes.data || []) as Match[];
  const fullMatches: FullMatchData[] = rawMatches.map((m) => ({
    ...m,
    participantAUser: m.participant_a ? participantMap.get(m.participant_a) || null : null,
    participantBUser: m.participant_b ? participantMap.get(m.participant_b) || null : null,
    winnerUser: m.winner_id ? participantMap.get(m.winner_id) || null : null,
  }));

  // 3. Process Rounds and group matches by round_id
  const allRounds = (roundsRes.data || []) as Round[];
  const matchMapByRound = new Map<string, FullMatchData[]>();

  for (const m of fullMatches) {
    if (m.round_id) {
      const list = matchMapByRound.get(m.round_id) || [];
      list.push(m);
      matchMapByRound.set(m.round_id, list);
    }
  }

  const roundsWithMatches: RoundWithMatches[] = allRounds.map((r) => ({
    ...r,
    matches: matchMapByRound.get(r.id) || [],
  }));

  // 4. Assemble Tournament Stage Info
  let stageInfo: Record<string, any> | null = null;
  try {
    const subStage = getTournamentSubStage(rawTournament, fullMatches, allRounds);
    const roundMap = new Map<string, Round>(allRounds.map((r) => [r.id, r]));

    const groupMatches = fullMatches.filter((m) => {
      if (m.group_id) return true;
      if (!m.round_id) return false;
      const r = roundMap.get(m.round_id);
      return r ? !isKnockoutRoundName(r.name) : true;
    });

    const knockoutMatches = fullMatches.filter((m) => {
      if (!m.round_id) return false;
      const r = roundMap.get(m.round_id);
      return r ? isKnockoutRoundName(r.name) : false;
    });

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
      const knockoutRounds = allRounds.filter((r) => knockoutRoundIds.has(r.id) && isKnockoutRoundName(r.name));

      if (knockoutRounds.length > 0) {
        const maxRoundNum = Math.max(...knockoutRounds.map((r) => r.round_number));
        const finalRound =
          knockoutRounds.find((r) => r.round_number === maxRoundNum) ||
          knockoutRounds.find((r) => {
            const n = r.name.toLowerCase().trim();
            return n === 'grand final' || n === 'final' || n === 'finals';
          });
        if (finalRound) {
          finalMatch = knockoutMatches.find((m) => m.round_id === finalRound.id) || null;
          if (finalMatch?.status === 'completed' || finalMatch?.status === 'walkover') {
            finalWinner = finalMatch.winner_id ? participantMap.get(finalMatch.winner_id) || null : null;
          }
        }
      }
    }

    stageInfo = {
      subStage,
      isGroupStageComplete,
      groupMatchesTotal,
      groupMatchesCompleted,
      knockoutMatchesTotal,
      knockoutMatchesCompleted,
      finalMatch,
      finalWinner,
    };
  } catch (stageErr) {
    console.warn('[Private Data Service] Error building stage info:', stageErr);
  }

  // 5. Assemble Tournament with Stats
  const tournamentWithStats: TournamentWithStats = {
    ...sanitizeTournamentObject(rawTournament),
    participant_count: participants.length,
    championUser: rawTournament.champion_id ? participantMap.get(rawTournament.champion_id) || null : null,
    runnerUpUser: rawTournament.runner_up_id ? participantMap.get(rawTournament.runner_up_id) || null : null,
  };
  delete (tournamentWithStats as any).access_code_hash;
  delete (tournamentWithStats as any).access_code;

  // 6. Assemble Knockout Bracket Overview
  let bracket: BracketOverview | null = null;
  const knockoutRounds = allRounds.filter((r) => isKnockoutRoundName(r.name));

  if (knockoutRounds.length > 0) {
    const filteredParticipants =
      rawTournament.format === 'group_knockout' || (rawTournament.format as string) === 'single_league_knockout'
        ? participants.filter((p) => p.status === 'active')
        : participants;

    const activeCount = filteredParticipants.length;
    const bracketSize = calculateBracketSize(activeCount);
    const byesCount = calculateByes(bracketSize, activeCount);

    let bracketStatus: 'Not Generated' | 'Generated' | 'In Progress' | 'Completed' = 'Generated';
    const knockoutMatches = fullMatches.filter((m) => {
      const r = m.round_id ? allRounds.find((rd) => rd.id === m.round_id) : null;
      return r ? isKnockoutRoundName(r.name) : false;
    });

    const hasCompleted = knockoutMatches.some((m) => m.status === 'completed' || Boolean(m.winner_id));
    const hasPending = knockoutMatches.some((m) => m.status !== 'completed' && !m.winner_id);

    if (knockoutMatches.length === 0) {
      bracketStatus = 'Not Generated';
    } else if (hasCompleted && !hasPending) {
      bracketStatus = 'Completed';
    } else if (hasCompleted) {
      bracketStatus = 'In Progress';
    } else {
      bracketStatus = 'Generated';
    }

    const knockoutRoundsWithMatches: RoundWithMatches[] = knockoutRounds.map((r) => ({
      ...r,
      matches: matchMapByRound.get(r.id) || [],
    }));

    bracket = {
      tournament: tournamentWithStats,
      participants,
      rounds: knockoutRoundsWithMatches,
      bracketSize,
      byesCount,
      totalRounds: knockoutRounds.length,
      status: bracketStatus,
    };
  }

  // 7. Assemble Group Stage / League Overview
  let groupStage: GroupStageOverview | null = null;
  const rawGroups = (groupsRes.data || []) as Group[];
  const qualifiersPerGroup = rawTournament.qualifiers_per_group || 8;
  const roundsPerPair = rawTournament.rounds_per_pair || 1;

  if (rawGroups.length === 0) {
    // Pure league / single-table format
    const leagueRoundIds = new Set(
      allRounds.filter((r) => isLeagueRoundName(r.name)).map((r) => r.id)
    );
    const leagueMatches = fullMatches.filter((m) => m.round_id && leagueRoundIds.has(m.round_id));

    const completedMatchesCount = leagueMatches.filter(
      (m) => m.status === 'completed' || m.status === 'walkover'
    ).length;
    const isGroupStageComplete = leagueMatches.length > 0 && completedMatchesCount === leagueMatches.length;

    const syntheticGroup: Group = {
      id: 'synthetic-league-group',
      tournament_id: tournamentId,
      name: 'League Points Table',
      created_at: new Date().toISOString(),
    };

    const rawStandings = calculateGroupStandings(leagueMatches, participants, qualifiersPerGroup);
    const overridesMap = parseStandingOverrides(rawTournament.rules_text);
    const standings = applyStandingOverrides(rawStandings, overridesMap, qualifiersPerGroup);

    groupStage = {
      tournament: rawTournament,
      participants,
      groups: participants.length > 0 ? [
        {
          group: syntheticGroup,
          participants,
          matches: leagueMatches,
          standings,
          totalMatchesCount: leagueMatches.length,
          completedMatchesCount,
          isComplete: isGroupStageComplete,
        },
      ] : [],
      totalGroupMatches: leagueMatches.length,
      completedGroupMatches: completedMatchesCount,
      isGroupStageComplete,
      isFinalized: Boolean(rawTournament.is_group_stage_finalized),
      qualifiersPerGroup,
      roundsPerPair,
      qualifiedParticipants: [],
    };
  } else {
    // Multi-group format: fetch group_participants for mapping
    const groupIds = rawGroups.map((g) => g.id);
    let gpRows: any[] = [];
    try {
      const res = await (adminClient.from('group_participants') as any)
        .select('*')
        .in('group_id', groupIds);
      if (res && res.data) {
        gpRows = res.data;
      }
    } catch {
      // In case group_participants is unavailable or query fails
    }

    const groupParticipantMap = new Map<string, Participant[]>();
    for (const gp of gpRows || []) {
      const p = participantMap.get(gp.participant_id);
      if (p) {
        const list = groupParticipantMap.get(gp.group_id) || [];
        list.push(p);
        groupParticipantMap.set(gp.group_id, list);
      }
    }

    const groupMatchesMap = new Map<string, FullMatchData[]>();
    for (const m of fullMatches) {
      if (m.group_id) {
        const list = groupMatchesMap.get(m.group_id) || [];
        list.push(m);
        groupMatchesMap.set(m.group_id, list);
      }
    }

    let totalGroupMatches = 0;
    let completedGroupMatches = 0;

    const processedGroups = rawGroups.map((group) => {
      let gParticipants = groupParticipantMap.get(group.id) || [];
      const gMatches = groupMatchesMap.get(group.id) || [];

      // Fall back to deriving group participants from matches if group_participants mapping was empty
      if (gParticipants.length === 0 && gMatches.length > 0) {
        const seenIds = new Set<string>();
        const derived: Participant[] = [];
        for (const gm of gMatches) {
          const idA = gm.participant_a || (gm as any).player1_id;
          const idB = gm.participant_b || (gm as any).player2_id;
          if (idA && !seenIds.has(idA)) {
            seenIds.add(idA);
            const p = participantMap.get(idA);
            if (p) derived.push(p);
          }
          if (idB && !seenIds.has(idB)) {
            seenIds.add(idB);
            const p = participantMap.get(idB);
            if (p) derived.push(p);
          }
        }
        gParticipants = derived;
      }
      const completedCount = gMatches.filter(
        (m) => m.status === 'completed' || m.status === 'walkover'
      ).length;

      totalGroupMatches += gMatches.length;
      completedGroupMatches += completedCount;

      const rawStandings = calculateGroupStandings(gMatches, gParticipants, qualifiersPerGroup);
      const overridesMap = parseStandingOverrides(rawTournament.rules_text);
      const standings = applyStandingOverrides(rawStandings, overridesMap, qualifiersPerGroup);

      return {
        group,
        participants: gParticipants,
        matches: gMatches,
        standings,
        totalMatchesCount: gMatches.length,
        completedMatchesCount: completedCount,
        isComplete: gMatches.length > 0 && completedCount === gMatches.length,
      };
    });

    const isGroupStageComplete = totalGroupMatches > 0 && completedGroupMatches === totalGroupMatches;

    groupStage = {
      tournament: rawTournament,
      participants,
      groups: processedGroups,
      totalGroupMatches,
      completedGroupMatches,
      isGroupStageComplete,
      isFinalized: Boolean(rawTournament.is_group_stage_finalized),
      qualifiersPerGroup,
      roundsPerPair,
      qualifiedParticipants: [],
    };
  }

  return {
    tournament: tournamentWithStats,
    participants,
    stageInfo,
    groupStage,
    bracket,
    rounds: roundsWithMatches,
  };
}
