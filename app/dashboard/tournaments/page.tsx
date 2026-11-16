import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Trophy, Compass, Sparkles } from 'lucide-react';
import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import PlayerDashboardSwipeWrapper from '@/components/dashboard/PlayerDashboardSwipeWrapper';
import PlayerTournamentsClient from './PlayerTournamentsClient';
import { getPlayerProfile, getPlayerTournaments, getPlayerPaymentRegistrations } from '@/services/playerDashboardService';
import { getManualPaymentSettings } from '@/services/paymentSettingsService';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My Tournaments | Player Dashboard',
  description: 'Manage your registrations, track tournament progress, and find your next match.',
};

export default async function PlayerTournamentsPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect('/auth/login?error=unauthorized');
  }

  const supabase = await createClient();

  // Derive identity strictly from server-side verified auth.uid()
  const [profile, tournamentsResult, paymentRegistrations, paymentSettings] = await Promise.all([
    getPlayerProfile(supabase, user.id, user).catch(() => null),
    getPlayerTournaments(supabase, user.id).catch(() => ({ data: [], error: null })),
    getPlayerPaymentRegistrations(supabase, user.id).catch(() => []),
    getManualPaymentSettings(supabase).catch(() => null),
  ]);

  const fullName = profile?.display_name || user.user_metadata?.full_name || 'Player';
  const email = user.email || '';
  const efootballId = profile?.efootball_id || user.user_metadata?.efootball_id;
  const isVerified = profile?.efootball_id_verified === true;

  const safeTournaments = tournamentsResult?.data || [];
  const safePaymentRegistrations = paymentRegistrations || [];

  return (
    <div className="pb-16">
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <PlayerDashboardSwipeWrapper currentSection="tournaments" className="space-y-6 sm:space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFFF00] text-[#08088F] text-[11px] font-black uppercase tracking-widest shadow-sm">
              <Trophy className="h-3.5 w-3.5" />
              <span>Registered Competitions</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white font-display uppercase tracking-wider">
              My Tournaments
            </h1>
            <p className="text-xs sm:text-sm text-[#D9DCFF] max-w-2xl leading-relaxed font-medium">
              Manage your registrations, track tournament progress, and find your next match.
            </p>
          </div>
          <Button
            asChild
            className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs uppercase tracking-wider h-11 px-6 shadow-xl hover:scale-105 active:scale-95 transition-all gap-2 shrink-0 cursor-pointer w-fit"
          >
            <Link href="/tournaments">
              <Compass className="h-4 w-4 text-[#08088F]" />
              <span>Browse All Tournaments</span>
            </Link>
          </Button>
        </div>

        <PlayerTournamentsClient
          initialTournaments={safeTournaments}
          initialPaymentRegistrations={safePaymentRegistrations}
          paymentSettings={paymentSettings || undefined}
          playerProfile={{
            display_name: fullName,
            efootball_id: efootballId,
            whatsapp_number: profile?.whatsapp_number,
          }}
          initialError={tournamentsResult?.error || null}
        />
        </PlayerDashboardSwipeWrapper>
      </main>
    </div>
  );
}
