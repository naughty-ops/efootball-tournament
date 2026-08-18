import { createClient } from '@/lib/supabase/client';
import type { Tournament, Group, Match, Participant, Round } from '@/types/database';
import {
  generateGroupNames,
  distributeParticipantsSnake,
  generateGroupPairings,
  calculateGroupStandings,
  buildGroupQualifierPool,
  GroupStandingRow,
  RoundRobinPairing,
  GroupQualifierInfo,
} from '@/lib/group/groupEngine';
import { generateSeedingOrder } from '@/lib/bracket/bracketEngine';
import { FullMatchData } from '@/services/matchService';
import { generateKnockoutBracket, getTournamentBracket } from '@/services/bracketService';
import {
  parseStandingOverrides,
  applyStandingOverrides,
  serializeStandingOverrides,
  StandingOverride,
} from '@/lib/group/standingOverrideEngine';

export async function saveStandingOverride(
  tournamentId: string,
  override: StandingOverride
): Promise<void> {
  const supabase = createClient();
  const tRes = await (supabase.from('tournaments') as unknown as UnknownQuery)
    .select('rules_text')
    .eq('id', tournamentId)
    .single();

  const currentRules = (tRes.data as { rules_text?: string })?.rules_text || '';
  const currentMap = parseStandingOverrides(currentRules);
  currentMap[override.participantId] = override;

  const newRules = serializeStandingOverrides(currentRules, currentMap);

  await (supabase.from('tournaments') as unknown as UnknownQuery)
    .update({ rules_text: newRules, updated_at: new Date().toISOString() })
    .eq('id', tournamentId);
}

export async function clearStandingOverride(
  tournamentId: string,
  participantId: string
): Promise<void> {
  const supabase = createClient();
  const tRes = await (supabase.from('tournaments') as unknown as UnknownQuery)
    .select('rules_text')
    .eq('id', tournamentId)
    .single();

  const currentRules = (tRes.data as { rules_text?: string })?.rules_text || '';
  const currentMap = parseStandingOverrides(currentRules);
  delete currentMap[participantId];

  const newRules = serializeStandingOverrides(currentRules, currentMap);

  await (supabase.from('tournaments') as unknown as UnknownQuery)
    .update({ rules_text: newRules, updated_at: new Date().toISOString() })
    .eq('id', tournamentId);
}

export interface GroupDetails {
  group: Group;
  participants: Participant[];
  matches: FullMatchData[];
  standings: GroupStandingRow[];
  totalMatchesCount: number;
  completedMatchesCount: number;
  isComplete: boolean;
}

export interface GroupStageOverview {
  tournament: Tournament;
  participants: Participant[];
  groups: GroupDetails[];
  totalGroupMatches: number;
  completedGroupMatches: number;
  isGroupStageComplete: boolean;
  isFinalized: boolean;
  qualifiersPerGroup: number;
  roundsPerPair: number;
  qualifiedParticipants: Participant[];
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
 * Fetch full group stage overview for a tournament
 */
export async function getTournamentGroups(tournamentId: string): Promise<GroupStageOverview> {
  const supabase = createClient();

  // 1. Fetch Tournament
  const tRes = await (supabase.from('tournaments') as unknown as UnknownQuery)
    .select('*')
    .eq('id', tournamentId)
    .single();

  if (tRes.error || !tRes.data) {
    throw new Error(`Tournament not found: ${formatSupabaseError(tRes.error)}`);
  }
  const tournament = tRes.data as Tournament;

  // 2. Fetch Participants
  const pRes = await (supabase.from('participants') as unknown as UnknownQuery)
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('seed_number', { ascending: true });

  const participants = (pRes.data || []) as Participant[];
  const participantMap = new Map<string, Participant>(participants.map((p) => [p.id, p]));

  // 3. Fetch Groups
  const gRes = await (supabase.from('groups') as unknown as UnknownQuery)
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('name', { ascending: true });

  const groups = (gRes.data || []) as Group[];
  const qualifiersPerGroup = tournament.qualifiers_per_group || 8;
  const roundsPerPair = tournament.rounds_per_pair || 1;

  if (groups.length === 0) {
    // Fetch all rounds & matches for pure league / single-table format
    const rRes = await (supabase.from('rounds') as unknown as UnknownQuery)
      .select('id')
      .eq('tournament_id', tournamentId);
    const roundIds = ((rRes.data || []) as { id: string }[]).map((r) => r.id);

    let allLeagueMatches: Match[] = [];
    if (roundIds.length > 0) {
      const mRes = await (supabase.from('matches') as unknown as UnknownQuery)
        .select('*')
        .in('round_id', roundIds)
        .order('match_position', { ascending: true });
      allLeagueMatches = (mRes.data || []) as Match[];
    }

    const fullMatchesList: FullMatchData[] = allLeagueMatches.map((m) => ({
      ...m,
      participantAUser: m.participant_a ? participantMap.get(m.participant_a) || null : null,
      participantBUser: m.participant_b ? participantMap.get(m.participant_b) || null : null,
      winnerUser: m.winner_id ? participantMap.get(m.winner_id) || null : null,
    }));

    const completedMatchesCount = fullMatchesList.filter(
      (m) => m.status === 'completed' || m.status === 'walkover'
    ).length;
    const isGroupStageComplete = fullMatchesList.length > 0 && completedMatchesCount === fullMatchesList.length;

    const syntheticGroup: Group = {
      id: 'synthetic-league-group',
      tournament_id: tournamentId,
      name: 'League Points Table',
      created_at: new Date().toISOString(),
    };
    const rawStandings = calculateGroupStandings(fullMatchesList, participants, qualifiersPerGroup);
    const overridesMap = parseStandingOverrides(tournament.rules_text);
    const standings = applyStandingOverrides(rawStandings, overridesMap, qualifiersPerGroup);

    return {
      tournament,
      participants,
      groups: participants.length > 0 ? [
        {
          group: syntheticGroup,
          participants,
          matches: fullMatchesList,
          standings,
          totalMatchesCount: fullMatchesList.length,
          completedMatchesCount,
          isComplete: isGroupStageComplete,
        },
      ] : [],
      totalGroupMatches: fullMatchesList.length,
      completedGroupMatches: completedMatchesCount,
      isGroupStageComplete,
      isFinalized: Boolean(tournament.is_group_stage_finalized),
      qualifiersPerGroup,
      roundsPerPair,
      qualifiedParticipants: [],
    };
  }

  const groupIds = groups.map((g) => g.id);

  // 4. Fetch Group Participants
  const gpRes = await (supabase.from('group_participants') as unknown as UnknownQuery)
    .select('*')
    .in('group_id', groupIds);

  const groupParticipantsRaw = (gpRes.data || []) as { group_id: string; participant_id: string }[];
  const groupParticipantMap = new Map<string, Participant[]>();

  for (const gp of groupParticipantsRaw) {
    const p = participantMap.get(gp.participant_id);
    if (p) {
      const list = groupParticipantMap.get(gp.group_id) || [];
      list.push(p);
      groupParticipantMap.set(gp.group_id, list);
    }
  }

  // 5. Fetch Group Matches
  const mRes = await (supabase.from('matches') as unknown as UnknownQuery)
    .select('*')
    .in('group_id', groupIds)
    .order('match_position', { ascending: true });

  const matches = (mRes.data || []) as Match[];
  const matchMap = new Map<string, FullMatchData[]>();

  let totalGroupMatches = 0;
  let completedGroupMatches = 0;

  for (const m of matches) {
    if (!m.group_id) continue;
    totalGroupMatches++;

    const isCompleted = m.status === 'completed' || m.status === 'walkover';
    if (isCompleted) completedGroupMatches++;

    const fullMatch: FullMatchData = {
      ...m,
      participantAUser: m.participant_a ? participantMap.get(m.participant_a) || null : null,
      participantBUser: m.participant_b ? participantMap.get(m.participant_b) || null : null,
      winnerUser: m.winner_id ? participantMap.get(m.winner_id) || null : null,
    };

    const list = matchMap.get(m.group_id) || [];
    list.push(fullMatch);
    matchMap.set(m.group_id, list);
  }

  // 6. Build Group Details & Standings
  const groupDetailsList: GroupDetails[] = [];
  const qualifiedParticipants: Participant[] = [];

  for (const g of groups) {
    const gParticipants = groupParticipantMap.get(g.id) || [];
    const gMatchesFull = matchMap.get(g.id) || [];

    const rawStandings = calculateGroupStandings(gMatchesFull, gParticipants, qualifiersPerGroup);
    const overridesMap = parseStandingOverrides(tournament.rules_text);
    const standings = applyStandingOverrides(rawStandings, overridesMap, qualifiersPerGroup);

    const completedCount = gMatchesFull.filter(
      (m) => m.status === 'completed' || m.status === 'walkover'
    ).length;

    const isComplete = gMatchesFull.length > 0 && completedCount === gMatchesFull.length;

    groupDetailsList.push({
      group: g,
      participants: gParticipants,
      matches: gMatchesFull,
      standings,
      totalMatchesCount: gMatchesFull.length,
      completedMatchesCount: completedCount,
      isComplete,
    });

    // Collect top qualifiers
    for (const row of standings) {
      if (row.isQualified) {
        qualifiedParticipants.push(row.participant);
      }
    }
  }

  const isGroupStageComplete =
    totalGroupMatches > 0 && completedGroupMatches === totalGroupMatches;

  return {
    tournament,
    participants,
    groups: groupDetailsList,
    totalGroupMatches,
    completedGroupMatches,
    isGroupStageComplete,
    isFinalized: Boolean(tournament.is_group_stage_finalized),
    qualifiersPerGroup,
    roundsPerPair,
    qualifiedParticipants,
  };
}

/**
 * Setup Groups & Generate Round-Robin Fixtures (1-Round or 2-Round mode)
 */
export async function setupTournamentGroups(
  tournamentId: string,
  groupCount: number,
  qualifiersPerGroup: number = 2,
  roundsPerPair: number = 1
): Promise<void> {
  const supabase = createClient();
  const overview = await getTournamentGroups(tournamentId);
  const { tournament, participants } = overview;

  if (tournament.format !== 'group_knockout') {
    throw new Error('Group Stage management is available only for group_knockout tournaments.');
  }

  if (participants.length < 4) {
    throw new Error('At least 4 participants are required to set up a Group Stage.');
  }

  if (groupCount < 2) {
    throw new Error('At least 2 groups are required.');
  }

  if (participants.length < groupCount * 2) {
    throw new Error(`Participant count (${participants.length}) is too small for ${groupCount} groups.`);
  }

  // Safety check: block reset if completed matches exist
  if (overview.groups.length > 0) {
    const hasCompleted = overview.groups.some((g) => g.completedMatchesCount > 0);
    if (hasCompleted) {
      throw new Error('Cannot recreate groups containing completed match results. Reset group matches first.');
    }
    await resetGroups(tournamentId);
  }

  // 1. Create Groups
  const groupNames = generateGroupNames(groupCount);
  const groupPayloads = groupNames.map((name) => ({
    tournament_id: tournamentId,
    name,
  }));

  const { data: createdGroups, error: gErr } = await (supabase.from('groups') as unknown as UnknownQuery)
    .insert(groupPayloads)
    .select('*');

  if (gErr || !createdGroups) {
    throw new Error(`Failed to create groups: ${formatSupabaseError(gErr)}`);
  }

  const sortedGroups = (createdGroups as Group[]).sort((a, b) => a.name.localeCompare(b.name));

  // 2. Distribute Participants to Groups using Snake Algorithm
  const distributedParticipants = distributeParticipantsSnake(participants, groupCount);

  const groupParticipantInserts = [];
  const allPairings: { groupId: string; pairing: RoundRobinPairing }[] = [];

  for (let i = 0; i < sortedGroups.length; i++) {
    const groupObj = sortedGroups[i];
    const gParticipants = distributedParticipants[i] || [];

    for (const p of gParticipants) {
      groupParticipantInserts.push({
        group_id: groupObj.id,
        participant_id: p.id,
      });
    }

    const pairings = generateGroupPairings(gParticipants, roundsPerPair);
    for (const pairing of pairings) {
      allPairings.push({
        groupId: groupObj.id,
        pairing,
      });
    }
  }

  // Insert group_participants
  const { error: gpErr } = await (supabase.from('group_participants') as unknown as UnknownQuery).insert(
    groupParticipantInserts
  );

  if (gpErr) {
    throw new Error(`Failed to assign participants to groups: ${formatSupabaseError(gpErr)}`);
  }

  // 3. Create Group Stage Rounds in rounds table (Round 1 & optional Round 2)
  const roundMap = new Map<number, string>(); // roundNumber -> round_id

  for (let rNum = 1; rNum <= roundsPerPair; rNum++) {
    const roundName = `Group Stage Round ${rNum}`;
    const { data: createdRound, error: rErr } = await (supabase.from('rounds') as unknown as UnknownQuery)
      .insert({
        tournament_id: tournamentId,
        round_number: rNum,
        name: roundName,
      })
      .select('*')
      .single();

    if (rErr || !createdRound) {
      throw new Error(`Failed to create group stage round ${rNum}: ${formatSupabaseError(rErr)}`);
    }
    roundMap.set(rNum, (createdRound as Round).id);
  }

  // 4. Insert Fixtures into matches table
  const matchPayloads = allPairings.map(({ groupId, pairing }) => {
    const roundId = roundMap.get(pairing.roundNumber) || Array.from(roundMap.values())[0];
    return {
      round_id: roundId,
      group_id: groupId,
      match_position: pairing.matchPosition,
      participant_a: pairing.participantA.id,
      participant_b: pairing.participantB.id,
      status: 'pending',
      score_a: 0,
      score_b: 0,
    };
  });

  const { error: mErr } = await (supabase.from('matches') as unknown as UnknownQuery).insert(matchPayloads);

  if (mErr) {
    throw new Error(`Failed to create group matches: ${formatSupabaseError(mErr)}`);
  }

  // 5. Update Tournament Settings & Automatically update status to 'ongoing'
  const newStatus = (tournament.status === 'registration' || tournament.status === 'draft') ? 'ongoing' : tournament.status;
  await (supabase.from('tournaments') as unknown as UnknownQuery)
    .update({
      status: newStatus,
      qualifiers_per_group: qualifiersPerGroup,
      rounds_per_pair: roundsPerPair,
      is_group_stage_finalized: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tournamentId);
}

/**
 * Reset Groups & Group Matches
 */
export async function resetGroups(tournamentId: string): Promise<void> {
  const supabase = createClient();
  const overview = await getTournamentGroups(tournamentId);

  const hasCompleted = overview.groups.some((g) => g.completedMatchesCount > 0);
  if (hasCompleted) {
    throw new Error('Cannot reset groups containing completed match results.');
  }

  const groupIds = overview.groups.map((g) => g.group.id);
  if (groupIds.length > 0) {
    await (supabase.from('matches') as unknown as UnknownQuery).delete().in('group_id', groupIds);
    await (supabase.from('group_participants') as unknown as UnknownQuery).delete().in('group_id', groupIds);
    await (supabase.from('groups') as unknown as UnknownQuery).delete().eq('tournament_id', tournamentId);
    await (supabase.from('rounds') as unknown as UnknownQuery).delete().eq('tournament_id', tournamentId);
  }

  await (supabase.from('tournaments') as unknown as UnknownQuery)
    .update({
      is_group_stage_finalized: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tournamentId);
}

/**
 * Unlock / Reopen Group Stage for administrative editing
 */
export async function unlockGroupStage(tournamentId: string): Promise<void> {
  const supabase = createClient();
  const overview = await getTournamentGroups(tournamentId);

  // Re-enable active status for all participants
  for (const p of overview.participants) {
    if (p.status === 'eliminated') {
      await (supabase.from('participants') as unknown as UnknownQuery)
        .update({
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', p.id);
    }
  }

  await (supabase.from('tournaments') as unknown as UnknownQuery)
    .update({
      is_group_stage_finalized: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tournamentId);
}

/**
 * Finalize Group Stage
 */
export async function finalizeGroupStage(tournamentId: string): Promise<void> {
  const supabase = createClient();
  const overview = await getTournamentGroups(tournamentId);

  if (!overview.isGroupStageComplete) {
    throw new Error(
      `Cannot finalize group stage until all matches are completed (${overview.completedGroupMatches}/${overview.totalGroupMatches} completed).`
    );
  }

  const qualifiedIds = new Set(overview.qualifiedParticipants.map((p) => p.id));

  // Update participant status in DB
  for (const p of overview.participants) {
    const isQual = qualifiedIds.has(p.id);
    await (supabase.from('participants') as unknown as UnknownQuery)
      .update({
        status: isQual ? 'active' : 'eliminated',
        updated_at: new Date().toISOString(),
      })
      .eq('id', p.id);
  }

  // Update Tournament Finalized Flag
  await (supabase.from('tournaments') as unknown as UnknownQuery)
    .update({
      is_group_stage_finalized: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tournamentId);
}

export interface TransitionMatchPreview {
  matchPosition: number;
  slotA: GroupQualifierInfo;
  slotB: GroupQualifierInfo;
}

export interface GroupKnockoutTransitionPreview {
  tournament: Tournament;
  isGroupStageFinalized: boolean;
  isGroupStageComplete: boolean;
  isKnockoutAlreadyGenerated: boolean;
  qualifiers: GroupQualifierInfo[];
  eliminated: Participant[];
  proposedMatchups: TransitionMatchPreview[];
  bracketSize: number;
  totalQualifiers: number;
  validationError?: string | null;
}

/**
 * Get Transition Preview details for Admin Review before generating Knockout Stage
 */
export async function getGroupKnockoutTransitionPreview(
  tournamentId: string
): Promise<GroupKnockoutTransitionPreview> {
  const overview = await getTournamentGroups(tournamentId);

  // Check if knockout bracket already exists
  const existingBracket = await getTournamentBracket(tournamentId);
  const isKnockoutAlreadyGenerated = existingBracket.rounds.length > 0;

  // Build qualifier pool with numeric seeds
  const qualifiers = buildGroupQualifierPool(overview.groups, overview.qualifiersPerGroup);

  // Identify eliminated participants
  const qualIds = new Set(qualifiers.map((q) => q.participant.id));
  const eliminated = overview.participants.filter((p) => !qualIds.has(p.id));

  // Determine bracket size & proposed pairings
  const totalQualifiers = qualifiers.length;
  const bracketSize = totalQualifiers <= 2 ? 2 : totalQualifiers <= 4 ? 4 : totalQualifiers <= 8 ? 8 : 16;

  // Build proposed matchups based on assigned numeric seeds
  const proposedMatchups: TransitionMatchPreview[] = [];

  if (totalQualifiers >= 2) {
    const seedToQualifierMap = new Map<number, GroupQualifierInfo>();
    for (const q of qualifiers) {
      seedToQualifierMap.set(q.assignedSeedNumber, q);
    }

    const seedingOrder = generateSeedingOrder(bracketSize);
    let matchPos = 1;
    for (let i = 0; i < seedingOrder.length; i += 2) {
      const seedA = seedingOrder[i];
      const seedB = seedingOrder[i + 1];
      const qA = seedToQualifierMap.get(seedA);
      const qB = seedToQualifierMap.get(seedB);

      if (qA && qB) {
        proposedMatchups.push({
          matchPosition: matchPos++,
          slotA: qA,
          slotB: qB,
        });
      }
    }
  }

  let validationError: string | null = null;
  if (!overview.isGroupStageComplete) {
    validationError = `Group stage is incomplete (${overview.completedGroupMatches}/${overview.totalGroupMatches} matches completed). Complete and finalize the group stage first.`;
  } else if (!overview.isFinalized) {
    validationError = 'Group stage has not been finalized yet. Finalize the group stage first.';
  } else if (qualifiers.length < 2) {
    validationError = 'Minimum 2 qualified participants required to generate knockout stage.';
  }

  return {
    tournament: overview.tournament,
    isGroupStageFinalized: overview.isFinalized,
    isGroupStageComplete: overview.isGroupStageComplete,
    isKnockoutAlreadyGenerated,
    qualifiers,
    eliminated,
    proposedMatchups,
    bracketSize,
    totalQualifiers,
    validationError,
  };
}

/**
 * Prepare Knockout Stage from Finalized Group Stage with duplicate protection & cross-group seed updates
 */
export async function prepareKnockoutFromGroups(tournamentId: string): Promise<void> {
  const supabase = createClient();
  const preview = await getGroupKnockoutTransitionPreview(tournamentId);

  if (preview.validationError) {
    throw new Error(preview.validationError);
  }

  if (preview.isKnockoutAlreadyGenerated) {
    throw new Error('Knockout stage already generated.');
  }

  // Update seeds of qualified participants in DB to match assigned numeric cross-group seeds
  for (const q of preview.qualifiers) {
    await (supabase.from('participants') as unknown as UnknownQuery)
      .update({
        seed_number: q.assignedSeedNumber,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', q.participant.id);
  }

  // Generate Knockout Bracket using Step 6 algorithm
  await generateKnockoutBracket(tournamentId);

  // Update Tournament status to ongoing
  await (supabase.from('tournaments') as unknown as UnknownQuery)
    .update({
      status: 'ongoing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', tournamentId);
}

/**
 * Swap two participants between two groups and re-assign unplayed fixture slots
 */
export async function swapGroupParticipants(
  tournamentId: string,
  participantAId: string,
  groupAId: string,
  participantBId: string,
  groupBId: string
): Promise<void> {
  const supabase = createClient();
  const overview = await getTournamentGroups(tournamentId);

  if (overview.isFinalized || overview.tournament.status === 'completed') {
    throw new Error('Group stage is finalized or completed and locked for edits.');
  }

  // 1. Delete old group_participants rows
  await (supabase.from('group_participants') as unknown as UnknownQuery)
    .delete()
    .eq('group_id', groupAId)
    .eq('participant_id', participantAId);

  await (supabase.from('group_participants') as unknown as UnknownQuery)
    .delete()
    .eq('group_id', groupBId)
    .eq('participant_id', participantBId);

  // 2. Insert swapped group_participants rows
  await (supabase.from('group_participants') as unknown as UnknownQuery).insert([
    { group_id: groupAId, participant_id: participantBId },
    { group_id: groupBId, participant_id: participantAId },
  ]);

  // 3. Update existing unplayed matches for both groups replacing participantA with participantB
  const updateMatchParticipant = async (groupId: string, oldPId: string, newPId: string) => {
    const { data: gMatches } = await (supabase.from('matches') as unknown as UnknownQuery)
      .select('*')
      .eq('group_id', groupId);

    const mList = (gMatches || []) as Match[];
    for (const m of mList) {
      if (m.status === 'pending') {
        const payload: Record<string, string> = {};
        if (m.participant_a === oldPId) payload.participant_a = newPId;
        if (m.participant_b === oldPId) payload.participant_b = newPId;
        if (Object.keys(payload).length > 0) {
          await (supabase.from('matches') as unknown as UnknownQuery)
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', m.id);
        }
      }
    }
  };

  await updateMatchParticipant(groupAId, participantAId, participantBId);
  await updateMatchParticipant(groupBId, participantBId, participantAId);
}

/**
 * Move a participant from source group to target group
 */
export async function moveGroupParticipant(
  tournamentId: string,
  participantId: string,
  sourceGroupId: string,
  targetGroupId: string
): Promise<void> {
  const supabase = createClient();
  const overview = await getTournamentGroups(tournamentId);

  if (overview.isFinalized || overview.tournament.status === 'completed') {
    throw new Error('Group stage is finalized or completed and locked for edits.');
  }

  // 1. Delete from source group
  await (supabase.from('group_participants') as unknown as UnknownQuery)
    .delete()
    .eq('group_id', sourceGroupId)
    .eq('participant_id', participantId);

  // 2. Insert into target group
  await (supabase.from('group_participants') as unknown as UnknownQuery).insert({
    group_id: targetGroupId,
    participant_id: participantId,
  });

  // 3. Update unplayed matches in source group to remove participant or reset unplayed fixtures
  const { data: sMatches } = await (supabase.from('matches') as unknown as UnknownQuery)
    .select('*')
    .eq('group_id', sourceGroupId);

  const mList = (sMatches || []) as Match[];
  for (const m of mList) {
    if (m.status === 'pending') {
      if (m.participant_a === participantId || m.participant_b === participantId) {
        const payload: Record<string, string | null> = {};
        if (m.participant_a === participantId) payload.participant_a = null;
        if (m.participant_b === participantId) payload.participant_b = null;
        await (supabase.from('matches') as unknown as UnknownQuery)
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', m.id);
      }
    }
  }
}

export interface CustomGroupUpdatePayload {
  groupId: string;
  participantIds: string[];
}

/**
 * Save custom participant assignments for multiple groups and optionally regenerate unplayed fixtures
 */
export async function saveCustomGroupAssignments(
  tournamentId: string,
  groupUpdates: CustomGroupUpdatePayload[],
  regenerateFixtures: boolean = true
): Promise<void> {
  const supabase = createClient();
  const overview = await getTournamentGroups(tournamentId);

  if (overview.isFinalized || overview.tournament.status === 'completed') {
    throw new Error('Group stage is finalized or completed and locked for edits.');
  }

  // 1. For each group update, update group_participants
  for (const update of groupUpdates) {
    // Delete existing group_participants for this group
    await (supabase.from('group_participants') as unknown as UnknownQuery)
      .delete()
      .eq('group_id', update.groupId);

    // Insert new group_participants
    if (update.participantIds.length > 0) {
      const rows = update.participantIds.map((pId) => ({
        group_id: update.groupId,
        participant_id: pId,
      }));
      await (supabase.from('group_participants') as unknown as UnknownQuery).insert(rows);
    }

    // 2. If regenerateFixtures is true and no matches in this group are completed, regenerate pairings
    if (regenerateFixtures) {
      const gDet = overview.groups.find((g) => g.group.id === update.groupId);
      if (gDet && gDet.completedMatchesCount === 0) {
        // Delete old matches for this group
        await (supabase.from('matches') as unknown as UnknownQuery)
          .delete()
          .eq('group_id', update.groupId);

        // Fetch participants objects
        const groupParticipants = overview.participants.filter((p) =>
          update.participantIds.includes(p.id)
        );

        if (groupParticipants.length >= 2) {
          const pairings = generateGroupPairings(
            groupParticipants,
            overview.roundsPerPair
          );

          const newMatchRows = pairings.map((pair) => ({
            group_id: update.groupId,
            participant_a: pair.participantA.id,
            participant_b: pair.participantB.id,
            score_a: null,
            score_b: null,
            status: 'pending',
            match_position: pair.matchPosition,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));

          await (supabase.from('matches') as unknown as UnknownQuery).insert(newMatchRows);
        }
      }
    }
  }
}

/**
 * Create a new custom group in tournament
 */
export async function createCustomGroup(tournamentId: string, groupName: string): Promise<Group> {
  const supabase = createClient();
  const overview = await getTournamentGroups(tournamentId);

  if (overview.isFinalized || overview.tournament.status === 'completed') {
    throw new Error('Group stage is finalized or completed and locked for edits.');
  }

  const { data, error } = await (supabase.from('groups') as unknown as UnknownQuery)
    .insert({
      tournament_id: tournamentId,
      name: groupName,
      created_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create group: ${formatSupabaseError(error)}`);
  }

  return data as Group;
}

/**
 * Delete an empty group
 */
export async function deleteEmptyGroup(tournamentId: string, groupId: string): Promise<void> {
  const supabase = createClient();
  const overview = await getTournamentGroups(tournamentId);

  if (overview.isFinalized || overview.tournament.status === 'completed') {
    throw new Error('Group stage is finalized or completed and locked for edits.');
  }

  // Check if matches or participants exist
  const gDet = overview.groups.find((g) => g.group.id === groupId);
  if (gDet && gDet.completedMatchesCount > 0) {
    throw new Error('Cannot delete group with completed matches.');
  }

  await (supabase.from('matches') as unknown as UnknownQuery).delete().eq('group_id', groupId);
  await (supabase.from('group_participants') as unknown as UnknownQuery).delete().eq('group_id', groupId);
  await (supabase.from('groups') as unknown as UnknownQuery).delete().eq('id', groupId);
}
