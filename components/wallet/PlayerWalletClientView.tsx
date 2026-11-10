'use client';

import React from 'react';
import {
  Wallet,
  TrendingUp,
  Receipt,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  WalletOverview,
  WalletTransactionItem,
  PlayerPaymentMethod,
  PayoutTransactionRecord,
} from '@/types/wallet';
import WalletOverviewCards from './WalletOverviewCards';
import WalletPerformanceChart from './WalletPerformanceChart';
import PlayerPayoutsTracker from './PlayerPayoutsTracker';
import WalletTransactionsTable from './WalletTransactionsTable';

interface PlayerWalletClientViewProps {
  overview: WalletOverview;
  transactions: WalletTransactionItem[];
  paymentMethods: PlayerPaymentMethod[];
  payouts: PayoutTransactionRecord[];
}

export default function PlayerWalletClientView({
  overview,
  transactions,
  paymentMethods,
  payouts,
}: PlayerWalletClientViewProps) {
  const hasPaymentMethod = paymentMethods.length > 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Page Title & Subtitle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#00C853]/15 text-[#00E676] border border-[#00C853]/30">
              Financial Intelligence Hub
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white font-display uppercase tracking-wide mt-1">
            Player Earnings & Payouts
          </h1>
          <p className="text-xs sm:text-sm text-white/60">
            Track confirmed tournament prize earnings, view performance analytics, and monitor direct 24-hour payouts.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-white/80 bg-[#0A0A7A] px-3 py-1.5 rounded-xl border border-white/15 shadow-sm">
          <ShieldCheck className="h-4 w-4 text-[#FFFF00]" />
          <span>Server-Authoritative Ledger</span>
        </div>
      </div>

      {/* 1. Financial Overview (5 Cards: Total Earnings, Pending, Available, Total Paid, Next Expected Payout) */}
      <WalletOverviewCards
        overview={overview}
        hasPaymentMethod={hasPaymentMethod}
      />

      {/* 2. Earnings & Payout Performance Analytics (Day / Week / Month Filters) */}
      <WalletPerformanceChart transactions={transactions} />

      {/* 3. Direct Payout SLA Tracker (24-Hour Countdown, Status, UTR) */}
      <PlayerPayoutsTracker payouts={payouts} />

      {/* 4. Complete Earnings Ledger & Transaction History */}
      <WalletTransactionsTable initialTransactions={transactions} />
    </div>
  );
}
