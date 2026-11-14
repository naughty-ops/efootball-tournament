import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import PlayerDashboardHeader from '../PlayerDashboardHeader';
import PlayerDashboardSwipeWrapper from '@/components/dashboard/PlayerDashboardSwipeWrapper';
import PlayerMatchesClient from './PlayerMatchesClient';
import CompetitionSubNav from '@/components/competition/CompetitionSubNav';
import { getPlayerProfile, getPlayerMatches } from '@/services/playerDashboardService';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My Matches | Player Dashboard',
  description: 'Track fixtures, prepare for upcoming matches, and review your results.',
};

export default async function PlayerMatchesPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect('/auth/login?error=unauthorized');
  }

  const supabase = await createClient();

  // Derive identity strictly from server-side verified auth.uid()
  const [profile, matchesResult] = await Promise.all([
    getPlayerProfile(supabase, user.id, user).catch(() => null),
    getPlayerMatches(supabase, user.id).catch(() => ({ data: [], error: null })),
  ]);

  const fullName = profile?.display_name || user.user_metadata?.full_name || 'Player';
  const email = user.email || '';
  const efootballId = profile?.efootball_id || user.user_metadata?.efootball_id;
  const isVerified = profile?.efootball_id_verified === true;

  const safeMatches = matchesResult?.data || [];

  return (
    <div className="pb-16">
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <PlayerDashboardSwipeWrapper currentSection="matches" className="space-y-6 sm:space-y-8">
        {/* Competition Center Unified Sub-Nav */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <CompetitionSubNav
            activeTab="matches"
            matchCount={safeMatches.length}
          />
          <Button
            asChild
            className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-full h-11 px-6 shadow-lg gap-2 shrink-0 cursor-pointer w-fit"
          >
            <Link href="/dashboard/tournaments">
              <Trophy className="h-4 w-4 text-[#08088F]" />
              <span>My Tournaments</span>
            </Link>
          </Button>
        </div>

        {/* Page Header */}
        <div className="border-b border-white/10 pb-6">
          <h1 className="text-3xl sm:text-4xl font-black text-white font-display uppercase tracking-wider">
            My Matches
          </h1>
          <p className="text-xs sm:text-sm text-white/70 mt-1 max-w-2xl leading-relaxed">
            Track fixtures, prepare for upcoming matches, and review your results.
          </p>
        </div>

        <PlayerMatchesClient
          initialMatches={safeMatches}
          userDisplayName={fullName}
          initialError={matchesResult?.error || null}
        />
        </PlayerDashboardSwipeWrapper>
      </main>
    </div>
  );
}
