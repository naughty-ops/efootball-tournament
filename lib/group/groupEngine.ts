import type { Participant, Match } from '@/types/database';

export interface GroupStandingRow {
  position: number;
  participant: Participant;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  isQualified?: boolean;
}

export interface RoundRobinPairing {
  matchPosition: number;
  participantA: Participant;
  participantB: Participant;
  roundNumber: number; // 1 or 2
}

export interface GroupQualifierInfo {
  participant: Participant;
  groupName: string;
  position: number;
  seedCode: string; // e.g. A1, A2, B1, B2
  assignedSeedNumber: number; // Numeric seed for bracket engine
  points: number;
  goalDifference: number;
  goalsFor: number;
}

/**
 * Build qualified participant pool with deterministic cross-group numeric seeds
 */
export function buildGroupQualifierPool(
  groupsDetails: {
    group: { id: string; name: string };
    standings: GroupStandingRow[];
  }[],
  qualifiersPerGroup: number = 2
): GroupQualifierInfo[] {
  const qualifiers: GroupQualifierInfo[] = [];

  // Sort groups by name (Group A, Group B, Group C, Group D...)
  const sortedGroups = [...groupsDetails].sort((a, b) => a.group.name.localeCompare(b.group.name));

  // Extract qualified rows
  for (const gDet of sortedGroups) {
    const groupLetter = gDet.group.name.replace(/^Group\s*/i, '').trim() || 'A';
    for (const row of gDet.standings) {
      if (row.isQualified) {
        qualifiers.push({
          participant: row.participant,
          groupName: gDet.group.name,
          position: row.position,
          seedCode: `${groupLetter}${row.position}`,
          assignedSeedNumber: 0, // Will be computed below
          points: row.points,
          goalDifference: row.goalDifference,
          goalsFor: row.goalsFor,
        });
      }
    }
  }

  // Assign numeric seeds for cross-group pairings:
  // For 2 groups, Top 2 (A1, B1, A2, B2):
  // Seed 1 = A1, Seed 2 = B1, Seed 3 = A2, Seed 4 = B2
  // Bracket engine pairs: 1 vs 4 (A1 vs B2), 2 vs 3 (B1 vs A2)
  if (sortedGroups.length === 2 && qualifiersPerGroup === 2 && qualifiers.length === 4) {
    const seedMap: Record<string, number> = {
      A1: 1,
      B1: 2,
      A2: 3,
      B2: 4,
    };

    for (const q of qualifiers) {
      q.assignedSeedNumber = seedMap[q.seedCode] || q.assignedSeedNumber;
    }
  } else if (sortedGroups.length === 4 && qualifiersPerGroup === 2 && qualifiers.length === 8) {
    // For 4 groups, Top 2:
    // A1 vs B2, C1 vs D2, B1 vs A2, D1 vs C2
    const seedMap: Record<string, number> = {
      A1: 1,
      B1: 2,
      D1: 3,
      C1: 4,
      D2: 5,
      C2: 6,
      A2: 7,
      B2: 8,
    };

    for (const q of qualifiers) {
      q.assignedSeedNumber = seedMap[q.seedCode] || q.assignedSeedNumber;
    }
  } else {
    // Default fallback: Rank group winners first (seeds 1..G), then runners-up (seeds G+1..2G), etc.
    qualifiers.sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return a.groupName.localeCompare(b.groupName);
    });

    for (let i = 0; i < qualifiers.length; i++) {
      qualifiers[i].assignedSeedNumber = i + 1;
    }
  }

  return qualifiers;
}

/**
 * Generate standard group names (e.g. Group A, Group B, Group C, ...)
 */
export function generateGroupNames(groupCount: number): string[] {
  const names: string[] = [];
  for (let i = 0; i < groupCount; i++) {
    const letter = String.fromCharCode(65 + (i % 26));
    const prefix = i >= 26 ? `Group ${Math.floor(i / 26)}${letter}` : `Group ${letter}`;
    names.push(prefix);
  }
  return names;
}

/**
 * Distribute participants across groups using a fair seed-based snake draft algorithm
 */
export function distributeParticipantsSnake(
  participants: Participant[],
  groupCount: number
): Participant[][] {
  const groups: Participant[][] = Array.from({ length: groupCount }, () => []);
  if (participants.length === 0 || groupCount <= 0) return groups;

  // Separate seeded vs unseeded
  const seeded = participants
    .filter((p) => p.seed_number !== null && p.seed_number !== undefined)
    .sort((a, b) => (a.seed_number as number) - (b.seed_number as number));

  const unseeded = participants
    .filter((p) => p.seed_number === null || p.seed_number === undefined)
    .sort((a, b) => a.username.localeCompare(b.username));

  const sortedAll = [...seeded, ...unseeded];

  // Snake distribution: 0, 1, ..., G-1, G-1, G-2, ..., 0
  let direction = 1; // 1 = forward, -1 = reverse
  let groupIdx = 0;

  for (const p of sortedAll) {
    groups[groupIdx].push(p);

    if (direction === 1) {
      if (groupIdx === groupCount - 1) {
        direction = -1;
      } else {
        groupIdx++;
      }
    } else {
      if (groupIdx === 0) {
        direction = 1;
      } else {
        groupIdx--;
      }
    }
  }

  return groups;
}

/**
 * Generate round-robin match pairings for a list of group participants.
 * Supports 1-Round (single leg) and 2-Round (double leg) modes.
 */
export function generateGroupPairings(
  participants: Participant[],
  roundsPerPair: number = 1
): RoundRobinPairing[] {
  const pairings: RoundRobinPairing[] = [];
  const n = participants.length;
  if (n < 2) return pairings;

  let matchPos = 1;

  // Round 1 (Leg 1)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairings.push({
        matchPosition: matchPos++,
        participantA: participants[i],
        participantB: participants[j],
        roundNumber: 1,
      });
    }
  }

  // Round 2 (Leg 2) if 2-Round mode
  if (roundsPerPair === 2) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        pairings.push({
          matchPosition: matchPos++,
          participantA: participants[j], // Reverse home/away
          participantB: participants[i],
          roundNumber: 2,
        });
      }
    }
  }

  return pairings;
}

/**
 * Alias for backward compatibility
 */
export function generateSingleRoundRobinPairings(
  participants: Participant[]
): RoundRobinPairing[] {
  return generateGroupPairings(participants, 1);
}

/**
 * Calculate derived standings and apply deterministic tiebreaker ordering
 */
export function calculateGroupStandings(
  groupMatches: Match[],
  groupParticipants: Participant[],
  qualifiersPerGroup: number = 2
): GroupStandingRow[] {
  const map = new Map<string, GroupStandingRow>();

  for (const p of groupParticipants) {
    map.set(p.id, {
      position: 0,
      participant: p,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      isQualified: false,
    });
  }

  // Calculate stats from completed/walkover matches
  for (const m of groupMatches) {
    if ((m.status !== 'completed' && m.status !== 'walkover') || !m.participant_a || !m.participant_b) {
      continue;
    }

    const rowA = map.get(m.participant_a);
    const rowB = map.get(m.participant_b);
    if (!rowA || !rowB) continue;

    rowA.played += 1;
    rowB.played += 1;

    if (m.status === 'walkover') {
      if (m.winner_id === rowA.participant.id) {
        rowA.wins += 1;
        rowA.points += 3;
        rowB.losses += 1;
      } else if (m.winner_id === rowB.participant.id) {
        rowB.wins += 1;
        rowB.points += 3;
        rowA.losses += 1;
      }
    } else {
      // Normal completed match
      rowA.goalsFor += m.score_a;
      rowA.goalsAgainst += m.score_b;
      rowA.goalDifference = rowA.goalsFor - rowA.goalsAgainst;

      rowB.goalsFor += m.score_b;
      rowB.goalsAgainst += m.score_a;
      rowB.goalDifference = rowB.goalsFor - rowB.goalsAgainst;

      if (m.score_a > m.score_b) {
        rowA.wins += 1;
        rowA.points += 3;
        rowB.losses += 1;
      } else if (m.score_b > m.score_a) {
        rowB.wins += 1;
        rowB.points += 3;
        rowA.losses += 1;
      } else {
        // Draw
        rowA.draws += 1;
        rowA.points += 1;
        rowB.draws += 1;
        rowB.points += 1;
      }
    }
  }

  const standingsList = Array.from(map.values());

  // Deterministic tiebreaker sort
  standingsList.sort((a, b) => {
    // 1. Points
    if (b.points !== a.points) return b.points - a.points;

    // 2. Goal Difference
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;

    // 3. Goals For
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

    // 4. Head-to-Head match result if two players tied
    const h2hMatch = groupMatches.find(
      (m) =>
        (m.status === 'completed' || m.status === 'walkover') &&
        ((m.participant_a === a.participant.id && m.participant_b === b.participant.id) ||
          (m.participant_a === b.participant.id && m.participant_b === a.participant.id))
    );

    if (h2hMatch && h2hMatch.winner_id) {
      if (h2hMatch.winner_id === a.participant.id) return -1;
      if (h2hMatch.winner_id === b.participant.id) return 1;
    }

    // 5. Alphabetical username
    return a.participant.username.localeCompare(b.participant.username);
  });

  // Assign positions and qualification status
  return standingsList.map((row, idx) => {
    const position = idx + 1;
    return {
      ...row,
      position,
      isQualified: position <= qualifiersPerGroup,
    };
  });
}
