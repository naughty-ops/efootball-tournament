import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PlayerDashboardHeader from '../PlayerDashboardHeader';
import { PlayerDashboardSwipeWrapper } from '@/components/dashboard/PlayerDashboardSwipeWrapper';
import PlayerWalletClientView from '@/components/wallet/PlayerWalletClientView';
import { getPlayerProfile } from '@/services/playerDashboardService';
import {
  getPlayerWalletOverview,
  getPlayerWalletTransactions,
  getPlayerPaymentMethods,
  getPlayerPayouts,
  getPlayerMonthlyEarnings,
} from '@/services/walletService';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Wallet & Payouts | Player Dashboard',
  description: 'View your tournament earnings, manage bank and UPI details, and track manual payout settlements.',
};

export default async function PlayerWalletPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login?error=unauthorized');
  }

  // Fetch player profile for header and financial data in parallel
  const [profile, overview, txResult, paymentMethods, payouts] = await Promise.all([
    getPlayerProfile(supabase, user.id, user),
    getPlayerWalletOverview(user.id),
    getPlayerWalletTransactions(user.id, { page: 1, pageSize: 100 }),
    getPlayerPaymentMethods(user.id),
    getPlayerPayouts(user.id),
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
        avatarUrl={profile?.avatar_url || '/avatars/default-avatar.svg'}
      />

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
        <PlayerDashboardSwipeWrapper currentSection="wallet">
          <PlayerWalletClientView
            overview={overview}
            transactions={txResult.transactions}
            paymentMethods={paymentMethods}
            payouts={payouts}
          />
        </PlayerDashboardSwipeWrapper>
      </main>
    </div>
  );
}
