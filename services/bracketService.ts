import { createClient } from '@/lib/supabase/client';
import type { Round, Match, Participant, Tournament } from '@/types/database';
import {
  calculateBracketSize,
  calculateByes,
  assignParticipantsToSlots,
  createFirstRoundPairings,
  getRoundName,
} from '@/lib/bracket/bracketEngine';

import { getTournamentById, TournamentWithStats } from '@/services/tournamentService';

export interface FullMatchData extends Match {
  participantAUser?: Participant | null;
  participantBUser?: Participant | null;
  winnerUser?: Participant | null;
}

export interface RoundWithMatches extends Round {
  matches: FullMatchData[];
}

export interface BracketOverview {
  tournament: TournamentWithStats;
  participants: Participant[];
  rounds: RoundWithMatches[];
  bracketSize: number;
  byesCount: number;
  totalRounds: number;
  status: 'Not Generated' | 'Generated' | 'In Progress' | 'Completed';
}

type UnknownQuery = {
  select: (columns: string, options?: unknown) => UnknownQuery;
  eq: (column: string, value: unknown) => UnknownQuery;
  gt: (column: string, value: unknown) => UnknownQuery;
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
 * Fetch full bracket data for a tournament
 */
export async function getTournamentBracket(tournamentId: string): Promise<BracketOverview> {
  const supabase = createClient();

  // 1. Fetch Tournament with stats, champion, and runner-up
  const tournament = await getTournamentById(tournamentId);
  if (!tournament) {
    throw new Error('Tournament not found');
  }

  // 2. Fetch Participants
  const pRes = await (supabase.from('participants') as unknown as UnknownQuery)
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('seed_number', { ascending: true });

  const participants = (pRes.data || []) as Participant[];

  // 3. Fetch Rounds (Exclude Group Stage Rounds)
  const rRes = await (supabase.from('rounds') as unknown as UnknownQuery)
    .select('*')
    .eq('tournament_id', tournamentId)
    .gt('round_number', 0)
    .order('round_number', { ascending: true });

  const rounds = ((rRes.data || []) as Round[]).filter(
    (r) => !r.name.toLowerCase().includes('group stage')
  );

  // For group_knockout tournaments, active participants are the qualified ones
  const filteredParticipants =
    tournament.format === 'group_knockout'
      ? participants.filter((p) => p.status === 'active')
      : participants;

  const participantMap = new Map<string, Participant>(participants.map((p) => [p.id, p]));

  // 4. Fetch Matches for all rounds
  let roundsWithMatches: RoundWithMatches[] = [];
  let bracketStatus: 'Not Generated' | 'Generated' | 'In Progress' | 'Completed' = 'Not Generated';

  if (rounds.length > 0) {
    const roundIds = rounds.map((r) => r.id);
    const mRes = await (supabase.from('matches') as unknown as UnknownQuery)
      .select('*')
      .in('round_id', roundIds)
      .order('match_position', { ascending: true });

    const allMatches = (mRes.data || []) as Match[];

    // Group matches by round_id
    const matchMap = new Map<string, FullMatchData[]>();
    let hasCompletedMatches = false;
    let hasPendingOrLiveMatches = false;

    for (const m of allMatches) {
      const fullMatch: FullMatchData = {
        ...m,
        participantAUser: m.participant_a ? participantMap.get(m.participant_a) || null : null,
        participantBUser: m.participant_b ? participantMap.get(m.participant_b) || null : null,
        winnerUser: m.winner_id ? participantMap.get(m.winner_id) || null : null,
      };

      if (m.status === 'completed' || m.winner_id) {
        hasCompletedMatches = true;
      } else {
        hasPendingOrLiveMatches = true;
      }

      const list = matchMap.get(m.round_id) || [];
      list.push(fullMatch);
      matchMap.set(m.round_id, list);
    }

    roundsWithMatches = rounds.map((r) => ({
      ...r,
      matches: matchMap.get(r.id) || [],
    }));

    if (hasCompletedMatches && !hasPendingOrLiveMatches) {
      bracketStatus = 'Completed';
    } else if (hasCompletedMatches) {
      bracketStatus = 'In Progress';
    } else {
      bracketStatus = 'Generated';
    }
  }

  const activeCount = filteredParticipants.length;
  const bracketSize = calculateBracketSize(activeCount);
  const byesCount = calculateByes(bracketSize, activeCount);
  const totalRounds = activeCount >= 2 ? Math.log2(bracketSize) : 0;

  return {
    tournament,
    participants: filteredParticipants,
    rounds: roundsWithMatches,
    bracketSize,
    byesCount,
    totalRounds,
    status: bracketStatus,
  };
}

/**
 * Generate a new Knockout Tournament Bracket
 */
export async function generateKnockoutBracket(tournamentId: string): Promise<void> {
  const supabase = createClient();

  // 1. Fetch Tournament & Participants
  const overview = await getTournamentBracket(tournamentId);
  const { tournament, participants } = overview;

  if (tournament.format === 'group_knockout') {
    if (!tournament.is_group_stage_finalized) {
      throw new Error('Group Stage must be finalized before generating the Knockout Bracket.');
    }
  } else if (tournament.format !== 'knockout') {
    throw new Error('Bracket generation is available for knockout or finalized group_knockout tournaments.');
  }

  if (participants.length < 2) {
    throw new Error('At least 2 participants are required to generate a knockout bracket.');
  }

  // 2. Existing Bracket Protection Check
  if (overview.rounds.length > 0) {
    const hasCompleted = overview.rounds.some((r) =>
      r.matches.some((m) => m.status === 'completed' || m.winner_id !== null || m.score_a > 0 || m.score_b > 0)
    );
    if (hasCompleted) {
      throw new Error('Cannot regenerate a bracket containing existing match results.');
    }

    // Delete existing rounds and matches safely
    const roundIds = overview.rounds.map((r) => r.id);
    if (roundIds.length > 0) {
      await (supabase.from('matches') as unknown as UnknownQuery).delete().in('round_id', roundIds);
      await (supabase.from('rounds') as unknown as UnknownQuery).delete().in('id', roundIds);
    }
  }

  // SPECIAL HANDLING: 6-Player Playoff Eliminators Format (Top 6 Qualification)
  if (participants.length === 6) {
    const roundInserts = [
      { tournament_id: tournamentId, round_number: 1, name: 'Playoff Eliminators' },
      { tournament_id: tournamentId, round_number: 2, name: 'Semi-Finals' },
      { tournament_id: tournamentId, round_number: 3, name: 'Grand Final' },
    ];

    const { data: createdRounds, error: rErr } = await (supabase.from('rounds') as unknown as UnknownQuery)
      .insert(roundInserts)
      .select('*');

    if (rErr || !createdRounds) {
      throw new Error(`Failed to create rounds for 6-player Playoff Eliminators: ${formatSupabaseError(rErr)}`);
    }

    const sortedRounds = (createdRounds as Round[]).sort((a, b) => a.round_number - b.round_number);
    const r1 = sortedRounds[0]; // Eliminators
    const r2 = sortedRounds[1]; // Semi-Finals
    const r3 = sortedRounds[2]; // Grand Final

    // 1. Create Grand Final Match
    const { data: createdFinal, error: fErr } = await (supabase.from('matches') as unknown as UnknownQuery)
      .insert({
        round_id: r3.id,
        match_position: 1,
        status: 'pending',
        score_a: 0,
        score_b: 0,
      })
      .select('*')
      .single();

    if (fErr || !createdFinal) {
      throw new Error(`Failed to create Grand Final match: ${formatSupabaseError(fErr)}`);
    }
    const finalMatchObj = createdFinal as Match;

    // 2. Create Semi-Final Matches (1st Place & 2nd Place receive Direct Byes to SF1 & SF2)
    const p1 = participants[0]; // 1st Place (League Winner)
    const p2 = participants[1]; // 2nd Place
    const p3 = participants[2]; // 3rd Place
    const p4 = participants[3]; // 4th Place
    const p5 = participants[4]; // 5th Place
    const p6 = participants[5]; // 6th Place

    const sfPayloads = [
      {
        round_id: r2.id,
        match_position: 1,
        next_match_id: finalMatchObj.id,
        winner_slot: 'participant_a',
        participant_a: p1 ? p1.id : null,
        participant_b: null,
        status: 'pending',
        score_a: 0,
        score_b: 0,
        notes: '1st Place League Winner Direct Semi-Final Spot',
      },
      {
        round_id: r2.id,
        match_position: 2,
        next_match_id: finalMatchObj.id,
        winner_slot: 'participant_b',
        participant_a: p2 ? p2.id : null,
        participant_b: null,
        status: 'pending',
        score_a: 0,
        score_b: 0,
        notes: '2nd Place Direct Semi-Final Spot',
      },
    ];

    const { data: createdSFs, error: sfErr } = await (supabase.from('matches') as unknown as UnknownQuery)
      .insert(sfPayloads)
      .select('*');

    if (sfErr || !createdSFs) {
      throw new Error(`Failed to create Semi-Final matches: ${formatSupabaseError(sfErr)}`);
    }
    const sfMatches = (createdSFs as Match[]).sort((a, b) => a.match_position - b.match_position);
    const sf1 = sfMatches[0];
    const sf2 = sfMatches[1];

    // 3. Create Eliminator Matches
    // Eliminator 1: 3rd Place vs 6th Place -> Winner to SF2 (participant_b)
    // Eliminator 2: 4th Place vs 5th Place -> Winner to SF1 (participant_b)
    const elimPayloads = [
      {
        round_id: r1.id,
        match_position: 1,
        next_match_id: sf2.id,
        winner_slot: 'participant_b',
        participant_a: p3 ? p3.id : null,
        participant_b: p6 ? p6.id : null,
        status: p3 && p6 ? 'ready' : 'pending',
        score_a: 0,
        score_b: 0,
        notes: 'Eliminator 1: 3rd Place vs 6th Place',
      },
      {
        round_id: r1.id,
        match_position: 2,
        next_match_id: sf1.id,
        winner_slot: 'participant_b',
        participant_a: p4 ? p4.id : null,
        participant_b: p5 ? p5.id : null,
        status: p4 && p5 ? 'ready' : 'pending',
        score_a: 0,
        score_b: 0,
        notes: 'Eliminator 2: 4th Place vs 5th Place',
      },
    ];

    const { error: elimErr } = await (supabase.from('matches') as unknown as UnknownQuery).insert(elimPayloads);
    if (elimErr) {
      throw new Error(`Failed to create Eliminator matches: ${formatSupabaseError(elimErr)}`);
    }

    await (supabase.from('tournaments') as unknown as UnknownQuery)
      .update({ status: 'ongoing', updated_at: new Date().toISOString() })
      .eq('id', tournamentId);

    return;
  }

  // 3. Bracket Sizing & Calculations
  const bracketSize = calculateBracketSize(participants.length);
  const totalRounds = Math.log2(bracketSize);
  const slots = assignParticipantsToSlots(participants, bracketSize);
  const firstRoundPairings = createFirstRoundPairings(slots);

  // 4. Create Round Records in Supabase
  const roundInserts = [];
  for (let r = 1; r <= totalRounds; r++) {
    roundInserts.push({
      tournament_id: tournamentId,
      round_number: r,
      name: getRoundName(r, totalRounds),
    });
  }

  const { data: createdRounds, error: rErr } = await (supabase.from('rounds') as unknown as UnknownQuery)
    .insert(roundInserts)
    .select('*');

  if (rErr || !createdRounds) {
    throw new Error(`Failed to create rounds: ${formatSupabaseError(rErr)}`);
  }

  const sortedRounds = (createdRounds as Round[]).sort((a, b) => a.round_number - b.round_number);

  // 5. Generate Match Structure (Linked via next_match_id & winner_slot)
  // We build matches round by round from Final (totalRounds) down to Round 1
  const roundMatchMap = new Map<number, Match[]>();

  for (let r = totalRounds; r >= 1; r--) {
    const roundObj = sortedRounds[r - 1];
    const matchCount = Math.pow(2, totalRounds - r);
    const nextRoundMatches = roundMatchMap.get(r + 1) || [];

    const matchPayloads = [];
    for (let m = 1; m <= matchCount; m++) {
      let nextMatchId: string | null = null;
      let winnerSlot: 'participant_a' | 'participant_b' | null = null;

      if (r < totalRounds) {
        const parentMatchIndex = Math.floor((m - 1) / 2);
        const parentMatch = nextRoundMatches[parentMatchIndex];
        if (parentMatch) {
          nextMatchId = parentMatch.id;
          winnerSlot = m % 2 !== 0 ? 'participant_a' : 'participant_b';
        }
      }

      let participantA: string | null = null;
      let participantB: string | null = null;
      let matchStatus: 'pending' | 'ready' | 'walkover' = 'pending';
      let winnerId: string | null = null;
      let notes: string | null = null;

      // Populate First Round participants from pairings
      if (r === 1) {
        const pairing = firstRoundPairings[m - 1];
        if (pairing) {
          participantA = pairing.slotA.participant ? pairing.slotA.participant.id : null;
          participantB = pairing.slotB.participant ? pairing.slotB.participant.id : null;

          if (pairing.isByeMatch && pairing.byeWinner) {
            matchStatus = 'walkover';
            winnerId = pairing.byeWinner.id;
            notes = 'Automatic BYE advancement';
          } else {
            matchStatus = 'pending';
          }
        }
      }

      matchPayloads.push({
        round_id: roundObj.id,
        match_position: m,
        next_match_id: nextMatchId,
        winner_slot: winnerSlot,
        participant_a: participantA,
        participant_b: participantB,
        status: matchStatus,
        winner_id: winnerId,
        notes,
        score_a: 0,
        score_b: 0,
      });
    }

    const { data: createdMatches, error: mErr } = await (supabase.from('matches') as unknown as UnknownQuery)
      .insert(matchPayloads)
      .select('*');

    if (mErr || !createdMatches) {
      throw new Error(`Failed to create matches for Round ${r}: ${formatSupabaseError(mErr)}`);
    }

    const sortedMatches = (createdMatches as Match[]).sort((a, b) => a.match_position - b.match_position);
    roundMatchMap.set(r, sortedMatches);
  }

  // 6. Automatic Advancement for BYE Recipients into Round 2 & Ready status checks
  const round1Matches = roundMatchMap.get(1) || [];
  const round2Matches = roundMatchMap.get(2) || [];

  for (let i = 0; i < firstRoundPairings.length; i++) {
    const pairing = firstRoundPairings[i];
    if (pairing.isByeMatch && pairing.byeWinner && round2Matches.length > 0) {
      const r1Match = round1Matches[i];
      if (r1Match && r1Match.next_match_id && r1Match.winner_slot) {
        // Advance BYE winner into Round 2 match slot
        await (supabase.from('matches') as unknown as UnknownQuery)
          .update({
            [r1Match.winner_slot]: pairing.byeWinner.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', r1Match.next_match_id);

        // Fetch Round 2 match to check if both slots are filled
        const { data: r2Data } = await (supabase.from('matches') as unknown as UnknownQuery)
          .select('*')
          .eq('id', r1Match.next_match_id)
          .single();

        if (r2Data) {
          const r2M = r2Data as Match;
          if (r2M.participant_a && r2M.participant_b && r2M.status === 'pending') {
            await (supabase.from('matches') as unknown as UnknownQuery)
              .update({
                status: 'ready',
                updated_at: new Date().toISOString(),
              })
              .eq('id', r2M.id);
          }
        }
      }
    }
  }

  // 7. Automatically set tournament status to 'ongoing' if registration
  if (tournament.status === 'registration' || tournament.status === 'draft') {
    await (supabase.from('tournaments') as unknown as UnknownQuery)
      .update({
        status: 'ongoing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', tournamentId);
  }
}

/**
 * Reset Bracket (Safely deletes rounds and matches when no results exist)
 */
export async function resetBracket(tournamentId: string): Promise<void> {
  const supabase = createClient();
  const overview = await getTournamentBracket(tournamentId);

  const hasCompleted = overview.rounds.some((r) =>
    r.matches.some((m) => m.status === 'completed' || m.winner_id !== null || m.score_a > 0 || m.score_b > 0)
  );

  if (hasCompleted) {
    throw new Error('Cannot reset a bracket that already contains match results.');
  }

  const roundIds = overview.rounds.map((r) => r.id);
  if (roundIds.length > 0) {
    await (supabase.from('matches') as unknown as UnknownQuery).delete().in('round_id', roundIds);
    await (supabase.from('rounds') as unknown as UnknownQuery).delete().eq('tournament_id', tournamentId);
  }
}

/**
 * Manual Slot Override (Replaces participant in an active first-round match slot)
 */
export async function overrideMatchSlot(
  matchId: string,
  slot: 'participant_a' | 'participant_b',
  newParticipantId: string | null
): Promise<void> {
  const supabase = createClient();

  const { data: matchData, error: mErr } = await (supabase.from('matches') as unknown as UnknownQuery)
    .select('*')
    .eq('id', matchId)
    .single();

  if (mErr || !matchData) {
    throw new Error(`Match not found: ${formatSupabaseError(mErr)}`);
  }

  const match = matchData as Match;
  if (match.status === 'completed' || match.winner_id !== null) {
    throw new Error('Cannot override slots in a completed match.');
  }

  const { error: updateErr } = await (supabase.from('matches') as unknown as UnknownQuery)
    .update({
      [slot]: newParticipantId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId);

  if (updateErr) {
    throw new Error(`Failed to update match slot: ${formatSupabaseError(updateErr)}`);
  }
}
