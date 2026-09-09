'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Tv, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getPublicLiveMatches } from '@/services/publicTournamentService';
import { useRealtimeMatches, type RealtimePayload } from '@/hooks/useRealtimeMatches';

type LiveMatchEntry = Awaited<ReturnType<typeof getPublicLiveMatches>>[number];

export default function LivePage() {
  const router = useRouter();
  const [liveMatches, setLiveMatches] = useState<LiveMatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLive = useCallback(async () => {
    try {
      const data = await getPublicLiveMatches();
      setLiveMatches(data);
      setError(null);
    } catch {
      setError('Unable to load live matches. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => { if (!cancelled) await fetchLive(); })();
    return () => { cancelled = true; };
  }, [fetchLive]);

  // Realtime Handler
  const handleRealtimeUpdate = useCallback(
    (payload?: RealtimePayload) => {
      if (payload?.new && payload.new.id) {
        const updatedMatch = payload.new;
        setLiveMatches((prev) => {
          if (updatedMatch.status === 'live') {
            const exists = prev.some((item) => item.match.id === updatedMatch.id);
            if (exists) {
              return prev.map((item) => {
                if (item.match.id === updatedMatch.id) {
                  return {
                    ...item,
                    match: {
                      ...item.match,
                      score_a: updatedMatch.score_a ?? item.match.score_a,
                      score_b: updatedMatch.score_b ?? item.match.score_b,
                      status: updatedMatch.status ?? item.match.status,
                      live_room_name: updatedMatch.live_room_name ?? item.match.live_room_name,
                    },
                  };
                }
                return item;
              });
            }
          } else {
            return prev.filter((item) => item.match.id !== updatedMatch.id);
          }
          return prev;
        });
      }
      fetchLive();
    },
    [fetchLive]
  );

  const { connectionStatus } = useRealtimeMatches(handleRealtimeUpdate);

  return (
    <div className="space-y-4 pb-12 max-w-4xl mx-auto px-2 sm:px-4 font-sans">
      {/* Premium Minimal Page Header */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-[#0B3323] tracking-tight">
            Live Matches
          </h1>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchLive}
          className="gap-1.5 text-xs h-7 border-[#0B3323]/20 bg-white hover:bg-[#F4F8F5] text-[#0B3323] px-2.5 rounded-lg font-bold"
        >
          <RefreshCw className="h-3 w-3 text-[#0B3323]" />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Connection Reconnecting Alert */}
      {connectionStatus === 'reconnecting' && (
        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center justify-between animate-pulse shadow-xs">
          <span>Reconnecting live updates...</span>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
        </div>
      )}

      {/* Content Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="h-28 rounded-2xl bg-white animate-pulse border border-[#0B3323]/10" />
          <div className="h-28 rounded-2xl bg-white animate-pulse border border-[#0B3323]/10" />
        </div>
      ) : error ? (
        <div className="p-6 text-center bg-destructive/10 rounded-2xl border border-destructive/20 space-y-2">
          <p className="text-xs font-bold text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchLive}>Try Again</Button>
        </div>
      ) : liveMatches.length === 0 ? (
        <div className="p-8 text-center border border-[#0B3323]/15 rounded-2xl bg-white shadow-xs space-y-2.5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0B3323]/10 text-[#0B3323]">
            <Tv className="h-6 w-6 text-[#0B3323]" />
          </div>
          <h3 className="text-sm font-black text-[#0B3323]">No matches currently live</h3>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Broadcasting matches appear here as soon as a stream starts.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {liveMatches.map(({ match, round }) => (
            <div
              key={match.id}
              onClick={() => router.push(`/live/${match.id}`)}
              className="bg-white border border-[#0B3323]/15 hover:border-emerald-600/60 shadow-sm hover:shadow-md transition-all duration-200 rounded-2xl p-3.5 cursor-pointer select-none space-y-2.5 touch-target active:scale-[0.99]"
            >
              {/* Header Row: 🔴 LIVE Badge, Match #, Viewer Count */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Badge className="bg-red-600 hover:bg-red-600 text-white font-black text-[9px] uppercase px-2 py-0.5 tracking-wider gap-1 shadow-2xs">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                    </span>
                    LIVE
                  </Badge>

                  <span className="text-[10px] font-extrabold text-muted-foreground uppercase">
                    Match #{match.match_position}
                  </span>
                </div>

                <span className="text-[10px] font-extrabold text-[#0B3323] flex items-center gap-1 bg-[#0B3323]/10 px-2.5 py-0.5 rounded-lg border border-[#0B3323]/15">
                  <Users className="h-3 w-3 text-[#0B3323]" />
                  <span>LIVE</span>
                </span>
              </div>

              {/* Tournament & Round Subtitle */}
              <p className="text-xs font-black text-[#0B3323] truncate leading-tight">
                {match.tournamentName ? `${match.tournamentName} • ` : ''}{round.name}
              </p>

              {/* Premium Green & White Minimal Scoreboard Box */}
              <div className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl bg-[#F4F8F5] border border-[#0B3323]/10">
                <p className="text-xs sm:text-sm font-black text-[#0B3323] truncate flex-1 text-left">
                  {match.participantAName || 'Player 1'}
                </p>

                <div className="flex items-center gap-1.5 px-3 py-0.5 bg-white rounded-lg border border-[#0B3323]/20 shadow-2xs shrink-0 font-mono">
                  <span className="text-base sm:text-lg font-black text-[#0B3323] tabular-nums">
                    {match.score_a ?? 0}
                  </span>
                  <span className="text-xs font-extrabold text-muted-foreground">—</span>
                  <span className="text-base sm:text-lg font-black text-[#0B3323] tabular-nums">
                    {match.score_b ?? 0}
                  </span>
                </div>

                <p className="text-xs sm:text-sm font-black text-[#0B3323] truncate flex-1 text-right">
                  {match.participantBName || 'Player 2'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
