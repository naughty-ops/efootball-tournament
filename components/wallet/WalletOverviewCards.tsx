'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Trophy,
  Clock,
  CheckCircle2,
  Coins,
  ArrowRight,
  AlertTriangle,
  Sparkles,
  Hourglass,
  ExternalLink,
  Wallet,
  Lock,
  ArrowDownLeft,
  PlusCircle,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WalletOverview } from '@/types/wallet';

interface WalletOverviewCardsProps {
  overview: WalletOverview;
  hasPaymentMethod: boolean;
  onAddMoneyClick?: () => void;
  onRedeemClick?: () => void;
}

export default function WalletOverviewCards({
  overview,
  hasPaymentMethod,
  onAddMoneyClick,
  onRedeemClick,
}: WalletOverviewCardsProps) {
  // Live SLA countdown ticker for Next Expected Payout
  const [countdownText, setCountdownText] = useState<string>('');
  const [isOverdue, setIsOverdue] = useState<boolean>(false);

  useEffect(() => {
    if (!overview?.nextExpectedPayout?.deadlineAt) {
      setCountdownText('');
      return;
    }

    const targetTime = new Date(overview.nextExpectedPayout.deadlineAt).getTime();

    const updateCountdown = () => {
      const now = Date.now();
      const diffMs = targetTime - now;

      if (diffMs <= 0) {
        setIsOverdue(true);
        setCountdownText('Processing in progress — payout underway');
      } else {
        setIsOverdue(false);
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setCountdownText(`Payout expected within ${hours}h ${minutes}m`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // update every minute
    return () => clearInterval(interval);
  }, [overview?.nextExpectedPayout?.deadlineAt]);

  const availableBalance = overview?.availableBalanceInr || 0;
  const lockedBalance = overview?.lockedBalanceInr || 0;
  const totalDeposited = overview?.totalDepositedInr || 0;
  const totalEarnings = overview?.totalEarningsInr || 0;
  const availablePayout = overview?.availablePayoutInr || 0;
  const totalPaid = overview?.totalPaidInr || 0;
  const nextPayout = overview?.nextExpectedPayout || null;

  return (
    <div className="space-y-4">
      {/* SECTION A: Featured Primary Wallet Balance Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0E0EA5] via-[#1212B0] to-[#0A0A7A] border border-white/20 p-4 sm:p-6 lg:p-7 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#FFFF00]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-60 h-60 bg-[#00C853]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6">
          {/* Balance Details */}
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-[#FFFF00]/20 text-[#FFFF00] border border-[#FFFF00]/40 flex items-center gap-1.5 shrink-0">
                <Wallet className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                Active Wallet Balance
              </span>
              <span className="text-[11px] text-white/60 font-medium hidden sm:inline">
                Instant UPI deposit & escrow support
              </span>
            </div>

            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl sm:text-4xl lg:text-5xl font-black text-white font-display tracking-tight">
                ₹{availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-bold text-[#00E676] bg-[#00C853]/15 px-2.5 py-0.5 rounded-full border border-[#00C853]/30 shrink-0">
                Ready to Join
              </span>
            </div>

            {/* Quick Meta Breakdown Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-white/70">
              <div className="flex items-center gap-1.5 bg-black/25 px-2.5 py-1 rounded-lg border border-white/10">
                <Lock className="h-3.5 w-3.5 text-amber-300 shrink-0" />
                <span className="text-white/60">Locked: </span>
                <span className="font-bold text-white">
                  ₹{lockedBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center gap-1.5 bg-black/25 px-2.5 py-1 rounded-lg border border-white/10">
                <ArrowDownLeft className="h-3.5 w-3.5 text-[#00E676] shrink-0" />
                <span className="text-white/60">Deposited: </span>
                <span className="font-bold text-white">
                  ₹{totalDeposited.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center gap-1.5 bg-black/25 px-2.5 py-1 rounded-lg border border-white/10">
                <Trophy className="h-3.5 w-3.5 text-[#FFFF00] shrink-0" />
                <span className="text-white/60">Earnings: </span>
                <span className="font-bold text-white">
                  ₹{totalEarnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 shrink-0 flex-wrap">
            {onAddMoneyClick && (
              <Button
                onClick={onAddMoneyClick}
                className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs sm:text-sm uppercase tracking-wider rounded-2xl h-11 sm:h-12 px-5 sm:px-6 gap-2 shadow-xl shadow-yellow-500/20 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                <PlusCircle className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                <span>Add Money (QR / UPI)</span>
              </Button>
            )}
            {onRedeemClick && (
              <Button
                onClick={onRedeemClick}
                variant="outline"
                className="border-[#00E676]/40 bg-[#00E676]/15 hover:bg-[#00E676]/25 text-[#00E676] font-black text-xs sm:text-sm uppercase tracking-wider rounded-2xl h-11 sm:h-12 px-5 sm:px-6 gap-2 shadow-lg transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                <Coins className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-[#00E676]" />
                <span>Redeem Amount</span>
              </Button>
            )}
            <Button
              asChild
              variant="outline"
              className="border-white/20 bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-wider rounded-2xl h-11 sm:h-12 px-4 sm:px-5 gap-1.5 cursor-pointer"
            >
              <Link href="/tournaments">
                <span>Tournaments</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Responsive Secondary Cards Grid: 2 cols on mobile (card 5 spans 2), 3 cols on tablet, 5 cols on large desktop */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-3.5">
        {/* 1. Total Earnings */}
        <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-lg relative overflow-hidden group hover:border-[#00C853]/50 transition-all flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#00C853]/10 rounded-full blur-2xl group-hover:bg-[#00C853]/20 transition-all pointer-events-none" />
          <CardContent className="p-3.5 sm:p-4 flex flex-col justify-between h-full space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#00E676] truncate pr-1">
                Total Earnings
              </span>
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-[#00C853]/15 border border-[#00C853]/30 flex items-center justify-center text-[#00E676] shrink-0">
                <Trophy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-black text-white font-display truncate">
                ₹{totalEarnings.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-white/60 font-medium truncate mt-0.5">
                Confirmed prize winnings
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 2. Total Deposited */}
        <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-lg relative overflow-hidden group hover:border-cyan-400/50 transition-all flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all pointer-events-none" />
          <CardContent className="p-3.5 sm:p-4 flex flex-col justify-between h-full space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-cyan-300 truncate pr-1">
                Total Deposited
              </span>
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300 shrink-0">
                <ArrowDownLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-black text-white font-display truncate">
                ₹{totalDeposited.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-white/60 font-medium truncate mt-0.5">
                Verified manual deposits
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 3. Locked Escrow */}
        <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-lg relative overflow-hidden group hover:border-amber-400/50 transition-all flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all pointer-events-none" />
          <CardContent className="p-3.5 sm:p-4 flex flex-col justify-between h-full space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-amber-300 truncate pr-1">
                Locked Escrow
              </span>
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300 shrink-0">
                <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-black text-white font-display truncate">
                ₹{lockedBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-white/60 font-medium truncate mt-0.5">
                Active tournament entries
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 4. Total Paid */}
        <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-lg relative overflow-hidden group hover:border-blue-400/50 transition-all flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all pointer-events-none" />
          <CardContent className="p-3.5 sm:p-4 flex flex-col justify-between h-full space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-blue-300 truncate pr-1">
                Total Paid
              </span>
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-300 shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-black text-white font-display truncate">
                ₹{totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-white/60 font-medium truncate mt-0.5">
                Completed settlements
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 5. Next Expected Payout (Spans 2 columns on mobile/tablet for comfortable breathing room) */}
        <Card className={`col-span-2 md:col-span-2 xl:col-span-1 border rounded-2xl shadow-lg relative overflow-hidden transition-all flex flex-col justify-between ${
          isOverdue
            ? 'bg-gradient-to-br from-[#7A0A0A] to-[#450505] border-red-500/60'
            : nextPayout
            ? 'bg-gradient-to-br from-[#0B0B8C] via-[#0E0EA5] to-[#1212B0] border-[#00C853]/60'
            : 'bg-[#0A0A7A] border-white/20'
        }`}>
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-2xl pointer-events-none" />
          <CardContent className="p-3.5 sm:p-4 flex flex-col justify-between h-full space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-white/90 truncate pr-1">
                Next Expected Payout
              </span>
              <div className={`h-7 w-7 sm:h-8 sm:w-8 rounded-xl border flex items-center justify-center shrink-0 ${
                isOverdue
                  ? 'bg-red-500/20 border-red-400 text-red-200'
                  : 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
              }`}>
                <Hourglass className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-pulse" />
              </div>
            </div>

            <div>
              {nextPayout ? (
                <>
                  <div className="text-xl sm:text-2xl font-black text-white font-display truncate">
                    ₹{nextPayout.amountInr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="mt-1">
                    <span className={`inline-block text-[9px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded-full border truncate max-w-full ${
                      isOverdue
                        ? 'bg-red-500/20 border-red-400 text-red-200'
                        : 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    }`}>
                      {countdownText || '24h SLA Active'}
                    </span>
                  </div>
                  <p className="text-[10px] text-white/60 mt-1 truncate">
                    {nextPayout.tournamentName}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-base sm:text-lg font-black text-white/70 py-0.5 truncate">
                    All Settled
                  </div>
                  <p className="text-[10px] text-white/50 font-medium truncate mt-0.5">
                    No active payouts pending transfer
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advisory Banner: When user has not configured payment details */}
      {!hasPaymentMethod && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border-2 border-amber-400/40 text-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-white uppercase tracking-wider">
                Payout Method Required
              </h4>
              <p className="text-xs text-white/80">
                You haven&apos;t configured a payout channel yet. Please add your Bank Account or UPI ID in your Profile so tournament winnings can be transferred within 24 hours.
              </p>
            </div>
          </div>

          <Button
            asChild
            size="sm"
            className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-xl h-10 px-5 gap-1.5 shrink-0 shadow-md cursor-pointer"
          >
            <Link href="/dashboard/profile#payment-details">
              <span>Add Payout Details</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
