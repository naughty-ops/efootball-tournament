'use client';

import React from 'react';

export interface WinnerCelebrationOverlayProps {
  isOpen?: boolean;
  onClose?: () => void;
  tournamentName?: string;
  championName?: string;
  runnerUpName?: string | null;
  finalScore?: string | null;
  onViewBracket?: () => void;
}

/**
 * Disabled: Winner celebrations have been removed platform-wide.
 * Official champions and runner-ups are presented cleanly via in-page podium banners.
 */
export function WinnerCelebrationOverlay(_props: WinnerCelebrationOverlayProps) {
  return null;
}

export default WinnerCelebrationOverlay;
