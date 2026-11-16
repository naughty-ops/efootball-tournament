'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Swords, Flame, Trophy, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import PlayerMatchesClient from '@/app/dashboard/matches/PlayerMatchesClient';
import OneVsOneArenaView from '@/components/one-vs-one/OneVsOneArenaView';
import { useMemberPresence } from '@/hooks/useMemberPresence';
import type { PlayerMatchItem } from '@/services/playerDashboardService';
import type {
  OneVsOneCard,
  OneVsOneMatchDetail,
  OneVsOneArenaStats,
  AvailableWaitingMatch,
  ArenaLeaderboardEntry,
} from '@/types/oneVsOne';

interface CompetitionMatchesHubProps {
  initialMatches: PlayerMatchItem[];
  userDisplayName: string;
  initialError?: string | null;
  // 1v1 Arena Props
  cards: OneVsOneCard[];
  active1v1Match: OneVsOneMatchDetail | null;
  history1v1Matches: OneVsOneMatchDetail[];
  arenaStats: OneVsOneArenaStats;
  isEligible: boolean;
  currentUserId: string;
  availableBalanceInr: number;
  initialMode?: 'tournaments' | '1v1';
  initialAvailableMatches?: AvailableWaitingMatch[];
  initialLeaderboard?: ArenaLeaderboardEntry[];
}

export default function CompetitionMatchesHub({
  initialMatches,
  userDisplayName,
  initialError,
  cards,
  active1v1Match,
  history1v1Matches,
  arenaStats,
  isEligible,
  currentUserId,
  availableBalanceInr,
  initialMode = 'tournaments',
  initialAvailableMatches = [],
  initialLeaderboard = [],
}: CompetitionMatchesHubProps) {
  const searchParams = useSearchParams();
  const [activeMode, setActiveMode] = useState<'tournaments' | '1v1'>(() => {
    const modeParam = searchParams?.get('mode');
    if (modeParam === '1v1') return '1v1';
    if (active1v1Match) return '1v1';
    return initialMode;
  });

  useEffect(() => {
    const modeParam = searchParams?.get('mode');
    if (modeParam === '1v1') {
      setActiveMode('1v1');
    } else if (active1v1Match) {
      setActiveMode('1v1');
    } else if (initialMode) {
      setActiveMode(initialMode);
    }
  }, [searchParams, active1v1Match, initialMode]);

  // Real-time member presence tracking in Competition Center
  useMemberPresence({
    userId: currentUserId,
    activity: active1v1Match
      ? active1v1Match.status === 'waiting'
        ? `1v1 Matchmaking (${active1v1Match.match_code})`
        : `Playing 1v1 (${active1v1Match.match_code})`
      : activeMode === 'tournaments'
      ? 'Viewing Tournaments'
      : 'In 1v1 Arena Lobby',
  });

  return (
    <div className="space-y-6 sm:space-y-8 min-w-0 max-w-full">
      {/* Competition Mode Segmented Selector */}
      <div className="flex items-center gap-2 p-1.5 bg-[#07074A] border border-white/15 rounded-2xl w-fit max-w-full overflow-x-auto no-scrollbar shadow-inner">
        <button
          onClick={() => setActiveMode('tournaments')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 cursor-pointer shrink-0',
            activeMode === 'tournaments'
              ? 'bg-[#00E676] text-[#08088F] shadow-md shadow-[#00E676]/20'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          )}
        >
          <Trophy className="h-4 w-4" />
          <span>Tournament Fixtures</span>
          {initialMatches.length > 0 && (
            <span
              className={cn(
                'ml-1 px-1.5 py-0.5 text-[10px] rounded-full font-black leading-none',
                activeMode === 'tournaments'
                  ? 'bg-[#08088F] text-[#00E676]'
                  : 'bg-white/10 text-white/70'
              )}
            >
              {initialMatches.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveMode('1v1')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 cursor-pointer shrink-0',
            activeMode === '1v1'
              ? 'bg-[#FFFF00] text-[#08088F] shadow-md shadow-yellow-500/25'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          )}
        >
          <Flame className={cn('h-4 w-4', activeMode === '1v1' ? 'text-[#FF168B]' : 'text-[#FF168B]/80')} />
          <span>1 VS 1 Challenge Arena</span>
          <span
            className={cn(
              'ml-1 px-2 py-0.5 text-[10px] rounded-full font-black leading-none border',
              activeMode === '1v1'
                ? 'bg-[#FF168B] text-white border-[#FF168B]'
                : 'bg-[#FF168B]/20 text-[#FF168B] border-[#FF168B]/40'
            )}
          >
            Live
          </span>
        </button>
      </div>

      {/* Mode View */}
      {activeMode === 'tournaments' ? (
        <PlayerMatchesClient
          initialMatches={initialMatches}
          userDisplayName={userDisplayName}
          initialError={initialError}
        />
      ) : (
        <OneVsOneArenaView
          cards={cards}
          initialActiveMatch={active1v1Match}
          historyMatches={history1v1Matches}
          stats={arenaStats}
          isEligible={isEligible}
          currentUserId={currentUserId}
          userAvailableBalanceInr={availableBalanceInr}
          userDisplayName={userDisplayName}
          initialAvailableMatches={initialAvailableMatches}
          initialLeaderboard={initialLeaderboard}
        />
      )}
    </div>
  );
}
