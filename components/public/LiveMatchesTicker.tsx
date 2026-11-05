'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronRight, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LiveMatchEntry } from '@/services/publicTournamentService';
import { getPublicLiveMatches } from '@/services/publicTournamentService';
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches';
import { cn } from '@/lib/utils';
import type { HomepageSection } from '@/types/database';

interface LiveMatchesTickerProps {
  initialLiveMatches: LiveMatchEntry[];
  liveSec?: HomepageSection;
  visibilityClass?: string;
}

export default function LiveMatchesTicker({
  initialLiveMatches,
  liveSec,
  visibilityClass,
}: LiveMatchesTickerProps) {
  const [liveMatches, setLiveMatches] = useState<LiveMatchEntry[]>(initialLiveMatches);

  const refreshLiveMatches = async () => {
    try {
      const data = await getPublicLiveMatches(undefined, true);
      setLiveMatches(data);
    } catch {
      // Non-fatal fallback
    }
  };

  // Only subscribe to realtime updates if there are live matches or actively viewing
  useRealtimeMatches(refreshLiveMatches);

  const liveData = liveSec?.published_content || {};
  const maxLiveDisplay = (liveData.max_display_count as number) || 3;

  if (liveMatches.length === 0) {
    return null;
  }

  return (
    <section className={cn('space-y-5', visibilityClass)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF168B] opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#FF168B]" />
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-white uppercase font-display tracking-tight">
            {(liveData.title as string) || 'Live Broadcasts'}
          </h2>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-xs font-black text-[#FFFF00] hover:text-white gap-1 rounded-full">
          <Link href={(liveData.view_all_url as string) || '/live'}>
            {(liveData.view_all_label as string) || 'View All Live'}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {liveMatches.slice(0, maxLiveDisplay).map(({ match, round }) => (
          <Link
            key={match.id}
            href={`/live/${match.id}`}
            className="group rounded-3xl border border-white/20 bg-[#1D1DE0] p-5 hover:border-[#FFFF00] hover:bg-[#2525F0] transition-all shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <Badge variant="live" className="text-[10px] py-0.5 px-2.5">
                LIVE STREAM
              </Badge>
              <span className="text-[11px] font-black text-[#D9DCFF] uppercase tracking-wider">
                {round.name}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 bg-[#0E0EB5] p-3.5 rounded-2xl border border-white/10">
              <span className="text-sm font-black text-white truncate flex-1 font-display">
                {match.participantAName ?? 'TBD'}
              </span>
              <span className="text-xl font-black text-[#FFFF00] tabular-nums shrink-0 font-display">
                {match.score_a ?? 0} — {match.score_b ?? 0}
              </span>
              <span className="text-sm font-black text-white truncate flex-1 text-right font-display">
                {match.participantBName ?? 'TBD'}
              </span>
            </div>

            {match.tournamentName && (
              <div className="flex items-center justify-between text-xs text-[#D9DCFF]">
                <span className="truncate">{match.tournamentName}</span>
                <span className="text-[#FFFF00] font-black text-[11px] group-hover:translate-x-1 transition-transform flex items-center gap-1">
                  Watch <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
