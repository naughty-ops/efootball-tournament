'use client';

import React, { useCallback } from 'react';
import Link from 'next/link';
import { ChevronRight, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LiveMatchEntry } from '@/services/publicTournamentService';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { useLiveMatchesQuery } from '@/hooks/queries/useLiveMatchesQuery';
import { useRealtimeMatches, type RealtimePayload } from '@/hooks/useRealtimeMatches';
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
  const queryClient = useQueryClient();

  // Shared TanStack Query cache with PublicNav and /live page
  const { data: liveMatches = initialLiveMatches, refetch } = useLiveMatchesQuery({
    initialData: initialLiveMatches,
  });

  // Patch live scores immediately in shared query cache
  const handleRealtimeUpdate = useCallback(
    (payload?: RealtimePayload) => {
      if (payload?.table === 'matches' && payload?.eventType === 'UPDATE' && payload.new) {
        const updated = payload.new;
        let found = false;

        queryClient.setQueryData<LiveMatchEntry[]>(queryKeys.matches.live(), (old = []) => {
          return old.map((entry) => {
            if (entry.match.id === updated.id) {
              found = true;
              return {
                ...entry,
                match: {
                  ...entry.match,
                  score_a: updated.score_a ?? entry.match.score_a,
                  score_b: updated.score_b ?? entry.match.score_b,
                  status: updated.status ?? entry.match.status,
                },
              };
            }
            return entry;
          });
        });

        if (found && updated.status === 'live') {
          return;
        }
      }
      refetch();
    },
    [queryClient, refetch]
  );

  useRealtimeMatches(handleRealtimeUpdate);

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
        <Button asChild variant="ghost" size="sm" className="text-xs font-black text-[#FFFF00] hover:text-white gap-1 rounded-full cursor-pointer">
          <Link href={(liveData.view_all_url as string) || '/live'} prefetch={true}>
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
            prefetch={true}
            className="group relative flex flex-col justify-between gap-3.5 rounded-3xl border border-white/20 bg-gradient-to-br from-[#1F1FF0] to-[#1212B8] p-4 sm:p-5 hover:border-[#FFFF00] transition-all shadow-xl active:scale-[0.99] cursor-pointer"
          >
            {/* Header: Tournament Title + Round Pill */}
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
              <span className="text-[11px] font-black uppercase tracking-wider text-[#D9DCFF] truncate">
                {match.tournamentName || 'eFootball Cup'}
              </span>
              <Badge variant="live" className="text-[9px] py-0 px-2 shrink-0">
                LIVE
              </Badge>
            </div>

            {/* Scoreboard: Player A vs Player B */}
            <div className="flex items-center justify-between gap-2 py-1">
              <div className="flex-1 min-w-0">
                <p className="text-sm sm:text-base font-black text-white truncate font-display group-hover:text-[#FFFF00] transition-colors">
                  {match.participantAName || 'Competitor A'}
                </p>
                <span className="text-[10px] text-[#D9DCFF]/70 font-semibold block uppercase">
                  Home
                </span>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1 bg-[#08088F] rounded-xl border border-white/20 text-[#FFFF00] font-mono font-black text-lg sm:text-xl shadow-inner shrink-0">
                <span>{match.score_a ?? 0}</span>
                <span className="text-white/40 text-xs">-</span>
                <span>{match.score_b ?? 0}</span>
              </div>

              <div className="flex-1 min-w-0 text-right">
                <p className="text-sm sm:text-base font-black text-white truncate font-display group-hover:text-[#FFFF00] transition-colors">
                  {match.participantBName || 'Competitor B'}
                </p>
                <span className="text-[10px] text-[#D9DCFF]/70 font-semibold block uppercase">
                  Away
                </span>
              </div>
            </div>

            {/* Footer Action */}
            <div className="flex items-center justify-between border-t border-white/10 pt-2 text-xs font-bold text-[#FFFF00]">
              <span className="text-[10px] text-[#D9DCFF]/80 uppercase tracking-wider">
                {round.name || 'Knockout Stage'}
              </span>
              <span className="flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                Watch Stream
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
