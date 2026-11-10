import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString?: string | null): string {
  if (!dateString) return 'TBD';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return 'TBD';
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'TBD';
  }
}

/**
 * Formats an amount in INR Rupees using Indian numbering format (e.g. ₹10,000)
 */
export function formatRupees(amountInRupees: number = 0): string {
  const rounded = Math.round(amountInRupees);
  return `₹${rounded.toLocaleString('en-IN')}`;
}

/**
 * Converts a paise integer (100 paise = 1 INR) to formatted Rupees
 */
export function formatPaiseToRupees(paise: number = 0): string {
  const rupees = Math.round((paise || 0) / 100);
  return formatRupees(rupees);
}

export interface PrizeDistributionSplit {
  totalPaise: number;
  totalRupees: number;
  championRupees: number;
  championNotes?: string | null;
  runnerUpRupees: number;
  runnerUpNotes?: string | null;
  thirdPlaceRupees: number;
  thirdPlaceNotes?: string | null;
  hasThirdPlace: boolean;
  championPercent?: number;
  runnerUpPercent?: number;
  formattedTotal: string;
  formattedChampion: string;
  formattedRunnerUp: string;
  formattedThirdPlace?: string;
  hasPrizeMoney: boolean;
}

/**
 * Computes tournament prize distribution:
 * Supports custom admin distribution for 1st place, 2nd place, and optional 3rd place,
 * complete with additional prize notes/perks (e.g. Trophies, Medals, Jersey, In-game currency),
 * falling back gracefully to 70% Champion / 30% Runner-Up when specific allocations are not configured.
 */
export function calculatePrizeSplit(
  tournamentOrPaise: number | {
    prize_pool_paise?: number | null;
    first_place_prize_paise?: number | null;
    first_place_notes?: string | null;
    second_place_prize_paise?: number | null;
    second_place_notes?: string | null;
    third_place_prize_paise?: number | null;
    third_place_notes?: string | null;
    prize_distribution?: Record<string, any> | null;
  } = 0
): PrizeDistributionSplit {
  let totalPaise = 0;
  let firstPaise = 0;
  let secondPaise = 0;
  let thirdPaise = 0;
  let firstNotes: string | null = null;
  let secondNotes: string | null = null;
  let thirdNotes: string | null = null;

  if (typeof tournamentOrPaise === 'number') {
    totalPaise = Math.max(0, tournamentOrPaise || 0);
  } else if (tournamentOrPaise && typeof tournamentOrPaise === 'object') {
    totalPaise = Math.max(0, tournamentOrPaise.prize_pool_paise || 0);
    firstPaise = Math.max(0, tournamentOrPaise.first_place_prize_paise || 0);
    secondPaise = Math.max(0, tournamentOrPaise.second_place_prize_paise || 0);
    thirdPaise = Math.max(0, tournamentOrPaise.third_place_prize_paise || 0);
    firstNotes = tournamentOrPaise.first_place_notes || null;
    secondNotes = tournamentOrPaise.second_place_notes || null;
    thirdNotes = tournamentOrPaise.third_place_notes || null;

    // Check prize_distribution JSONB fallback
    const pd = tournamentOrPaise.prize_distribution;
    if (pd && typeof pd === 'object') {
      if (pd.first?.notes && !firstNotes) firstNotes = pd.first.notes;
      if (pd.second?.notes && !secondNotes) secondNotes = pd.second.notes;
      if (pd.third?.notes && !thirdNotes) thirdNotes = pd.third.notes;
      if (pd.first?.paise && firstPaise === 0) firstPaise = pd.first.paise;
      if (pd.second?.paise && secondPaise === 0) secondPaise = pd.second.paise;
      if (pd.third?.paise && thirdPaise === 0) thirdPaise = pd.third.paise;
    }
  }

  // If explicit place amounts are set, ensure total reflects the allocated amounts
  if (firstPaise > 0 || secondPaise > 0 || thirdPaise > 0) {
    const sumPaise = firstPaise + secondPaise + thirdPaise;
    if (totalPaise === 0 || totalPaise < sumPaise) {
      totalPaise = sumPaise;
    }
  }

  const totalRupees = Math.round(totalPaise / 100);
  const hasPrizeMoney = totalRupees > 0;

  let championRupees = Math.round(firstPaise / 100);
  let runnerUpRupees = Math.round(secondPaise / 100);
  const thirdPlaceRupees = Math.round(thirdPaise / 100);

  // If prize pool exists but custom allocations weren't set, default to 70% / 30%
  if (hasPrizeMoney && championRupees === 0 && runnerUpRupees === 0 && thirdPlaceRupees === 0) {
    championRupees = Math.round(totalRupees * 0.7);
    runnerUpRupees = totalRupees - championRupees;
  }

  const hasThirdPlace = thirdPlaceRupees > 0 || Boolean(thirdNotes && thirdNotes.trim());

  return {
    totalPaise,
    totalRupees,
    championRupees,
    championNotes: firstNotes,
    runnerUpRupees,
    runnerUpNotes: secondNotes,
    thirdPlaceRupees,
    thirdPlaceNotes: thirdNotes,
    hasThirdPlace,
    championPercent: totalRupees > 0 ? Math.round((championRupees / totalRupees) * 100) : 70,
    runnerUpPercent: totalRupees > 0 ? Math.round((runnerUpRupees / totalRupees) * 100) : 30,
    formattedTotal: formatRupees(totalRupees),
    formattedChampion: formatRupees(championRupees),
    formattedRunnerUp: formatRupees(runnerUpRupees),
    formattedThirdPlace: hasThirdPlace ? formatRupees(thirdPlaceRupees) : undefined,
    hasPrizeMoney,
  };
}
