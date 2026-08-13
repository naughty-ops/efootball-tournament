'use client';

import React, { useState } from 'react';
import type { BracketOverview, FullMatchData } from '@/services/bracketService';
import SymmetricalKnockoutBracket from '@/components/tournament/SymmetricalKnockoutBracket';
import { WinnerCelebrationOverlay } from '@/components/tournament/WinnerCelebrationOverlay';

interface PublicBracketTabProps {
  bracket: BracketOverview | null;
}

export default function PublicBracketTab({ bracket }: PublicBracketTabProps) {
  const [showCelebration, setShowCelebration] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<FullMatchData | null>(null);

  return (
    <div className="space-y-6">
      <SymmetricalKnockoutBracket
        bracket={bracket}
        isAdmin={false}
        onMatchClick={(m) => setSelectedMatch(m)}
        onReopenCelebration={() => setShowCelebration(true)}
      />

      {/* Winner Celebration Overlay on Trigger */}
      {showCelebration && bracket?.tournament && (
        <WinnerCelebrationOverlay
          isOpen={showCelebration}
          onClose={() => setShowCelebration(false)}
          tournamentName={bracket.tournament.name}
          championName={bracket.tournament.championUser?.username || 'Champion'}
          runnerUpName={bracket.tournament.runnerUpUser?.username}
        />
      )}
    </div>
  );
}
