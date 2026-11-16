'use client';

import React, { useState } from 'react';
import {
  Wallet,
  TrendingUp,
  Receipt,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowUpRight,
  History,
  Layers,
  PlusCircle,
} from 'lucide-react';
import {
  WalletOverview,
  WalletTransactionItem,
  PlayerPaymentMethod,
  PayoutTransactionRecord,
  WalletDepositRecord,
  WalletPaymentSettings,
} from '@/types/wallet';
import WalletOverviewCards from './WalletOverviewCards';
import WalletPerformanceChart from './WalletPerformanceChart';
import PlayerPayoutsTracker from './PlayerPayoutsTracker';
import PlayerDepositsTracker from './PlayerDepositsTracker';
import WalletTransactionsTable from './WalletTransactionsTable';
import AddMoneyModal from './AddMoneyModal';
import RedeemAmountModal from './RedeemAmountModal';
import { Button } from '@/components/ui/button';
import { Coins } from 'lucide-react';

interface PlayerWalletClientViewProps {
  overview: WalletOverview;
  transactions: WalletTransactionItem[];
  paymentMethods: PlayerPaymentMethod[];
  payouts: PayoutTransactionRecord[];
  deposits?: WalletDepositRecord[];
  paymentSettings: WalletPaymentSettings;
}

export type WalletTab = 'overview' | 'deposits' | 'payouts' | 'ledger';

export default function PlayerWalletClientView({
  overview,
  transactions = [],
  paymentMethods = [],
  payouts = [],
  deposits = [],
  paymentSettings,
}: PlayerWalletClientViewProps) {
  const [activeTab, setActiveTab] = useState<WalletTab>('overview');
  const [isAddMoneyOpen, setIsAddMoneyOpen] = useState(false);
  const [isRedeemOpen, setIsRedeemOpen] = useState(false);

  const safePaymentMethods = paymentMethods || [];
  const safeTransactions = transactions || [];
  const safePayouts = payouts || [];
  const safeDeposits = deposits || [];
  const hasPaymentMethod = safePaymentMethods.length > 0;

  const underReviewDepositsCount = safeDeposits.filter(
    (d) => d.status === 'under_review'
  ).length;

  return (
    <div className="space-y-6 pb-12 w-full max-w-full min-w-0">
      {/* Page Title & Subtitle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#00C853]/15 text-[#00E676] border border-[#00C853]/30">
              Financial Intelligence Hub
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white font-display uppercase tracking-wide mt-1 truncate">
            Player Wallet & Payouts
          </h1>
          <p className="text-xs sm:text-sm text-white/60">
            Deposit funds with instant QR & UPI verification, track tournament prize earnings, and monitor direct 24-hour payouts.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto flex-wrap">
          <Button
            onClick={() => setIsAddMoneyOpen(true)}
            className="flex-1 sm:flex-none bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-xl h-10 px-4 gap-2 shadow-lg shadow-yellow-500/20 active:scale-95 transition-all cursor-pointer"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Add Money</span>
          </Button>

          <Button
            onClick={() => setIsRedeemOpen(true)}
            variant="outline"
            className="flex-1 sm:flex-none bg-[#00E676]/15 hover:bg-[#00E676]/25 border-[#00E676]/40 text-[#00E676] font-black text-xs uppercase tracking-wider rounded-xl h-10 px-4 gap-2 shadow-md active:scale-95 transition-all cursor-pointer"
          >
            <Coins className="h-4 w-4 text-[#00E676]" />
            <span>Redeem Amount</span>
          </Button>

          <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-white/80 bg-[#0A0A7A] px-3 py-2 rounded-xl border border-white/15 shadow-sm shrink-0">
            <ShieldCheck className="h-4 w-4 text-[#FFFF00]" />
            <span>Server-Authoritative Ledger</span>
          </div>
        </div>
      </div>

      {/* 1. Financial Overview Cards (Active Wallet Balance + Secondary Metrics) */}
      <WalletOverviewCards
        overview={overview}
        hasPaymentMethod={hasPaymentMethod}
        onAddMoneyClick={() => setIsAddMoneyOpen(true)}
        onRedeemClick={() => setIsRedeemOpen(true)}
      />

      {/* Section Tab Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-white/10 -mx-1 px-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer shrink-0 ${
            activeTab === 'overview'
              ? 'bg-[#FFFF00] text-[#08088F] shadow-md font-black'
              : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          <span>Analytics & Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('deposits')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer relative shrink-0 ${
            activeTab === 'deposits'
              ? 'bg-[#FFFF00] text-[#08088F] shadow-md font-black'
              : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
          }`}
        >
          <ArrowUpRight className="h-4 w-4" />
          <span>Deposit Requests</span>
          {underReviewDepositsCount > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeTab === 'deposits'
                  ? 'bg-[#08088F] text-[#FFFF00]'
                  : 'bg-amber-400 text-[#08088F]'
              }`}
            >
              {underReviewDepositsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('payouts')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer shrink-0 ${
            activeTab === 'payouts'
              ? 'bg-[#FFFF00] text-[#08088F] shadow-md font-black'
              : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
          }`}
        >
          <Receipt className="h-4 w-4" />
          <span>Prize Payouts (24h SLA)</span>
          {safePayouts.length > 0 && (
            <span className="text-[10px] opacity-70">({safePayouts.length})</span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('ledger')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer shrink-0 ${
            activeTab === 'ledger'
              ? 'bg-[#FFFF00] text-[#08088F] shadow-md font-black'
              : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
          }`}
        >
          <History className="h-4 w-4" />
          <span>Complete Ledger</span>
          {safeTransactions.length > 0 && (
            <span className="text-[10px] opacity-70">({safeTransactions.length})</span>
          )}
        </button>
      </div>

      {/* Tab Panels with stable min-height to prevent layout collapse and page jumping */}
      <div className="min-h-[420px]">
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Earnings & Payout Performance Analytics (Day / Week / Month Filters) */}
            <WalletPerformanceChart transactions={safeTransactions} />

            {/* Quick Peek: Recent Deposits & Payouts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <ArrowUpRight className="h-4 w-4 text-[#00E676]" />
                    Recent Deposits
                  </h3>
                  <button
                    onClick={() => setActiveTab('deposits')}
                    className="text-xs text-[#FFFF00] hover:underline font-bold cursor-pointer"
                  >
                    View All
                  </button>
                </div>
                <PlayerDepositsTracker
                  deposits={safeDeposits.slice(0, 3)}
                  onAddMoneyClick={() => setIsAddMoneyOpen(true)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-[#FFFF00]" />
                    Recent Payouts
                  </h3>
                  <button
                    onClick={() => setActiveTab('payouts')}
                    className="text-xs text-[#FFFF00] hover:underline font-bold cursor-pointer"
                  >
                    View All
                  </button>
                </div>
                <PlayerPayoutsTracker
                  payouts={safePayouts.slice(0, 3)}
                  onRedeemClick={() => setIsRedeemOpen(true)}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'deposits' && (
          <div className="animate-in fade-in duration-200">
            <PlayerDepositsTracker
              deposits={safeDeposits}
              onAddMoneyClick={() => setIsAddMoneyOpen(true)}
            />
          </div>
        )}

        {activeTab === 'payouts' && (
          <div className="animate-in fade-in duration-200">
            <PlayerPayoutsTracker
              payouts={safePayouts}
              onRedeemClick={() => setIsRedeemOpen(true)}
            />
          </div>
        )}

        {activeTab === 'ledger' && (
          <div className="animate-in fade-in duration-200">
            <WalletTransactionsTable initialTransactions={safeTransactions} />
          </div>
        )}
      </div>

      {/* Add Money Modal (QR Code + Manual UPI Transfer + UTR Claim) */}
      <AddMoneyModal
        isOpen={isAddMoneyOpen}
        onClose={() => setIsAddMoneyOpen(false)}
        currentAvailableInr={overview?.availableBalanceInr || 0}
        paymentSettings={paymentSettings}
        onDepositSuccess={() => {
          // Switch to deposits tab to view review status
          setActiveTab('deposits');
        }}
      />

      {/* Redeem Amount Modal (Locks Balance + Generates Support Ticket + Payout 24h SLA) */}
      <RedeemAmountModal
        isOpen={isRedeemOpen}
        onClose={() => setIsRedeemOpen(false)}
        availableBalanceInr={overview?.availableBalanceInr || 0}
        paymentMethods={safePaymentMethods}
        onRedeemSuccess={() => {
          setActiveTab('payouts');
        }}
      />
    </div>
  );
}
