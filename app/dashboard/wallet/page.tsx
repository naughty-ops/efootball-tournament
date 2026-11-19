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
  const [profileRes, overviewRes, txRes, pmRes, payoutsRes, depositsRes, settingsRes] =
    await Promise.allSettled([
      getPlayerProfile(supabase, user.id, user),
      getPlayerWalletOverview(user.id, supabase),
      getPlayerWalletTransactions(user.id, { page: 1, pageSize: 100 }, supabase),
      getPlayerPaymentMethods(user.id, supabase),
      getPlayerPayouts(user.id, supabase),
      getPlayerWalletDeposits(user.id, { page: 1, pageSize: 50 }, supabase),
      getWalletPaymentSettings(supabase),
    ]);

  if (profileRes.status === 'rejected') console.error('[PlayerWalletPage] Profile load error:', profileRes.reason);
  if (overviewRes.status === 'rejected') console.error('[PlayerWalletPage] Overview load error:', overviewRes.reason);
  if (txRes.status === 'rejected') console.error('[PlayerWalletPage] Transactions load error:', txRes.reason);
  if (pmRes.status === 'rejected') console.error('[PlayerWalletPage] Payment methods load error:', pmRes.reason);
  if (payoutsRes.status === 'rejected') console.error('[PlayerWalletPage] Payouts load error:', payoutsRes.reason);
  if (depositsRes.status === 'rejected') console.error('[PlayerWalletPage] Deposits load error:', depositsRes.reason);
  if (settingsRes.status === 'rejected') console.error('[PlayerWalletPage] Settings load error:', settingsRes.reason);

  const safeOverview = overviewRes.status === 'fulfilled' ? overviewRes.value : defaultOverview;
  const safeTransactions = txRes.status === 'fulfilled' ? txRes.value?.transactions || [] : [];
  const safePaymentMethods = pmRes.status === 'fulfilled' ? pmRes.value || [] : [];
  const safePayouts = payoutsRes.status === 'fulfilled' ? payoutsRes.value || [] : [];
  const safeDeposits = depositsRes.status === 'fulfilled' ? depositsRes.value?.deposits || [] : [];
  const safeSettings = settingsRes.status === 'fulfilled' ? settingsRes.value || defaultSettings : defaultSettings;
  const hasFinancialError = overviewRes.status === 'rejected' || txRes.status === 'rejected';

  return (
    <div className="pb-16">
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-4">
        {hasFinancialError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-white flex items-center gap-3">
            <span className="text-red-400 font-bold text-sm">
              Notice: Unable to retrieve your live financial ledger. Displayed figures may be incomplete. Please refresh.
            </span>
          </div>
        )}
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
