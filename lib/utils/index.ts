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
  runnerUpRupees: number;
  championPercent: number;
  runnerUpPercent: number;
  formattedTotal: string;
  formattedChampion: string;
  formattedRunnerUp: string;
  hasPrizeMoney: boolean;
}

/**
 * Computes standard competitive prize distribution:
 * 70% Champion / 30% Runner-Up for tournaments with prize pools.
 */
export function calculatePrizeSplit(prizePoolPaise: number = 0): PrizeDistributionSplit {
  const totalPaise = Math.max(0, prizePoolPaise || 0);
  const totalRupees = Math.round(totalPaise / 100);
  const hasPrizeMoney = totalRupees > 0;

  const championPercent = 70;
  const runnerUpPercent = 30;

  const championRupees = hasPrizeMoney ? Math.round(totalRupees * 0.7) : 0;
  const runnerUpRupees = hasPrizeMoney ? totalRupees - championRupees : 0;

  return {
    totalPaise,
    totalRupees,
    championRupees,
    runnerUpRupees,
    championPercent,
    runnerUpPercent,
    formattedTotal: formatRupees(totalRupees),
    formattedChampion: formatRupees(championRupees),
    formattedRunnerUp: formatRupees(runnerUpRupees),
    hasPrizeMoney,
  };
}
