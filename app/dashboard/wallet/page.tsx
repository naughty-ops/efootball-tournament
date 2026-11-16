import React from 'react';
import { redirect } from 'next/navigation';
import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { PlayerDashboardSwipeWrapper } from '@/components/dashboard/PlayerDashboardSwipeWrapper';
import PlayerWalletClientView from '@/components/wallet/PlayerWalletClientView';
import { getPlayerProfile } from '@/services/playerDashboardService';
import {
  getPlayerWalletOverview,
  getPlayerWalletTransactions,
  getPlayerPaymentMethods,
  getPlayerPayouts,
  getPlayerWalletDeposits,
  getWalletPaymentSettings,
} from '@/services/walletService';
import { WalletOverview, WalletPaymentSettings } from '@/types/wallet';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Wallet & Payouts | Player Dashboard',
  description: 'Deposit funds via QR & UPI, view tournament prize earnings, and track manual payout settlements.',
};

export default async function PlayerWalletPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect('/auth/login?error=unauthorized');
  }

  const supabase = await createClient();

  const defaultOverview: WalletOverview = {
    availableBalancePaise: 0,
    availableBalanceInr: 0,
    lockedBalancePaise: 0,
    lockedBalanceInr: 0,
    totalDepositedPaise: 0,
    totalDepositedInr: 0,
    walletStatus: 'active',
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

  const defaultSettings: WalletPaymentSettings = {
    upiQrImageUrl: '',
    upiId: 'efootball.arena@upi',
    upiPhoneNumber: '+91 98765 43210',
    accountHolderName: 'eFootball Arena Financial Desk',
    instructions: '1. Scan QR code or copy UPI ID.\n2. Complete transfer using any UPI app.\n3. Note 12-digit UTR and upload receipt screenshot.',
    minDepositInr: 10,
    maxDepositInr: 2000,
  };

  // Fetch player profile, overview, transactions, deposits, and payment settings concurrently
  const [profile, overview, txResult, paymentMethods, payouts, depositsResult, settings] =
    await Promise.all([
      getPlayerProfile(supabase, user.id, user).catch(() => null),
      getPlayerWalletOverview(user.id, supabase).catch(() => defaultOverview),
      getPlayerWalletTransactions(user.id, { page: 1, pageSize: 100 }, supabase).catch(
        () => ({ transactions: [], totalCount: 0 })
      ),
      getPlayerPaymentMethods(user.id, supabase).catch(() => []),
      getPlayerPayouts(user.id, supabase).catch(() => []),
      getPlayerWalletDeposits(user.id, { page: 1, pageSize: 50 }).catch(() => ({
        deposits: [],
        totalCount: 0,
      })),
      getWalletPaymentSettings(supabase).catch(() => defaultSettings),
    ]);

  const safeOverview = overview || defaultOverview;
  const safeTransactions = txResult?.transactions || [];
  const safePaymentMethods = paymentMethods || [];
  const safePayouts = payouts || [];
  const safeDeposits = depositsResult?.deposits || [];
  const safeSettings = settings || defaultSettings;

  return (
    <div className="pb-16">
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
        <PlayerDashboardSwipeWrapper currentSection="wallet">
          <PlayerWalletClientView
            overview={safeOverview}
            transactions={safeTransactions}
            paymentMethods={safePaymentMethods}
            payouts={safePayouts}
            deposits={safeDeposits}
            paymentSettings={safeSettings}
          />
        </PlayerDashboardSwipeWrapper>
      </main>
    </div>
  );
}
