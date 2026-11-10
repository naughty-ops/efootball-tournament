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
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WalletOverview } from '@/types/wallet';

interface WalletOverviewCardsProps {
  overview: WalletOverview;
  hasPaymentMethod: boolean;
}

export default function WalletOverviewCards({
  overview,
  hasPaymentMethod,
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

  const totalEarnings = overview?.totalEarningsInr || 0;
  const pendingEarnings = overview?.pendingEarningsInr || 0;
  const availablePayout = overview?.availablePayoutInr || 0;
  const totalPaid = overview?.totalPaidInr || 0;
  const nextPayout = overview?.nextExpectedPayout || null;

  return (
    <div className="space-y-4">
      {/* 5 Financial Overview Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {/* 1. Total Earnings (Confirmed) */}
        <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-lg relative overflow-hidden group hover:border-[#00C853]/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#00C853]/10 rounded-full blur-2xl group-hover:bg-[#00C853]/20 transition-all" />
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-[#00E676]">
                Total Earnings
              </span>
              <div className="h-8 w-8 rounded-xl bg-[#00C853]/15 border border-[#00C853]/30 flex items-center justify-center text-[#00E676]">
                <Trophy className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <div className="text-2xl font-black text-white font-display">
                ₹{totalEarnings.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-white/60 mt-1 font-medium">Confirmed prize entitlement</p>
            </div>
          </CardContent>
        </Card>

        {/* 2. Pending Earnings (Awaiting final approval) */}
        <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-lg relative overflow-hidden group hover:border-amber-400/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all" />
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-300">
                Pending Earnings
              </span>
              <div className="h-8 w-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <div className="text-2xl font-black text-white font-display">
                ₹{pendingEarnings.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-white/60 mt-1 font-medium">Awaiting eligibility approval</p>
            </div>
          </CardContent>
        </Card>

        {/* 3. Available for Payout (Approved reward awaiting payment) */}
        <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-lg relative overflow-hidden group hover:border-[#FFFF00]/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#FFFF00]/10 rounded-full blur-2xl group-hover:bg-[#FFFF00]/20 transition-all" />
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-[#FFFF00]">
                Available Payout
              </span>
              <div className="h-8 w-8 rounded-xl bg-[#FFFF00]/15 border border-[#FFFF00]/30 flex items-center justify-center text-[#FFFF00]">
                <Coins className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <div className="text-2xl font-black text-white font-display">
                ₹{availablePayout.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-white/60 mt-1 font-medium">Approved rewards in payout queue</p>
            </div>
          </CardContent>
        </Card>

        {/* 4. Total Paid (Actual transfer completed & recorded) */}
        <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-lg relative overflow-hidden group hover:border-blue-400/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all" />
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-blue-300">
                Total Paid
              </span>
              <div className="h-8 w-8 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-300">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <div className="text-2xl font-black text-white font-display">
                ₹{totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-white/60 mt-1 font-medium">Completed manual settlements</p>
            </div>
          </CardContent>
        </Card>

        {/* 5. Next Expected Payout (24h SLA Countdown) */}
        <Card className={`border rounded-2xl shadow-lg relative overflow-hidden transition-all ${
          isOverdue
            ? 'bg-gradient-to-br from-[#7A0A0A] to-[#450505] border-red-500/60'
            : nextPayout
            ? 'bg-gradient-to-br from-[#0B0B8C] via-[#0E0EA5] to-[#1212B0] border-[#00C853]/60'
            : 'bg-[#0A0A7A] border-white/20'
        }`}>
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-2xl" />
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-white/90">
                Next Expected Payout
              </span>
              <div className={`h-8 w-8 rounded-xl border flex items-center justify-center ${
                isOverdue
                  ? 'bg-red-500/20 border-red-400 text-red-200'
                  : 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
              }`}>
                <Hourglass className="h-4 w-4 animate-pulse" />
              </div>
            </div>

            <div className="mt-2.5">
              {nextPayout ? (
                <>
                  <div className="text-2xl font-black text-white font-display">
                    ₹{nextPayout.amountInr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="mt-1">
                    <span className={`inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
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
                  <div className="text-base font-black text-white/70 py-1">
                    All Settled
                  </div>
                  <p className="text-[10px] text-white/50 mt-1 font-medium">
                    No rewards currently awaiting payout transfer
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
                You haven&apos;t configured a payout channel yet. Please add your Bank Account or Google Pay / UPI ID in your Profile so tournament winnings can be transferred within 24 hours.
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
