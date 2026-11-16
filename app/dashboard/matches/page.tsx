import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Trophy, Swords } from 'lucide-react';
import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import PlayerDashboardSwipeWrapper from '@/components/dashboard/PlayerDashboardSwipeWrapper';
import CompetitionMatchesHub from '@/components/competition/CompetitionMatchesHub';
import { getPlayerProfile, getPlayerMatches } from '@/services/playerDashboardService';
import {
  getActiveOneVsOneCards,
  checkUserEligibility,
  getUserActiveOneVsOneMatch,
  getUserOneVsOneMatchHistory,
  getUserArenaStats,
  getAvailableWaitingMatches,
  getArenaLeaderboard,
} from '@/services/oneVsOneService';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Matches & 1v1 Arena | Player Dashboard',
  description: 'Track tournament fixtures, enter 1 VS 1 challenges, and review your competitive results.',
};

interface PlayerMatchesPageProps {
  searchParams?: Promise<{ mode?: string; tab?: string }>;
}

export default async function PlayerMatchesPage({ searchParams }: PlayerMatchesPageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect('/auth/login?error=unauthorized');
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const supabase = await createClient();

  // Execute independent queries concurrently using Promise.all
  const [
    profile,
    matchesResult,
    cardsResult,
    isEligible,
    active1v1Match,
    history1v1Result,
    arenaStats,
    waitingMatchesResult,
    leaderboardResult,
    walletRecord,
  ] = await Promise.all([
    getPlayerProfile(supabase, user.id, user).catch(() => null),
    getPlayerMatches(supabase, user.id).catch(() => ({ data: [], error: null })),
    getActiveOneVsOneCards(supabase).catch(() => ({ data: [], error: null })),
    checkUserEligibility(supabase, user.id).catch(() => false),
    getUserActiveOneVsOneMatch(supabase, user.id).catch(() => null),
    getUserOneVsOneMatchHistory(supabase, user.id).catch(() => ({ data: [], error: null })),
    getUserArenaStats(supabase, user.id).catch(() => ({
      totalMatches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
    })),
    getAvailableWaitingMatches(supabase, user.id).catch(() => ({ data: [], error: null })),
    getArenaLeaderboard(supabase).catch(() => ({ data: [], error: null })),
    (async () => {
      try {
        const res = await (supabase.from('player_wallets') as any)
          .select('available_balance_paise')
          .eq('user_id', user.id)
          .maybeSingle();
        return res;
      } catch {
        return { data: null };
      }
    })(),
  ]);

  const fullName = profile?.display_name || user.user_metadata?.full_name || 'Player';
  const safeTournamentMatches = matchesResult?.data || [];
  const safeCards = cardsResult?.data || [];
  const safeHistory = history1v1Result?.data || [];
  const safeWaitingMatches = waitingMatchesResult?.data || [];
  const safeLeaderboard = leaderboardResult?.data || [];
  const availableBalanceInr = walletRecord?.data?.available_balance_paise
    ? Number(walletRecord.data.available_balance_paise) / 100
    : 0;

  const initialMode = resolvedParams.mode === '1v1' || resolvedParams.tab === '1v1' ? '1v1' : 'tournaments';

  return (
    <div className="pb-16 min-w-0 max-w-full">
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 min-w-0 max-w-full">
        <PlayerDashboardSwipeWrapper currentSection="matches" className="space-y-6 sm:space-y-8 min-w-0 max-w-full">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFFF00] text-[#08088F] text-[11px] font-black uppercase tracking-widest shadow-sm">
                <Swords className="h-3.5 w-3.5" />
                <span>Head-to-Head & Tournament Battles</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white font-display uppercase tracking-wider">
                Competition Center
              </h1>
              <p className="text-xs sm:text-sm text-[#D9DCFF] max-w-2xl leading-relaxed font-medium">
                Compete in official tournaments and instant 1 VS 1 Challenge Arena head-to-head fixtures.
              </p>
            </div>
            <Button
              asChild
              className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs uppercase tracking-wider h-11 px-6 shadow-xl hover:scale-105 active:scale-95 transition-all gap-2 shrink-0 cursor-pointer w-fit"
            >
              <Link href="/dashboard/tournaments">
                <Trophy className="h-4 w-4" />
                <span>My Tournaments</span>
              </Link>
            </Button>
          </div>

          <CompetitionMatchesHub
            initialMatches={safeTournamentMatches}
            userDisplayName={fullName}
            initialError={matchesResult?.error || null}
            cards={safeCards}
            active1v1Match={active1v1Match}
            history1v1Matches={safeHistory}
            arenaStats={arenaStats}
            isEligible={isEligible}
            currentUserId={user.id}
            availableBalanceInr={availableBalanceInr}
            initialMode={initialMode}
            initialAvailableMatches={safeWaitingMatches}
            initialLeaderboard={safeLeaderboard}
          />
        </PlayerDashboardSwipeWrapper>
      </main>
    </div>
  );
}
