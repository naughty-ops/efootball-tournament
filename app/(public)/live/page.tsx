'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Tv, Users } from 'lucide-react';
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
    <div className="space-y-6 pb-12 max-w-4xl mx-auto px-2 sm:px-4 font-sans">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF168B] opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#FF168B]" />
          </span>
          <h1 className="text-2xl sm:text-3xl font-black font-display uppercase tracking-wider text-white">
            Live Matches
          </h1>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchLive}
          className="gap-1.5 text-xs h-8 border-white/20 bg-[#1010C5] hover:bg-white/10 text-white px-3.5 rounded-full font-black uppercase tracking-wider"
        >
          <RefreshCw className="h-3.5 w-3.5 text-[#FFFF00]" />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Connection Reconnecting Alert */}
      {connectionStatus === 'reconnecting' && (
        <div className="p-3 rounded-2xl bg-[#0A0A7A] border border-[#FFFF00]/40 text-[#FFFF00] text-xs font-bold flex items-center justify-between animate-pulse shadow-md">
          <span>Reconnecting live updates...</span>
          <Loader2 className="h-4 w-4 animate-spin text-[#FFFF00]" />
        </div>
      )}

      {/* Content Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-32 rounded-[28px] bg-[#1818D4]/60 animate-pulse border border-white/10" />
          <div className="h-32 rounded-[28px] bg-[#1818D4]/60 animate-pulse border border-white/10" />
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-[#1818D4] rounded-[28px] border border-white/20 text-white space-y-3">
          <p className="text-sm font-bold text-[#FF168B]">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchLive} className="rounded-full border-white/30 text-white hover:bg-[#FFFF00] hover:text-[#08088F]">
            Try Again
          </Button>
        </div>
      ) : liveMatches.length === 0 ? (
        <div className="p-12 text-center border border-white/20 rounded-[28px] bg-[#1818D4] text-white shadow-xl space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3434FF] text-[#FFFF00] shadow-md">
            <Tv className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-black font-display uppercase tracking-wide text-white">No matches currently live</h3>
          <p className="text-xs text-[#D9DCFF]/80 max-w-sm mx-auto font-medium">
            Active broadcasts will stream here in real time as soon as a match begins.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {liveMatches.map(({ match, round }) => (
            <div
              key={match.id}
              onClick={() => router.push(`/live/${match.id}`)}
              className="bg-[#1818D4] border border-white/20 hover:border-[#FFFF00] shadow-xl hover:shadow-[0_0_20px_rgba(52,52,255,0.4)] transition-all duration-200 rounded-[28px] p-4 sm:p-5 cursor-pointer select-none space-y-3 touch-target active:scale-[0.99] text-white"
            >
              {/* Header Row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="bg-[#FF168B] text-white font-black text-[9px] uppercase px-2.5 py-0.5 rounded-full tracking-wider gap-1 shadow-sm flex items-center">
                    <span className="relative flex h-1.5 w-1.5 mr-1">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                    </span>
                    LIVE
                  </span>

                  <span className="text-[10px] font-black text-[#D9DCFF]/80 uppercase">
                    Match #{match.match_position}
                  </span>
                </div>

                <span className="text-[10px] font-black text-[#FFFF00] flex items-center gap-1 bg-[#0A0A7A] px-2.5 py-0.5 rounded-full border border-white/10">
                  <Users className="h-3 w-3 text-[#FFFF00]" />
                  <span>BROADCAST</span>
                </span>
              </div>

              {/* Tournament & Round Subtitle */}
              <p className="text-xs font-black font-display text-white truncate leading-tight uppercase tracking-wider">
                {match.tournamentName ? `${match.tournamentName} • ` : ''}{round.name}
              </p>

              {/* Scoreboard Box */}
              <div className="flex items-center justify-between gap-2 py-2.5 px-3 rounded-2xl bg-[#0A0A7A] border border-white/15">
                <p className="text-xs sm:text-sm font-bold text-white truncate flex-1 text-left">
                  {match.participantAName || 'Player 1'}
                </p>

                <div className="flex items-center gap-1.5 px-3 py-1 bg-[#1818D4] rounded-xl border border-white/20 shadow-sm shrink-0 font-mono">
                  <span className="text-base sm:text-lg font-black font-display text-[#FFFF00] tabular-nums">
                    {match.score_a ?? 0}
                  </span>
                  <span className="text-xs font-bold text-white/40">—</span>
                  <span className="text-base sm:text-lg font-black font-display text-[#FFFF00] tabular-nums">
                    {match.score_b ?? 0}
                  </span>
                </div>

                <p className="text-xs sm:text-sm font-bold text-white truncate flex-1 text-right">
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
