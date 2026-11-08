'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw, Tv, Users, Play, ArrowRight, Swords, Trophy, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPublicLiveMatches } from '@/services/publicTournamentService';
import { useRealtimeMatches, type RealtimePayload } from '@/hooks/useRealtimeMatches';

type LiveMatchEntry = Awaited<ReturnType<typeof getPublicLiveMatches>>[number];

export default function LivePage() {
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

        // If existing live match was patched, skip full fetch!
        if (updatedMatch.status === 'live') {
          return;
        }
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
          <div className="h-48 rounded-[28px] bg-[#1818D4]/60 animate-pulse border border-white/10" />
          <div className="h-48 rounded-[28px] bg-[#1818D4]/60 animate-pulse border border-white/10" />
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-[#1818D4] rounded-[28px] border border-white/20 text-white space-y-3">
          <p className="text-sm font-bold text-[#FF168B]">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchLive} className="rounded-full border-white/30 text-white hover:bg-[#FFFF00] hover:text-[#08088F]">
            Try Again
          </Button>
        </div>
      ) : liveMatches.length === 0 ? (
        <div className="p-8 sm:p-12 text-center border border-white/20 rounded-[32px] bg-[#1818D4] text-white shadow-xl space-y-4 max-w-xl mx-auto">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0A0A7A] border border-white/20 text-[#FFFF00] shadow-md">
            <Tv className="h-8 w-8 text-[#FFFF00]" />
          </div>
          <div>
            <h3 className="text-xl font-black font-display uppercase tracking-wider text-white">
              No Matches Currently Live
            </h3>
            <p className="text-xs text-[#D9DCFF]/80 max-w-md mx-auto mt-1 leading-relaxed">
              When tournament competitors begin their scheduled fixtures, real-time broadcasts and live interactive scoreboards will stream directly here.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button asChild className="bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs rounded-full h-10 px-5 shadow-lg uppercase tracking-wider">
              <Link href="/tournaments">Explore Tournaments</Link>
            </Button>
            <Button asChild variant="outline" className="border-white/20 hover:bg-white/10 text-white font-black text-xs rounded-full h-10 px-5 uppercase tracking-wider">
              <Link href="/dashboard/matches">View My Fixtures</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {liveMatches.map(({ match, round }) => (
            <Link
              key={match.id}
              href={`/live/${match.id}`}
              className="bg-gradient-to-br from-[#1818D4] to-[#1212B8] border border-white/20 hover:border-[#FFFF00] shadow-2xl hover:shadow-[0_0_25px_rgba(255,255,0,0.3)] transition-all duration-300 rounded-[28px] p-5 sm:p-6 cursor-pointer select-none flex flex-col justify-between gap-5 touch-target active:scale-[0.99] text-white group"
            >
              {/* Top Row: Tournament Title + LIVE pulse badge + Match Number */}
              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="bg-[#FF168B] text-white font-black text-[10px] uppercase px-3 py-1 rounded-full tracking-wider shadow-sm flex items-center gap-1.5 shrink-0">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                    </span>
                    LIVE
                  </span>
                  <span className="text-xs font-black text-[#D9DCFF] uppercase tracking-wider truncate">
                    {match.tournamentName || 'eFootball Championship'}
                  </span>
                </div>

                <span className="text-[10px] font-black text-[#FFFF00] uppercase tracking-wider bg-[#0A0A7A] px-2.5 py-1 rounded-full border border-white/15 shrink-0">
                  {round.name || `Match #${match.match_position}`}
                </span>
              </div>

              {/* Center Matchup Area: Competitor A vs Competitor B with Avatars and Big Scoreboard */}
              <div className="grid grid-cols-7 items-center gap-2 py-4 px-3 sm:px-4 rounded-2xl bg-[#0A0A7A]/70 border border-white/15">
                {/* Player A */}
                <div className="col-span-3 flex items-center gap-2.5 min-w-0">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-[#1818D4] border-2 border-[#FFFF00]/70 flex items-center justify-center font-black text-sm sm:text-base text-[#FFFF00] shadow-md shrink-0 font-display">
                    {(match.participantAName || 'P1').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider block">Home</span>
                    <p className="text-xs sm:text-sm font-black text-white truncate font-display">
                      {match.participantAName || 'Player 1'}
                    </p>
                  </div>
                </div>

                {/* Center Live Scoreboard */}
                <div className="col-span-1 text-center shrink-0 flex flex-col items-center justify-center">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1818D4] rounded-2xl border border-white/25 shadow-inner font-mono">
                    <span className="text-xl sm:text-2xl font-black font-display text-[#FFFF00] tabular-nums">
                      {match.score_a ?? 0}
                    </span>
                    <span className="text-sm font-black text-white/40">—</span>
                    <span className="text-xl sm:text-2xl font-black font-display text-[#FFFF00] tabular-nums">
                      {match.score_b ?? 0}
                    </span>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-wider text-[#FF168B] mt-1 animate-pulse">
                    Playing
                  </span>
                </div>

                {/* Player B */}
                <div className="col-span-3 flex items-center justify-end gap-2.5 min-w-0 text-right">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider block">Away</span>
                    <p className="text-xs sm:text-sm font-black text-white truncate font-display">
                      {match.participantBName || 'Player 2'}
                    </p>
                  </div>
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-[#08088F] border-2 border-white/25 flex items-center justify-center font-black text-sm sm:text-base text-white/90 shadow-md shrink-0 font-display">
                    {(match.participantBName || 'P2').charAt(0).toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Card Action Footer: Broadcast Status & "Watch Live Stream" Button */}
              <div className="flex items-center justify-between pt-1 border-t border-white/10 gap-3">
                <div className="flex items-center gap-1.5 text-xs text-[#D9DCFF]/80">
                  <Users className="h-3.5 w-3.5 text-[#FFFF00]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Live Broadcast Stream</span>
                </div>

                <div className="inline-flex items-center gap-1.5 bg-[#FFFF00] group-hover:bg-yellow-300 text-[#08088F] font-black text-xs uppercase tracking-wider rounded-full h-9 px-4 shadow-lg shrink-0 transition-transform group-hover:scale-105">
                  <Play className="h-3 w-3 fill-current text-[#08088F]" />
                  <span>Watch Stream</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
