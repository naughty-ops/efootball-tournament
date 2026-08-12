import { createClient } from '@/lib/supabase/client';
import type { Tournament, Participant, Match, Round } from '@/types/database';
import { getTournamentById } from '@/services/tournamentService';

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

export interface LeaguePairing {
  roundNumber: number;
  matchPosition: number;
  participantA: Participant;
  participantB: Participant;
}

/**
 * Generate standard Berger Round-Robin schedule for a list of participants.
 * Handles both even and odd participant counts (odd counts assign BYE rest rounds).
 */
export function generateRoundRobinSchedule(
  participants: Participant[],
  roundsPerPair: number = 1
): { roundNumber: number; pairings: LeaguePairing[] }[] {
  if (participants.length < 2) return [];

  const isOdd = participants.length % 2 !== 0;
  // Copy participants list; if odd, append a null placeholder representing BYE
  const pool: (Participant | null)[] = [...participants];
  if (isOdd) {
    pool.push(null);
  }

  const n = pool.length; // Always even now
  const totalRoundsPerLeg = n - 1;
  const matchesPerRound = n / 2;
  const schedule: { roundNumber: number; pairings: LeaguePairing[] }[] = [];

  const currentPool = [...pool];

  for (let leg = 1; leg <= roundsPerPair; leg++) {
    for (let r = 1; r <= totalRoundsPerLeg; r++) {
      const roundNum = (leg - 1) * totalRoundsPerLeg + r;
      const pairings: LeaguePairing[] = [];
      let matchPos = 1;

      for (let i = 0; i < matchesPerRound; i++) {
        const p1 = currentPool[i];
        const p2 = currentPool[n - 1 - i];

        // Skip BYE pairings (neither player plays against a BYE)
        if (p1 !== null && p2 !== null) {
          // Alternate home/away based on round number and leg
          const isHomeA = (i + r + leg) % 2 === 0;
          const pA = isHomeA ? p1 : p2;
          const pB = isHomeA ? p2 : p1;

          pairings.push({
            roundNumber: roundNum,
            matchPosition: matchPos++,
            participantA: pA,
            participantB: pB,
          });
        }
      }

      schedule.push({ roundNumber: roundNum, pairings });

      // Rotate pool elements (keep pool[0] fixed, shift remaining elements right)
      const fixed = currentPool[0];
      const rest = currentPool.slice(1);
      const last = rest.pop()!;
      currentPool.length = 0;
      currentPool.push(fixed, last, ...rest);
    }
  }

  return schedule;
}

/**
 * Generate League / Round Robin Fixtures for a Tournament
 */
export async function generateLeagueFixtures(
  tournamentId: string,
  roundsPerPair: number = 1
): Promise<void> {
  const supabase = createClient();

  // 1. Fetch Tournament
  const tObj = await getTournamentById(tournamentId);
  if (!tObj) throw new Error('Tournament not found.');

  // 2. Fetch Participants
  const { data: pData, error: pErr } = await (supabase.from('participants') as unknown as UnknownQuery)
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('seed_number', { ascending: true });

  if (pErr) throw new Error(`Failed to load participants: ${formatSupabaseError(pErr)}`);

  const participants = (pData || []) as Participant[];
  if (participants.length < 2) {
    throw new Error('At least 2 participants are required to generate league fixtures.');
  }

  // 3. Existing Fixtures Check
  const { data: existingRounds } = await (supabase.from('rounds') as unknown as UnknownQuery)
    .select('*')
    .eq('tournament_id', tournamentId);

  const rList = (existingRounds || []) as Round[];
  if (rList.length > 0) {
    const roundIds = rList.map((r) => r.id);
    const { data: existingMatches } = await (supabase.from('matches') as unknown as UnknownQuery)
      .select('*')
      .in('round_id', roundIds);

    const mList = (existingMatches || []) as Match[];
    const hasCompleted = mList.some(
      (m) => m.status === 'completed' || m.status === 'walkover' || m.score_a > 0 || m.score_b > 0
    );

    if (hasCompleted) {
      throw new Error('Cannot regenerate league fixtures for a tournament containing completed match results.');
    }

    // Delete existing unplayed matches and rounds safely
    await (supabase.from('matches') as unknown as UnknownQuery).delete().in('round_id', roundIds);
    await (supabase.from('rounds') as unknown as UnknownQuery).delete().eq('tournament_id', tournamentId);
  }

  // 4. Generate Round Robin Schedule
  const schedule = generateRoundRobinSchedule(participants, roundsPerPair);

  // 5. Create Round Records
  const roundInserts = schedule.map((s) => ({
    tournament_id: tournamentId,
    round_number: s.roundNumber,
    name: `Matchday ${s.roundNumber}`,
  }));

  const { data: createdRounds, error: rErr } = await (supabase.from('rounds') as unknown as UnknownQuery)
    .insert(roundInserts)
    .select('*');

  if (rErr || !createdRounds) {
    throw new Error(`Failed to create league rounds: ${formatSupabaseError(rErr)}`);
  }

  const sortedRounds = (createdRounds as Round[]).sort((a, b) => a.round_number - b.round_number);
  const roundMap = new Map<number, string>(sortedRounds.map((r) => [r.round_number, r.id]));

  // 6. Create Match Records
  const matchPayloads = [];
  for (const s of schedule) {
    const roundId = roundMap.get(s.roundNumber);
    if (!roundId) continue;

    for (const p of s.pairings) {
      matchPayloads.push({
        round_id: roundId,
        participant_a: p.participantA.id,
        participant_b: p.participantB.id,
        match_position: p.matchPosition,
        status: 'pending',
        score_a: 0,
        score_b: 0,
      });
    }
  }

  const { error: mErr } = await (supabase.from('matches') as unknown as UnknownQuery).insert(matchPayloads);

  if (mErr) {
    throw new Error(`Failed to create league matches: ${formatSupabaseError(mErr)}`);
  }

  // 7. Automatically update tournament status to 'ongoing'
  const newStatus = tObj.status === 'draft' || tObj.status === 'registration' ? 'ongoing' : tObj.status;
  await (supabase.from('tournaments') as unknown as UnknownQuery)
    .update({
      status: newStatus,
      rounds_per_pair: roundsPerPair,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tournamentId);
}
