'use client';

import React from 'react';
import { Users, Loader2 } from 'lucide-react';
import { useLiveMatchViewers } from '@/hooks/useLiveMatchViewers';

interface LiveMatchViewerBadgeProps {
  matchId?: string;
  count?: number;
  size?: 'sm' | 'md' | 'lg';
  showLiveDot?: boolean;
  className?: string;
}

export default function LiveMatchViewerBadge({
  matchId,
  count: externalCount,
  size = 'md',
  showLiveDot = true,
  className = '',
}: LiveMatchViewerBadgeProps) {
  // If matchId is provided and no externalCount is passed, subscribe live
  const liveResult = useLiveMatchViewers(matchId || '');

  const displayCount =
    typeof externalCount === 'number'
      ? externalCount
      : matchId
      ? liveResult.viewerCount
      : 0;

  const isReconnecting = matchId ? liveResult.status === 'reconnecting' : false;
  const isLoading = matchId ? liveResult.isInitialLoading && displayCount === 0 : false;

  const sizeStyles = {
    sm: 'text-[10px] px-2.5 py-0.5 gap-1.5',
    md: 'text-xs px-3 py-1 gap-2',
    lg: 'text-sm px-4 py-1.5 gap-2.5',
  };

  const dotSizes = {
    sm: 'h-1.5 w-1.5',
    md: 'h-2 w-2',
    lg: 'h-2.5 w-2.5',
  };

  return (
    <div
      className={`inline-flex items-center rounded-full font-black uppercase tracking-wider bg-[#08085C] border border-[#1E1EF5]/40 text-white shadow-md transition-all select-none tabular-nums ${
        sizeStyles[size]
      } ${className}`}
      title={isReconnecting ? 'Reconnecting viewer presence...' : `${displayCount} unique viewers watching`}
    >
      {/* Live Pulsing Dot */}
      {showLiveDot && (
        <span className={`relative flex ${dotSizes[size]} shrink-0`}>
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF168B] opacity-75" />
          <span className="relative inline-flex rounded-full h-full w-full bg-[#FF168B]" />
        </span>
      )}

      {/* Primary Badge Content: LIVE ● 24 WATCHING */}
      <span className="text-[#FF168B] font-black tracking-widest">LIVE</span>
      <span className="text-white/40 text-[10px]">•</span>

      {isLoading ? (
        <span className="flex items-center gap-1 text-[#FFFF00]/70">
          <Loader2 className="h-3 w-3 animate-spin text-[#FFFF00]" />
          <span className="text-[10px]">SYNCING</span>
        </span>
      ) : isReconnecting ? (
        <span className="flex items-center gap-1 text-amber-300 animate-pulse">
          <span className="font-mono text-[#FFFF00]">{displayCount}</span>
          <span className="text-[9px] text-amber-300">RECONNECTING</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <span className="font-mono font-black text-[#FFFF00] min-w-[12px] text-center">
            {displayCount}
          </span>
          <span className="text-white/90 text-[10px] sm:text-[11px] font-bold tracking-wider">
            {displayCount === 1 ? 'WATCHING' : 'WATCHING'}
          </span>
        </span>
      )}
    </div>
  );
}
