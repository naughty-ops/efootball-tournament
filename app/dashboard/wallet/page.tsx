import React from 'react';
import { redirect } from 'next/navigation';
import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
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
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect('/auth/login?error=unauthorized');
  }

  const supabase = await createClient();

  const defaultOverview = {
    totalEarningsPaise: 0,
    totalEarningsInr: 0,
    pendingEarningsPaise: 0,
    pendingEarningsInr: 0,
    availablePayoutPaise: 0,
    availablePayoutInr: 0,
    processingPayoutPaise: 0,
    processingPayoutInr: 0,
    totalPaidPaise: 0,
    totalPaidInr: 0,
    unpaidRewardsPaise: 0,
    unpaidRewardsInr: 0,
    nextExpectedPayout: null,
  };

  // Fetch player profile for header and financial data in parallel with resilient fallbacks
  const [profile, overview, txResult, paymentMethods, payouts] = await Promise.all([
    getPlayerProfile(supabase, user.id, user).catch(() => null),
    getPlayerWalletOverview(user.id, supabase).catch(() => defaultOverview),
    getPlayerWalletTransactions(user.id, { page: 1, pageSize: 100 }, supabase).catch(() => ({ transactions: [], totalCount: 0 })),
    getPlayerPaymentMethods(user.id, supabase).catch(() => []),
    getPlayerPayouts(user.id, supabase).catch(() => []),
  ]);

  const fullName = profile?.display_name || user.user_metadata?.full_name || 'Player';
  const email = user.email || '';
  const efootballId = profile?.efootball_id || user.user_metadata?.efootball_id;
  const isVerified = profile?.efootball_id_verified === true;

  const safeOverview = overview || defaultOverview;
  const safeTransactions = txResult?.transactions || [];
  const safePaymentMethods = paymentMethods || [];
  const safePayouts = payouts || [];

  return (
    <div className="pb-16">
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
        <PlayerDashboardSwipeWrapper currentSection="wallet">
          <PlayerWalletClientView
            overview={safeOverview}
            transactions={safeTransactions}
            paymentMethods={safePaymentMethods}
            payouts={safePayouts}
          />
        </PlayerDashboardSwipeWrapper>
      </main>
    </div>
  );
}
