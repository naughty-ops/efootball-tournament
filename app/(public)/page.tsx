'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Trophy, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ImageCarousel from '@/components/public/ImageCarousel';
import { getPublicTournaments, getPublicLiveMatches, type LiveMatchEntry } from '@/services/publicTournamentService';
import type { TournamentWithStats } from '@/services/tournamentService';
import { formatDate } from '@/lib/utils';
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches';

import { TournamentCard } from '@/components/tournament/TournamentCard';

function TournamentMiniCard({ t }: { t: TournamentWithStats }) {
  const isLive = t.status === 'ongoing';
  const isCompleted = t.status === 'completed';

  return (
    <Link
      href={`/tournaments/${t.id}`}
      className={`group flex items-center gap-3 rounded-xl border p-3.5 hover:shadow-md transition-all ${
        isCompleted
          ? 'border-emerald-200 bg-gradient-to-r from-white via-emerald-50/20 to-amber-50/20'
          : 'border-border bg-white hover:border-primary/40'
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
        <Trophy className={`h-4.5 w-4.5 ${isCompleted ? 'text-amber-500' : ''}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[#0B3323] truncate group-hover:text-primary transition-colors">
          {t.name}
        </p>
        <p className="text-[11px] text-muted-foreground font-semibold truncate">
          {isCompleted && t.championUser ? (
            <span className="text-amber-800 font-bold">🏆 Winner: {t.championUser.username}</span>
          ) : (
            `${t.participant_count}/${t.max_participants} players${t.start_date ? ` · ${formatDate(t.start_date)}` : ''}`
          )}
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
      ) : isCompleted ? (
        <Badge className="bg-emerald-600 text-white text-[10px] font-bold shrink-0">WINNER</Badge>
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      )}
    </Link>
  );
}

function CardSkeleton() {
  return (
    <div className="h-16 w-full rounded-xl bg-slate-100 animate-pulse border border-border/40" />
  );
}

export default function HomePage() {
  const [liveMatches, setLiveMatches] = useState<LiveMatchEntry[]>([]);
  const [activeT, setActiveT] = useState<TournamentWithStats[]>([]);
  const [upcomingT, setUpcomingT] = useState<TournamentWithStats[]>([]);
  const [completedT, setCompletedT] = useState<TournamentWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async (bypassCache = false) => {
    try {
      // Parallelized single-batch fetch for maximum speed
      const [live, allTournaments] = await Promise.all([
        getPublicLiveMatches(undefined, bypassCache),
        getPublicTournaments({ bypassCache }),
      ]);
      setLiveMatches(live);
      setActiveT(allTournaments.filter((t) => t.status === 'ongoing'));
      setUpcomingT(allTournaments.filter((t) => t.status === 'registration'));
      setCompletedT(allTournaments.filter((t) => t.status === 'completed').slice(0, 5));
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

  useRealtimeMatches(() => fetchAll(true));

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
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
              <div className="space-y-2">
                <CardSkeleton />
                <CardSkeleton />
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
              <div className="space-y-2">
                <CardSkeleton />
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
    </div>
  );
}
