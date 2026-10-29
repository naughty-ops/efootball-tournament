'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Trophy,
  ChevronRight,
  Play,
  Flame,
  Calendar,
  Users,
  Bell,
  Radio,
  ArrowRight,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getPublicTournaments,
  getPublicLiveMatches,
  type LiveMatchEntry,
} from '@/services/publicTournamentService';
import type { TournamentWithStats } from '@/services/tournamentService';
import { formatDate } from '@/lib/utils';
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches';

function TournamentMiniCard({ t }: { t: TournamentWithStats }) {
  const isLive = t.status === 'ongoing';
  const isCompleted = t.status === 'completed';

  return (
    <Link
      href={`/tournaments/${t.id}`}
      className="group relative flex items-center justify-between gap-4 rounded-3xl border border-white/15 bg-[#1F1FF0] p-4 sm:p-5 hover:border-[#FFFF00] hover:bg-[#2828FF] transition-all shadow-lg active:scale-[0.99]"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#08088F] text-[#FFFF00] border border-white/10 shadow-inner">
          <Trophy className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-[#D9DCFF]">
              {t.format.replace('_', ' ')}
            </span>
            {isLive && (
              <Badge variant="live" className="text-[10px] py-0 px-2">
                LIVE
              </Badge>
            )}
            {isCompleted && (
              <Badge className="bg-[#FFFF00] text-[#08088F] text-[10px] py-0 px-2 font-black">
                COMPLETED
              </Badge>
            )}
          </div>
          <h4 className="text-base sm:text-lg font-black text-white truncate group-hover:text-[#FFFF00] transition-colors font-display">
            {t.name}
          </h4>
          <p className="text-xs text-[#D9DCFF] font-semibold flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-[#FFFF00]" />
              {t.participant_count}/{t.max_participants} Players
            </span>
            {t.start_date && (
              <span>• {formatDate(t.start_date)}</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="h-9 w-9 rounded-full bg-[#FFFF00] text-[#08088F] flex items-center justify-center group-hover:scale-110 transition-transform shadow-md">
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}

function CardSkeleton() {
  return (
    <div className="h-20 w-full rounded-3xl bg-[#1A1AE8] animate-pulse border border-white/10" />
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
      const [live, allTournaments] = await Promise.all([
        getPublicLiveMatches(undefined, bypassCache),
        getPublicTournaments({ bypassCache }),
      ]);
      setLiveMatches(live);
      setActiveT(allTournaments.filter((t) => t.status === 'ongoing'));
      setUpcomingT(allTournaments.filter((t) => t.status === 'registration'));
      setCompletedT(allTournaments.filter((t) => t.status === 'completed').slice(0, 6));
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
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  useRealtimeMatches(() => fetchAll(true));

  return (
    <div className="space-y-10 sm:space-y-14 pb-16 w-full">
      {/* =========================================================================
          1. TOP ANNOUNCEMENT BANNER STRIP (Matching reference top yellow banner)
          ========================================================================= */}
      <div className="w-full rounded-full bg-[#FFFF00] text-[#08088F] px-4 sm:px-6 py-2.5 sm:py-3 shadow-xl flex items-center justify-between gap-3 font-bold text-xs sm:text-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-[#08088F] text-[#FFFF00] flex items-center justify-center shrink-0 shadow-md">
            <Bell className="h-4 w-4" />
          </div>
          <span className="hidden md:inline bg-[#08088F] text-[#FFFF00] px-3 py-1 rounded-full text-xs font-black uppercase shrink-0">
            SEASON 2026
          </span>
          <p className="truncate font-black text-xs sm:text-sm tracking-tight">
            Kerala eFootball Championship Open: Register your eFootball ID today to compete for the trophy!
          </p>
        </div>
        <Link
          href="/tournaments?status=registration"
          className="bg-white hover:bg-slate-100 text-[#08088F] px-4 sm:px-5 py-1.5 rounded-full text-xs font-black shrink-0 transition-transform active:scale-95 shadow-sm uppercase tracking-wider"
        >
          Register Now
        </Link>
      </div>

      {/* =========================================================================
          2. HERO SECTION — "THE PITCH IS OURS" (Direct Reference Recreation)
          ========================================================================= */}
      <section className="relative rounded-[32px] sm:rounded-[40px] bg-gradient-to-br from-[#1E1EF5] via-[#2A2AFF] to-[#1212B8] p-6 sm:p-10 lg:p-12 border border-white/20 shadow-2xl overflow-hidden">
        {/* Glow Accents */}
        <div className="absolute top-0 right-0 w-64 sm:w-96 h-64 sm:h-96 max-w-full bg-[#FFFF00]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 sm:w-80 h-60 sm:h-80 max-w-full bg-[#FF168B]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center relative z-10">
          
          {/* Left Column: Bold Headline, Copy, Action Buttons & Featured Card */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-black uppercase text-[#FFFF00] tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />
              <span>OFFICIAL COMPETITIVE ARENA</span>
            </div>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white uppercase tracking-tight leading-[0.95] font-display headline-stencil">
              THE PITCH <br />
              <span className="text-[#FFFF00]">IS OURS</span>
            </h1>

            <p className="text-sm sm:text-base text-[#D9DCFF] max-w-xl leading-relaxed font-medium">
              Konami eFootball official tournament platform. Elevating on-field esports realism to all-new levels as players compete in automated group stages, real-time live streaming, and high-stakes knockout brackets.
            </p>

            {/* Pill Action Buttons matching reference */}
            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <Button asChild size="lg" className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-sm tracking-wider uppercase px-7 py-3.5 shadow-xl hover:scale-105 active:scale-95 transition-all">
                <Link href="/tournaments">
                  Join Tournaments
                </Link>
              </Button>

              <Button asChild variant="outline" size="lg" className="rounded-full border-2 border-white/60 hover:border-white text-white font-black text-sm tracking-wider uppercase px-7 py-3.5 hover:bg-white/10 transition-all">
                <Link href="/live" className="flex items-center gap-2">
                  <Play className="h-4 w-4 fill-white" />
                  <span>Watch Arena</span>
                </Link>
              </Button>
            </div>

            {/* Embedded Special Spotlight Card matching reference lower left card */}
            <div className="pt-4">
              <div className="rounded-3xl bg-[#1010A8] border border-white/15 overflow-hidden shadow-xl max-w-md group hover:border-[#FFFF00]/60 transition-all">
                <div className="p-4 sm:p-5 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#FFFF00]">
                      FEATURED COMPETITION
                    </span>
                    <h3 className="text-lg font-black text-white font-display uppercase tracking-tight">
                      Kerala eFootball Masters
                    </h3>
                  </div>
                  <Badge variant="live" className="text-[10px] py-0.5 px-2.5">
                    STAGE 1
                  </Badge>
                </div>

                {/* Banner Artwork Area */}
                <div className="relative h-32 w-full overflow-hidden bg-slate-900">
                  <Image
                    src="/images/banners/efootball-championship.jpg"
                    alt="eFootball Championship Spotlight"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500 opacity-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1010A8] via-transparent to-transparent" />
                </div>

                {/* Yellow Action Pill Bar matching reference */}
                <Link
                  href="/tournaments"
                  className="w-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black px-5 py-3 text-xs sm:text-sm uppercase tracking-wider flex items-center justify-between transition-colors"
                >
                  <span>Special Player List & Rules</span>
                  <div className="h-6 w-6 rounded-full bg-[#08088F] text-[#FFFF00] flex items-center justify-center">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column: Layered Featured Visual & Sub-Cards matching reference right cards */}
          <div className="lg:col-span-5 space-y-4">
            {/* Main Featured Stadium Card with Play Button */}
            <div className="relative rounded-3xl overflow-hidden border border-white/20 bg-slate-900 shadow-2xl aspect-[4/3] group">
              <Image
                src="/images/banners/efootball-stadium.jpg"
                alt="eFootball Live Arena Visual"
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-700 opacity-85"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#08088F]/90 via-black/20 to-transparent" />

              {/* Central Play Button */}
              <Link
                href="/live"
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-20 group/play cursor-pointer"
              >
                <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-white text-[#08088F] flex items-center justify-center shadow-2xl group-hover/play:scale-110 group-hover/play:bg-[#FFFF00] transition-all">
                  <Play className="h-8 w-8 fill-current ml-1" />
                </div>
                <div className="text-center space-y-0.5">
                  <span className="text-[11px] font-black uppercase tracking-widest text-[#FFFF00]">
                    eFootball 2026
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-black text-white uppercase font-display drop-shadow-md">
                    SEASON 3 ARENA
                  </h3>
                </div>
              </Link>

              {/* Top Status Pill */}
              <div className="absolute top-4 left-4 z-20">
                <span className="px-3 py-1 rounded-full bg-[#FF168B] text-white text-xs font-black uppercase tracking-wider shadow-md">
                  HOT TOURNAMENT
                </span>
              </div>
            </div>

            {/* Sub Preview Cards (Two Horizontal Cards Layered Underneath) */}
            <div className="grid grid-cols-2 gap-3.5">
              <Link
                href="/tournaments"
                className="relative rounded-2xl overflow-hidden border border-white/15 bg-[#1010C5] p-3 aspect-[16/10] flex flex-col justify-end group hover:border-[#FFFF00] transition-all shadow-md"
              >
                <Image
                  src="/images/banner1.jpg"
                  alt="Season 2 Elevate"
                  fill
                  className="object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#08088F] via-[#08088F]/50 to-transparent" />
                <div className="relative z-10 space-y-0.5">
                  <span className="text-[9px] font-black text-[#FFFF00] uppercase tracking-wider">
                    SEASON 2
                  </span>
                  <p className="text-xs font-black text-white leading-tight font-display uppercase truncate">
                    Elevate Excitement
                  </p>
                </div>
              </Link>

              <Link
                href="/tournaments"
                className="relative rounded-2xl overflow-hidden border border-white/15 bg-[#1010C5] p-3 aspect-[16/10] flex flex-col justify-end group hover:border-[#FFFF00] transition-all shadow-md"
              >
                <Image
                  src="/images/banner2.jpg"
                  alt="Match Pass"
                  fill
                  className="object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#08088F] via-[#08088F]/50 to-transparent" />
                <div className="relative z-10 space-y-0.5">
                  <span className="text-[9px] font-black text-[#FFFF00] uppercase tracking-wider">
                    PRO TOURNAMENTS
                  </span>
                  <p className="text-xs font-black text-white leading-tight font-display uppercase truncate">
                    Official Match Pass
                  </p>
                </div>
              </Link>
            </div>
          </div>

        </div>
      </section>

      {/* =========================================================================
          3. LIVE NOW MATCHES SECTION
          ========================================================================= */}
      {(loading || liveMatches.length > 0) && (
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF168B] opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#FF168B]" />
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white uppercase font-display tracking-tight">
                Live Broadcasts
              </h2>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs font-black text-[#FFFF00] hover:text-white gap-1 rounded-full">
              <Link href="/live">
                View All Live
                <ChevronRight className="h-4 w-4" />
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
          )}
        </section>
      )}

      {/* =========================================================================
          4. TOURNAMENT DISCOVERY — ACTIVE & UPCOMING
          ========================================================================= */}
      <section className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Tournaments Column */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-[#FFFF00] text-[#08088F] flex items-center justify-center font-black">
                  <Trophy className="h-4 w-4" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white uppercase font-display tracking-tight">
                  Active Tournaments
                </h2>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-xs text-[#FFFF00] font-black gap-1 rounded-full">
                <Link href="/tournaments?status=ongoing">
                  All Active <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            {loading ? (
              <div className="space-y-3">
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
              </div>
            ) : activeT.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/20 bg-[#1414C8]/60 p-8 text-center space-y-3">
                <Trophy className="h-10 w-10 text-[#FFFF00] mx-auto opacity-70" />
                <p className="text-sm text-[#D9DCFF] font-medium">No live active tournaments right now.</p>
                <Button asChild size="sm" className="rounded-full bg-[#FFFF00] text-[#08088F] font-black text-xs">
                  <Link href="/tournaments">View All Tournaments</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {activeT.slice(0, 5).map((t) => (
                  <TournamentMiniCard key={t.id} t={t} />
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Registrations Column */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#FFFF00]" />
                <h2 className="text-2xl font-black text-white uppercase font-display tracking-tight">
                  Upcoming
                </h2>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-xs text-[#FFFF00] font-black rounded-full">
                <Link href="/tournaments?status=registration">
                  View <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>

            {loading ? (
              <div className="space-y-3">
                <CardSkeleton />
                <CardSkeleton />
              </div>
            ) : upcomingT.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/20 bg-[#1414C8]/60 p-6 text-center">
                <p className="text-xs text-[#D9DCFF]">No upcoming registrations at the moment.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingT.slice(0, 4).map((t) => (
                  <TournamentMiniCard key={t.id} t={t} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recently Completed Tournaments / Champions */}
        {completedT.length > 0 && (
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#FFFF00]" />
                <h2 className="text-2xl font-black text-white uppercase font-display tracking-tight">
                  Recent Champions & Completed Tournaments
                </h2>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-xs text-[#FFFF00] font-black rounded-full">
                <Link href="/tournaments?status=completed">
                  Hall of Fame <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {completedT.map((t) => (
                <TournamentMiniCard key={t.id} t={t} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* =========================================================================
          5. ANNOUNCEMENTS SECTION (Matching reference bottom announcement section)
          ========================================================================= */}
      <section className="space-y-4">
        <h2 className="text-3xl sm:text-4xl font-black text-white uppercase font-display tracking-tight text-center sm:text-left">
          Announcements
        </h2>

        <div className="rounded-[32px] bg-gradient-to-r from-[#1818D4] via-[#2A2AFF] to-[#1818D4] p-6 sm:p-8 border border-white/20 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4 sm:gap-6 min-w-0">
            {/* Date Box matching reference */}
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-[#08088F] text-center flex flex-col items-center justify-center p-2 border border-white/10 shrink-0">
              <span className="text-2xl sm:text-3xl font-black text-[#FFFF00] leading-none font-display">
                12
              </span>
              <span className="text-[10px] font-black uppercase text-[#D9DCFF]">
                DEC 2026
              </span>
            </div>

            {/* Announcement Copy */}
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge className="bg-white text-[#08088F] text-[10px] font-black uppercase">
                  PLATFORM UPDATE
                </Badge>
                <span className="text-xs text-[#D9DCFF] font-semibold">eFootball Platform v4.2.0</span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white font-display uppercase tracking-tight">
                Tournament Stage Transitioning & WhatsApp Verification Activated
              </h3>
              <p className="text-xs sm:text-sm text-[#D9DCFF] leading-relaxed line-clamp-2 max-w-2xl">
                Administrators can now automate bracket advancement from group round-robins to knockout brackets with strict WhatsApp ID matching and anti-cheat protection.
              </p>
            </div>
          </div>

          <Link
            href="/about"
            className="rounded-full bg-white hover:bg-slate-100 text-[#08088F] font-black text-xs sm:text-sm px-6 py-3 uppercase tracking-wider shrink-0 transition-transform active:scale-95 shadow-md flex items-center gap-2"
          >
            <span>Read Updates</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
