'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Trophy, Award, Zap, ChevronRight, Loader2 } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ImageCarousel from '@/components/public/ImageCarousel';
import { getPublicTournaments, getPublicLiveMatches } from '@/services/publicTournamentService';
import type { TournamentWithStats } from '@/services/tournamentService';
import { formatDate } from '@/lib/utils';
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches';

type LiveEntry = Awaited<ReturnType<typeof getPublicLiveMatches>>[number];

function TournamentMiniCard({ t }: { t: TournamentWithStats }) {
  const isLive = t.status === 'ongoing';
  return (
    <Link
      href={`/tournaments/${t.id}`}
      className="group flex items-center gap-3 rounded-xl border border-border bg-white p-3.5 hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
        <Trophy className="h-4.5 w-4.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[#0B3323] truncate group-hover:text-primary transition-colors">
          {t.name}
        </p>
        <p className="text-[11px] text-muted-foreground font-semibold">
          {t.participant_count}/{t.max_participants} players
          {t.start_date ? ` · ${formatDate(t.start_date)}` : ''}
        </p>
      </div>
      {isLive ? (
        <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white border-0 text-[10px] font-bold shrink-0 gap-1">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
          </span>
          LIVE
        </Badge>
      ) : t.status === 'completed' ? (
        <Badge variant="outline" className="text-[10px] font-bold text-muted-foreground shrink-0">DONE</Badge>
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      )}
    </Link>
  );
}

export default function HomePage() {
  const [liveMatches, setLiveMatches] = useState<LiveEntry[]>([]);
  const [activeT, setActiveT] = useState<TournamentWithStats[]>([]);
  const [upcomingT, setUpcomingT] = useState<TournamentWithStats[]>([]);
  const [completedT, setCompletedT] = useState<TournamentWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [live, active, upcoming, completed] = await Promise.all([
        getPublicLiveMatches(),
        getPublicTournaments({ status: 'ongoing' }),
        getPublicTournaments({ status: 'registration' }),
        getPublicTournaments({ status: 'completed' }),
      ]);
      setLiveMatches(live);
      setActiveT(active);
      setUpcomingT(upcoming);
      setCompletedT(completed.slice(0, 5));
    } catch {
      // Silent fail on home page
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await fetchAll();
    })();
    return () => { cancelled = true; };
  }, [fetchAll]);
  useRealtimeMatches(fetchAll);

  return (
    <div className="space-y-12 pb-12 w-full overflow-hidden">
      {/* 1. Hero Banner */}
      <ImageCarousel />

      {/* 2. Live Now Section */}
      {(loading || liveMatches.length > 0) && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <h2 className="text-xl font-extrabold text-[#0B3323]">Live Now</h2>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs gap-1 text-primary font-bold">
              <Link href="/live">
                View All Live
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Loading live matches...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveMatches.slice(0, 3).map(({ match, round }) => (
                <Link
                  key={match.id}
                  href={`/tournaments/${round.tournamentId}`}
                  className="group rounded-xl border border-red-200 bg-red-50/60 p-4 hover:border-red-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <Badge className="bg-red-500 hover:bg-red-500 text-white border-0 gap-1 text-[10px] font-bold">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                      </span>
                      LIVE
                    </Badge>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">{round.name}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-[#0B3323] truncate flex-1">{match.participantAName ?? 'TBD'}</span>
                    <span className="text-lg font-black text-red-600 tabular-nums shrink-0">
                      {match.score_a ?? 0} — {match.score_b ?? 0}
                    </span>
                    <span className="text-sm font-bold text-[#0B3323] truncate flex-1 text-right">{match.participantBName ?? 'TBD'}</span>
                  </div>
                  {match.tournamentName && (
                    <p className="text-[11px] text-primary/60 font-semibold mt-2 truncate">{match.tournamentName}</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 3. Tournament Discovery */}
      <section className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Active Tournaments */}
          <div className="sm:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-[#0B3323]">Active Tournaments</h2>
              <Button asChild variant="ghost" size="sm" className="text-xs text-primary font-bold gap-1">
                <Link href="/tournaments?status=ongoing">
                  All <ChevronRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Loading...</span>
              </div>
            ) : activeT.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-white p-6 text-center">
                <p className="text-xs text-muted-foreground">No active tournaments right now.</p>
                <Button asChild variant="ghost" size="sm" className="text-xs text-primary mt-2">
                  <Link href="/tournaments">View All Tournaments</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {activeT.slice(0, 5).map((t) => <TournamentMiniCard key={t.id} t={t} />)}
              </div>
            )}
          </div>

          {/* Upcoming column */}
          <div className="space-y-3">
            <h2 className="text-lg font-extrabold text-[#0B3323]">Upcoming</h2>
            {loading ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Loading...</span>
              </div>
            ) : upcomingT.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-white p-6 text-center">
                <p className="text-xs text-muted-foreground">No upcoming tournaments.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingT.slice(0, 4).map((t) => <TournamentMiniCard key={t.id} t={t} />)}
              </div>
            )}
          </div>
        </div>

        {/* Recently Completed */}
        {completedT.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-[#0B3323]">Recently Completed</h2>
              <Button asChild variant="ghost" size="sm" className="text-xs text-primary font-bold gap-1">
                <Link href="/tournaments?status=completed">
                  All <ChevronRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {completedT.map((t) => <TournamentMiniCard key={t.id} t={t} />)}
            </div>
          </div>
        )}
      </section>

      {/* 4. Platform Highlights */}
      <section className="space-y-6 pt-2">
        <div className="flex flex-col space-y-1">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0B3323]">
            Platform Features
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Explore live updates, interactive tournament brackets, and standings.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
          <Card className="hover:border-primary/50 transition-all">
            <CardHeader className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                <Trophy className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">Championship Brackets</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Interactive knockout and group stage tournament brackets updated in real time.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="hover:border-primary/50 transition-all">
            <CardHeader className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                <Zap className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">Live Scores</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Real-time live match scores and results powered by Supabase Realtime.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="hover:border-primary/50 transition-all">
            <CardHeader className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                <Award className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">Real-Time Standings</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Comprehensive group tables, points, goal differentials, and global player rankings.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>
    </div>
  );
}
