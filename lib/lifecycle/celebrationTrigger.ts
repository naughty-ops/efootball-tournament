/**
 * Session storage manager for one-time Winner Celebration triggers
 */

export function setPendingCelebration(tournamentId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`celebration_pending_${tournamentId}`, 'true');
  } catch (err) {
    console.error('Failed to set pending celebration:', err);
  }
}

export function checkAndConsumeCelebration(tournamentId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const key = `celebration_pending_${tournamentId}`;
    const isPending = sessionStorage.getItem(key) === 'true';
    if (isPending) {
      sessionStorage.removeItem(key);
      return true;
    }
  } catch (err) {
    console.error('Failed to check celebration key:', err);
  }
  return false;
}
