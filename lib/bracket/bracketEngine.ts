import type { Participant } from '@/types/database';

export interface BracketSlot {
  seedNumber: number; // 1-indexed seed number position in bracket
  participant: Participant | null; // Null represents a BYE or empty slot
  isBye: boolean;
}

export interface MatchPairing {
  matchPosition: number; // 1-indexed position within round
  slotA: BracketSlot;
  slotB: BracketSlot;
  isByeMatch: boolean;
  byeWinner: Participant | null; // Participant who automatically advances if BYE
}

export interface RoundStructure {
  roundNumber: number; // 1-indexed (Round 1 is first round)
  name: string;
  matchCount: number;
}

/**
 * Calculate the smallest power of 2 greater than or equal to participantCount (min 4)
 */
export function calculateBracketSize(participantCount: number): number {
  if (participantCount <= 2) return 2;
  let size = 4;
  while (size < participantCount) {
    size *= 2;
  }
  return size;
}

/**
 * Calculate total byes needed: bracketSize - participantCount
 */
export function calculateByes(bracketSize: number, participantCount: number): number {
  return Math.max(0, bracketSize - participantCount);
}

/**
 * Generate standard power-of-two seeding position array (e.g. N=8 -> [1, 8, 4, 5, 2, 7, 3, 6])
 */
export function generateSeedingOrder(size: number): number[] {
  if (size <= 1) return [1];
  let seeds = [1, 2];
  while (seeds.length < size) {
    const nextSize = seeds.length * 2;
    const nextSeeds: number[] = [];
    for (const seed of seeds) {
      nextSeeds.push(seed);
      nextSeeds.push(nextSize + 1 - seed);
    }
    seeds = nextSeeds;
  }
  return seeds;
}

/**
 * Generate round titles based on round number and total rounds
 */
export function getRoundName(roundNumber: number, totalRounds: number): string {
  const remainingRounds = totalRounds - roundNumber + 1;
  if (remainingRounds === 1) return 'Final';
  if (remainingRounds === 2) return 'Semi Final';
  if (remainingRounds === 3) return 'Quarter Final';
  const roundSize = Math.pow(2, remainingRounds);
  return `Round of ${roundSize}`;
}

/**
 * Deterministically assign participants to bracket slots based on seed numbers
 */
export function assignParticipantsToSlots(
  participants: Participant[],
  bracketSize: number
): BracketSlot[] {
  const totalCount = participants.length;

  // Separate seeded vs unseeded participants
  const seeded = participants
    .filter((p) => p.seed_number !== null && p.seed_number !== undefined && p.seed_number <= bracketSize)
    .sort((a, b) => (a.seed_number as number) - (b.seed_number as number));

  const unseeded = participants
    .filter((p) => p.seed_number === null || p.seed_number === undefined || p.seed_number > bracketSize)
    .sort((a, b) => a.username.localeCompare(b.username));

  // Map seed_number (1..totalCount) to Participant or NULL (if seed_number > totalCount -> BYE)
  const seedToParticipantMap = new Map<number, Participant>();

  // 1. Assign explicitly seeded participants
  const occupiedSeeds = new Set<number>();
  for (const p of seeded) {
    const sNum = p.seed_number as number;
    if (sNum >= 1 && sNum <= totalCount) {
      seedToParticipantMap.set(sNum, p);
      occupiedSeeds.add(sNum);
    }
  }

  // 2. Assign unseeded participants to available seed positions from 1..totalCount
  let unseededIdx = 0;
  for (let sNum = 1; sNum <= totalCount; sNum++) {
    if (!occupiedSeeds.has(sNum) && unseededIdx < unseeded.length) {
      seedToParticipantMap.set(sNum, unseeded[unseededIdx]);
      occupiedSeeds.add(sNum);
      unseededIdx++;
    }
  }

  // Generate standard seeding order for bracketSize
  const seedingOrder = generateSeedingOrder(bracketSize);

  // Return slots in seeding order
  return seedingOrder.map((seedNum) => {
    const participant = seedToParticipantMap.get(seedNum) || null;
    return {
      seedNumber: seedNum,
      participant,
      isBye: participant === null,
    };
  });
}

/**
 * Pair First-Round slots into matches
 */
export function createFirstRoundPairings(slots: BracketSlot[]): MatchPairing[] {
  const pairings: MatchPairing[] = [];
  const totalMatches = slots.length / 2;

  for (let i = 0; i < totalMatches; i++) {
    const slotA = slots[i * 2];
    const slotB = slots[i * 2 + 1];

    const isByeA = slotA.participant === null;
    const isByeB = slotB.participant === null;

    let isByeMatch = false;
    let byeWinner: Participant | null = null;

    if (isByeA && !isByeB) {
      isByeMatch = true;
      byeWinner = slotB.participant;
    } else if (!isByeA && isByeB) {
      isByeMatch = true;
      byeWinner = slotA.participant;
    }

    pairings.push({
      matchPosition: i + 1,
      slotA,
      slotB,
      isByeMatch,
      byeWinner,
    });
  }

  return pairings;
}
