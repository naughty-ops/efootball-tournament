import React from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {
  Trophy,
  Swords,
  Gamepad2,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingUp,
  Compass,
  Calendar,
  AlertCircle,
  Radio,
  Flame,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import PlayerDashboardHeader from './PlayerDashboardHeader';
import OpponentWhatsAppButton from '@/components/dashboard/OpponentWhatsAppButton';
import {
  getPlayerProfile,
  getPlayerOverviewStats,
  getPlayerTournaments,
  getPlayerMatches,
} from '@/services/playerDashboardService';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Player Dashboard | eFootball Tournament',
  description: 'Manage your eFootball tournament registrations, matches, and player profile.',
};

interface PageProps {
  searchParams?: Promise<{ error?: string }>;
}

export default async function PlayerDashboardPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const showAdminDeniedAlert = resolvedSearchParams.error === 'admin_unauthorized';

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login?error=unauthorized');
  }

  // Fetch player profile, overview stats, recent tournaments, and matches in parallel
  const [profile, stats, tournamentsRes, matchesRes] = await Promise.all([
    getPlayerProfile(supabase, user.id, user),
    getPlayerOverviewStats(supabase, user.id),
    getPlayerTournaments(supabase, user.id),
    getPlayerMatches(supabase, user.id),
  ]);

  const tournaments = tournamentsRes.data || [];
  const matches = matchesRes.data || [];

  const fullName = profile?.display_name || user.user_metadata?.full_name || 'Player';
  const email = user.email || '';
  const efootballId = profile?.efootball_id || user.user_metadata?.efootball_id || 'Not Set';
  const verificationStatus = profile?.efootball_verification_status || 'pending';
  const isVerified = profile?.efootball_id_verified === true || verificationStatus === 'verified';

  // Extract upcoming/live matches
  const liveMatches = matches.filter((m) => m.isLive);
  const scheduledMatches = matches.filter((m) => m.status === 'scheduled' || m.status === 'ready');
  const displayUpcomingMatches = [...liveMatches, ...scheduledMatches].slice(0, 3);

  // Extract recent active/upcoming tournaments
  const activeTournaments = tournaments
    .filter((t) => t.status === 'ongoing' || t.status === 'registration')
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-[#08088F] text-white pb-16">
      {/* Navigation Header */}
      <PlayerDashboardHeader
        userEmail={email}
        displayName={fullName}
        efootballId={efootballId !== 'Not Set' ? efootballId : undefined}
        isVerified={isVerified}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Admin Unauthorized Alert */}
        {showAdminDeniedAlert && (
          <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-[#FFFF00]/40 text-[#FFFF00] text-xs font-bold flex items-center justify-between shadow-md animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-[#FFFF00] shrink-0" />
              <span>Access Denied: The administrator portal is restricted to authorized platform administrators.</span>
            </div>
            <Link href="/dashboard" className="text-white underline text-xs ml-4 hover:no-underline">
              Dismiss
            </Link>
          </div>
        )}

        {/* Welcome Hero Banner */}
        <div className="relative overflow-hidden rounded-[32px] bg-[#1010C5] p-6 sm:p-8 text-white shadow-2xl border border-white/20">
          <div className="absolute top-0 right-0 w-48 sm:w-64 h-48 sm:h-64 max-w-full bg-[#3434FF]/30 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-[#FFFF00] text-[#08088F] font-black text-[10px] uppercase tracking-widest px-3 py-1 rounded-full shadow-sm">
                  COMPETITOR PORTAL
                </span>
                {isVerified ? (
                  <span className="bg-emerald-500 text-white text-[10px] font-bold gap-1 rounded-full px-3 py-1 flex items-center">
                    <CheckCircle2 className="h-3 w-3" />
                    Verified eFootball ID
                  </span>
                ) : verificationStatus === 'rejected' ? (
                  <span className="bg-[#FF168B] text-white text-[10px] font-bold gap-1 rounded-full px-3 py-1 flex items-center">
                    <AlertCircle className="h-3 w-3" />
                    ID Verification Action Required
                  </span>
                ) : (
                  <span className="border border-[#FFFF00]/50 bg-[#0A0A7A] text-[#FFFF00] text-[10px] font-bold gap-1 rounded-full px-3 py-1 flex items-center">
                    <Clock className="h-3 w-3" />
                    Verification Pending
                  </span>
                )}
              </div>

              <div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black font-display uppercase tracking-wider text-white">
                  Welcome back, <span className="text-[#FFFF00]">{fullName}</span>!
                </h1>
                <p className="text-xs sm:text-sm text-[#D9DCFF]/90 mt-1 max-w-2xl font-medium leading-relaxed">
                  Track your tournament brackets, upcoming fixtures, live match scores, and official in-game standing.
                </p>
              </div>

              {/* In-Game Tag Pill */}
              <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-[#0A0A7A] border border-white/20 text-xs font-mono">
                <Gamepad2 className="h-4 w-4 text-[#FFFF00]" />
                <span className="text-[#D9DCFF] font-medium">eFootball ID:</span>
                <span className="font-black text-[#FFFF00] tracking-wide">{efootballId}</span>
              </div>
            </div>

            {/* Hero Quick CTA */}
            <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0">
              <Button asChild className="bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] font-black text-xs shadow-lg rounded-full h-11 px-6 gap-2 uppercase tracking-wider">
                <Link href="/tournaments">
                  <Compass className="h-4 w-4 text-[#08088F]" />
                  <span>Discover Tournaments</span>
                </Link>
              </Button>
              <Button asChild variant="outline" className="border-white/20 text-white hover:bg-white/10 text-xs font-black rounded-full h-11 px-6 gap-2 bg-transparent uppercase tracking-wider">
                <Link href="/dashboard/matches">
                  <Swords className="h-4 w-4 text-[#FFFF00]" />
                  <span>View Fixtures</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* 4 Primary Metric KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {/* 1. Registered Tournaments */}
          <Card className="bg-[#1818D4] border-white/20 shadow-xl rounded-[28px] p-5 hover:border-[#FFFF00] transition-all text-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#D9DCFF] uppercase tracking-wider">
                Tournaments
              </span>
              <div className="h-9 w-9 rounded-xl bg-[#0A0A7A] text-[#FFFF00] flex items-center justify-center">
                <Trophy className="h-4 w-4 text-[#FFFF00]" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black font-display text-[#FFFF00]">
                {stats.registeredTournamentsCount}
              </span>
              <span className="text-xs text-[#D9DCFF]/70 ml-2 font-medium">Registered</span>
            </div>
            <p className="text-[11px] text-[#D9DCFF]/90 font-medium mt-1 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FFFF00]" />
              {stats.activeTournamentsCount} Active / In Progress
            </p>
          </Card>

          {/* 2. Upcoming / Live Matches */}
          <Card className="bg-[#1818D4] border-white/20 shadow-xl rounded-[28px] p-5 hover:border-[#FFFF00] transition-all text-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#D9DCFF] uppercase tracking-wider">
                Matches Queued
              </span>
              <div className="h-9 w-9 rounded-xl bg-[#0A0A7A] text-[#FFFF00] flex items-center justify-center">
                <Swords className="h-4 w-4 text-[#FFFF00]" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black font-display text-[#FFFF00]">
                {stats.upcomingMatchesCount + stats.liveMatchesCount}
              </span>
              <span className="text-xs text-[#D9DCFF]/70 ml-2 font-medium">Fixtures</span>
            </div>
            <p className="text-[11px] text-[#D9DCFF]/90 font-medium mt-1 flex items-center gap-1">
              {stats.liveMatchesCount > 0 ? (
                <span className="text-[#FF168B] font-black flex items-center gap-1 animate-pulse">
                  <Flame className="h-3 w-3" />
                  {stats.liveMatchesCount} Match Currently Live!
                </span>
              ) : (
                <span>Next match ready when scheduled</span>
              )}
            </p>
          </Card>

          {/* 3. Matches Completed */}
          <Card className="bg-[#1818D4] border-white/20 shadow-xl rounded-[28px] p-5 hover:border-[#FFFF00] transition-all text-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#D9DCFF] uppercase tracking-wider">
                Matches Played
              </span>
              <div className="h-9 w-9 rounded-xl bg-[#0A0A7A] text-[#FFFF00] flex items-center justify-center">
                <Calendar className="h-4 w-4 text-[#FFFF00]" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black font-display text-[#FFFF00]">
                {stats.matchesPlayedCount}
              </span>
              <span className="text-xs text-[#D9DCFF]/70 ml-2 font-medium">Official games</span>
            </div>
            <p className="text-[11px] text-[#D9DCFF]/80 font-medium mt-1">
              {stats.matchesWonCount}W - {stats.matchesDrawnCount}D - {stats.matchesLostCount}L
            </p>
          </Card>

          {/* 4. Win Rate */}
          <Card className="bg-[#1818D4] border-white/20 shadow-xl rounded-[28px] p-5 hover:border-[#FFFF00] transition-all text-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#D9DCFF] uppercase tracking-wider">
                Win Rate
              </span>
              <div className="h-9 w-9 rounded-xl bg-[#0A0A7A] text-[#FFFF00] flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-[#FFFF00]" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black font-display text-[#FFFF00]">
                {stats.winRate}%
              </span>
              <span className="text-xs text-[#D9DCFF]/70 font-medium">
                ({stats.matchesWonCount} Wins)
              </span>
            </div>
            <div className="w-full bg-[#0A0A7A] rounded-full h-2 mt-2 overflow-hidden border border-white/10">
              <div
                className="bg-[#FFFF00] h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(255,255,0,0.5)]"
                style={{ width: `${Math.min(100, Math.max(0, stats.winRate))}%` }}
              />
            </div>
          </Card>
        </div>

        {/* Two-Column Layout: Upcoming Fixtures & Registered Tournaments */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Upcoming & Live Matches */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-black font-display uppercase tracking-wider text-white flex items-center gap-2">
                  <Swords className="h-4 w-4 text-[#FFFF00]" />
                  <span>Your Next Matches</span>
                </h2>
                <p className="text-xs text-[#D9DCFF]/80">Upcoming and in-progress match schedules</p>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-xs font-black text-[#FFFF00] hover:text-white hover:bg-white/10 gap-1 rounded-full">
                <Link href="/dashboard/matches">
                  <span>View All</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>

            {displayUpcomingMatches.length === 0 ? (
              <Card className="p-8 text-center bg-[#1818D4] border-white/20 rounded-[28px] space-y-3 text-white shadow-xl">
                <div className="mx-auto h-12 w-12 rounded-2xl bg-[#3434FF] flex items-center justify-center text-[#FFFF00]">
                  <Calendar className="h-6 w-6" />
                </div>
                <h3 className="text-base font-black font-display uppercase text-white">No Upcoming Matches</h3>
                <p className="text-xs text-[#D9DCFF]/80 max-w-sm mx-auto font-medium">
                  Once tournament brackets and group fixtures are published, your scheduled matches will appear here.
                </p>
                <Button asChild variant="outline" size="sm" className="rounded-full text-xs font-black border-white/20 text-white hover:bg-[#FFFF00] hover:text-[#08088F] mt-2">
                  <Link href="/tournaments">Discover Tournaments</Link>
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {displayUpcomingMatches.map((m) => (
                  <Card key={m.id} className="p-4 bg-[#1818D4] border-white/20 rounded-2xl hover:border-[#FFFF00] transition-all shadow-md text-white">
                    <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2.5 mb-2.5">
                      <span className="text-xs font-black uppercase tracking-wider text-white truncate max-w-[200px]">
                        {m.tournamentName}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-[#D9DCFF]/80 uppercase">
                          {m.roundName}
                        </span>
                        {m.isLive ? (
                          <span className="bg-[#FF168B] text-white font-black text-[10px] uppercase animate-pulse px-2.5 py-0.5 rounded-full">
                            LIVE
                          </span>
                        ) : (
                          <span className="bg-[#0A0A7A] text-[#D9DCFF] text-[10px] font-bold uppercase px-2 py-0.5 rounded-full">
                            {m.status.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-[#FFFF00] block">You ({efootballId})</span>
                        <span className="text-sm font-bold text-white truncate block">{fullName}</span>
                      </div>

                      <div className="px-4 text-center shrink-0">
                        {m.isLive ? (
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-black font-display text-[#FFFF00]">{m.userScore}</span>
                            <span className="text-xs font-bold text-white/40">-</span>
                            <span className="text-lg font-black font-display text-[#FFFF00]">{m.opponentScore}</span>
                          </div>
                        ) : (
                          <span className="text-xs font-black px-2 py-0.5 rounded-full bg-[#0A0A7A] text-[#D9DCFF]">
                            VS
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 text-right">
                        <span className="text-xs font-medium text-[#D9DCFF]/70 block">
                          Opponent
                        </span>
                        <OpponentWhatsAppButton
                          match={m}
                          yourName={fullName}
                        />
                      </div>
                    </div>

                    {m.isLive && (
                      <div className="mt-3 pt-2.5 border-t border-white/15 flex items-center justify-between">
                        <span className="text-[11px] text-[#FF168B] font-bold flex items-center gap-1.5">
                          <Radio className="h-3 w-3 animate-ping" />
                          Match in progress
                        </span>
                        <Button asChild size="sm" className="h-8 text-xs font-black bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] rounded-full px-3.5">
                          <Link href={`/live/${m.id}`}>Watch Live</Link>
                        </Button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Registered Tournaments */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-black font-display uppercase tracking-wider text-white flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-[#FFFF00]" />
                  <span>My Active Tournaments</span>
                </h2>
                <p className="text-xs text-[#D9DCFF]/80">Leagues and knockouts you are participating in</p>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-xs font-black text-[#FFFF00] hover:text-white hover:bg-white/10 gap-1 rounded-full">
                <Link href="/dashboard/tournaments">
                  <span>View All</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>

            {activeTournaments.length === 0 ? (
              <Card className="p-8 text-center bg-[#1818D4] border-white/20 rounded-[28px] space-y-3 text-white shadow-xl">
                <div className="mx-auto h-12 w-12 rounded-2xl bg-[#3434FF] flex items-center justify-center text-[#FFFF00]">
                  <Trophy className="h-6 w-6" />
                </div>
                <h3 className="text-base font-black font-display uppercase text-white">No Active Registrations</h3>
                <p className="text-xs text-[#D9DCFF]/80 max-w-sm mx-auto font-medium">
                  You haven&apos;t joined any active tournaments yet. Explore the tournament roster and secure your slot!
                </p>
                <Button asChild className="rounded-full text-xs font-black bg-[#FFFF00] text-[#08088F] hover:bg-[#FFFF00]/90 mt-2">
                  <Link href="/tournaments">Browse Tournaments</Link>
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {activeTournaments.map((t) => (
                  <Card key={t.participantId} className="p-4 bg-[#1818D4] border-white/20 rounded-2xl hover:border-[#FFFF00] transition-all shadow-md text-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="bg-[#0A0A7A] text-white font-bold text-[10px] uppercase px-2 py-0.5 rounded-full">
                            {t.format.replace(/_/g, ' ')}
                          </span>
                          {t.status === 'ongoing' ? (
                            <span className="bg-[#FF168B] text-white font-black text-[10px] uppercase px-2.5 py-0.5 rounded-full animate-pulse">
                              ONGOING
                            </span>
                          ) : (
                            <span className="bg-[#3434FF] text-white font-bold text-[10px] uppercase px-2 py-0.5 rounded-full border border-white/20">
                              REGISTRATION OPEN
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-white truncate">
                          {t.tournamentName}
                        </h3>
                        <p className="text-[11px] text-[#D9DCFF]/80 flex items-center gap-2 font-medium">
                          <span>Participant Status: <strong className="text-[#FFFF00] capitalize">{t.participantStatus}</strong></span>
                          {t.seedNumber && <span>• Seed #{t.seedNumber}</span>}
                        </p>
                      </div>

                      <Button asChild size="sm" variant="outline" className="h-8 text-xs font-bold rounded-full border-white/20 text-white hover:bg-[#FFFF00] hover:text-[#08088F] shrink-0">
                        <Link href={`/tournaments/${t.tournamentId}`}>
                          View Hub
                        </Link>
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Portal Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <Link
            href="/dashboard/tournaments"
            className="p-5 rounded-[28px] bg-[#1010C5] border border-white/20 hover:border-[#FFFF00] hover:shadow-[0_0_20px_rgba(52,52,255,0.4)] transition-all group flex items-center justify-between text-white shadow-xl"
          >
            <div className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Trophy className="h-4 w-4 text-[#FFFF00]" />
                Tournament Registrations
              </span>
              <p className="text-[11px] text-[#D9DCFF]/80">View your history and active brackets</p>
            </div>
            <ArrowRight className="h-4 w-4 text-[#FFFF00] group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            href="/dashboard/matches"
            className="p-5 rounded-[28px] bg-[#1010C5] border border-white/20 hover:border-[#FFFF00] hover:shadow-[0_0_20px_rgba(52,52,255,0.4)] transition-all group flex items-center justify-between text-white shadow-xl"
          >
            <div className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Swords className="h-4 w-4 text-[#FFFF00]" />
                Fixtures & Results
              </span>
              <p className="text-[11px] text-[#D9DCFF]/80">Track schedules, scores, and opponent handles</p>
            </div>
            <ArrowRight className="h-4 w-4 text-[#FFFF00] group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            href="/dashboard/profile"
            className="p-5 rounded-[28px] bg-[#1010C5] border border-white/20 hover:border-[#FFFF00] hover:shadow-[0_0_20px_rgba(52,52,255,0.4)] transition-all group flex items-center justify-between text-white shadow-xl"
          >
            <div className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Gamepad2 className="h-4 w-4 text-[#FFFF00]" />
                eFootball ID & Verification
              </span>
              <p className="text-[11px] text-[#D9DCFF]/80">Manage your gamer tag and contact number</p>
            </div>
            <ArrowRight className="h-4 w-4 text-[#FFFF00] group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </main>
    </div>
  );
}
