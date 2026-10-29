import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Compass } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import PlayerDashboardHeader from '../PlayerDashboardHeader';
import PlayerTournamentsClient from './PlayerTournamentsClient';
import { getPlayerProfile, getPlayerTournaments } from '@/services/playerDashboardService';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My Tournaments | Player Dashboard',
  description: 'Manage your registrations, track tournament progress, and find your next match.',
};

export default async function PlayerTournamentsPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login?error=unauthorized');
  }

  // Derive identity strictly from server-side verified auth.uid()
  const [profile, tournamentsResult] = await Promise.all([
    getPlayerProfile(supabase, user.id),
    getPlayerTournaments(supabase, user.id),
  ]);

  const fullName = profile?.display_name || user.user_metadata?.full_name || 'Player';
  const email = user.email || '';
  const efootballId = profile?.efootball_id || user.user_metadata?.efootball_id;
  const isVerified = profile?.efootball_id_verified === true;

  return (
    <div className="min-h-screen bg-[#08088F] text-white pb-16">
      <PlayerDashboardHeader
        userEmail={email}
        displayName={fullName}
        efootballId={efootballId}
        isVerified={isVerified}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-white font-display uppercase tracking-wider">
              My Tournaments
            </h1>
            <p className="text-xs sm:text-sm text-white/70 mt-1 max-w-2xl leading-relaxed">
              Manage your registrations, track tournament progress, and find your next match.
            </p>
          </div>

          <Button
            asChild
            className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-full h-11 px-6 shadow-lg gap-2 shrink-0 cursor-pointer"
          >
            <Link href="/tournaments">
              <Compass className="h-4 w-4 text-[#08088F]" />
              <span>Browse Tournaments</span>
            </Link>
          </Button>
        </div>

        <PlayerTournamentsClient
          initialTournaments={tournamentsResult.data}
          initialError={tournamentsResult.error}
        />
      </main>
    </div>
  );
}
