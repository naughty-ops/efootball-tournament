'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Zap, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getPublicLiveMatches } from '@/services/publicTournamentService';
import { useRealtimeMatches, type RealtimePayload } from '@/hooks/useRealtimeMatches';

type LiveMatchEntry = Awaited<ReturnType<typeof getPublicLiveMatches>>[number];

export default function LivePage() {
  const [liveMatches, setLiveMatches] = useState<LiveMatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchLive = useCallback(async () => {
    try {
      const data = await getPublicLiveMatches();
      setLiveMatches(data);
      setLastUpdated(new Date());
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

  // Realtime Handler — Updates React State INSTANTLY upon receiving database payload
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
                    },
                  };
                }
                return item;
              });
            }
          } else {
            // Remove completed or non-live match from Live page list
            return prev.filter((item) => item.match.id !== updatedMatch.id);
          }
          return prev;
        });
        setLastUpdated(new Date());
      }
      // Re-fetch in background for full relation consistency
      fetchLive();
    },
    [fetchLive]
  );

  // Realtime subscription
  const { connectionStatus } = useRealtimeMatches(handleRealtimeUpdate);

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B3323] tracking-tight">
              Live Matches
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Real-time scores and match updates.
            {lastUpdated && (
              <span className="ml-2 text-[11px] text-muted-foreground/70">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchLive}
          className="self-start sm:self-auto gap-2 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Connection Reconnecting / Interrupted Banner */}
      {connectionStatus === 'reconnecting' && (
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center justify-between animate-pulse">
          <span>Live connection interrupted. Reconnecting...</span>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          <div className="h-44 rounded-2xl bg-slate-100 animate-pulse border border-border/40" />
          <div className="h-44 rounded-2xl bg-slate-100 animate-pulse border border-border/40" />
          <div className="h-44 rounded-2xl bg-slate-100 animate-pulse border border-border/40" />
        </div>
      ) : error ? (
        <Card className="p-12 text-center border-destructive/30 bg-destructive/5">
          <p className="text-sm font-medium text-destructive mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchLive}>Try Again</Button>
        </Card>
      ) : liveMatches.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary mb-3">
            <Zap className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold text-[#0B3323]">No matches are currently live</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Check back when a tournament match is in progress.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/tournaments">Browse Tournaments</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {liveMatches.map(({ match, round }) => (
            <Card
              key={match.id}
              className="border-red-200 bg-white shadow-sm hover:border-red-300 transition-all"
            >
              <CardContent className="p-5 space-y-4">
                {/* Live Badge + Round */}
                <div className="flex items-center justify-between">
                  <Badge className="bg-red-500 hover:bg-red-500 text-white border-0 gap-1.5 text-[11px] font-bold uppercase">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                    </span>
                    LIVE
                  </Badge>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    {round.name}
                  </span>
                </div>

                {/* Tournament name */}
                {match.tournamentName && (
                  <p className="text-[11px] font-bold text-primary/70 uppercase tracking-wider truncate">
                    {match.tournamentName}
                  </p>
                )}

                {/* Scoreboard */}
                <div className="flex items-center justify-between gap-3 py-3 px-4 rounded-2xl bg-[#F4F8F5]">
                  <div className="flex-1 text-center">
                    <p className="text-xs font-bold text-[#0B3323] truncate leading-tight mb-1">
                      {match.participantAName ?? 'TBD'}
                    </p>
                    <p className="text-3xl font-black text-[#0B3323] tabular-nums">{match.score_a ?? 0}</p>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <span className="text-base font-black text-muted-foreground/60">—</span>
                  </div>
                  <div className="flex-1 text-center">
                    <p className="text-xs font-bold text-[#0B3323] truncate leading-tight mb-1">
                      {match.participantBName ?? 'TBD'}
                    </p>
                    <p className="text-3xl font-black text-[#0B3323] tabular-nums">{match.score_b ?? 0}</p>
                  </div>
                </div>

                {/* Link to tournament */}
                <Link
                  href={`/tournaments/${round.tournamentId}`}
                  className="block text-center text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  View Tournament →
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
