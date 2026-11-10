'use client';

import React, { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Landmark,
  Smartphone,
  ShieldCheck,
  Receipt,
  Hourglass,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PayoutTransactionRecord, PayoutStatus } from '@/types/wallet';
import { formatDate } from '@/lib/utils';

interface PlayerPayoutsTrackerProps {
  payouts: PayoutTransactionRecord[];
}

export default function PlayerPayoutsTracker({ payouts }: PlayerPayoutsTrackerProps) {
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const getStatusBadge = (status: PayoutStatus, isOverdue: boolean) => {
    switch (status) {
      case 'PAID':
        return (
          <Badge className="bg-[#00C853]/20 text-[#00E676] border-[#00C853]/40 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            <span>PAID</span>
          </Badge>
        );
      case 'PROCESSING':
        return (
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 animate-pulse">
            <Clock className="h-3 w-3" />
            <span>PROCESSING</span>
          </Badge>
        );
      case 'APPROVED':
      case 'PENDING':
      case 'PENDING_APPROVAL':
        return (
          <Badge className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
            isOverdue
              ? 'bg-red-500/20 text-red-300 border-red-500/40'
              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
          }`}>
            <Hourglass className="h-3 w-3" />
            <span>{isOverdue ? 'ACTION REQUIRED' : 'APPROVED'}</span>
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            <span>FAILED</span>
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            <span>REJECTED</span>
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-xl overflow-hidden text-white">
      <CardHeader className="p-4 sm:p-5 border-b border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base sm:text-lg font-black text-white flex items-center gap-2 font-display uppercase tracking-wider">
            <Receipt className="h-4 w-4 text-[#FFFF00]" />
            <span>Direct Payout SLA Tracker</span>
          </CardTitle>
          <p className="text-xs text-white/60 mt-0.5">
            Monitor real-time settlement progress and 24-hour payout SLA.
          </p>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/30 border border-white/15 text-[11px] font-bold text-white/80">
          <Clock className="h-3.5 w-3.5 text-[#FFFF00]" />
          <span>24-Hour Disbursement SLA</span>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {(payouts || []).length === 0 ? (
          <div className="py-12 px-4 text-center">
            <Receipt className="h-10 w-10 text-white/30 mx-auto mb-2" />
            <p className="text-sm font-bold text-white/70">No prize payouts recorded yet.</p>
            <p className="text-xs text-white/40 mt-1 max-w-sm mx-auto">
              When you earn tournament podium placements, prize entitlements are automatically approved and disbursed directly to your registered bank account or UPI within 24 hours.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {payouts.map((p) => {
              const deadlineMs = p.deadlineAt ? new Date(p.deadlineAt).getTime() : new Date(p.createdAt).getTime() + 24 * 3600 * 1000;
              const diffMs = deadlineMs - nowMs;
              const isOverdue = diffMs <= 0 && p.payoutStatus !== 'PAID' && p.payoutStatus !== 'REJECTED';
              const hoursLeft = Math.floor(diffMs / (1000 * 60 * 60));
              const minutesLeft = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

              return (
                <div key={p.id} className="p-4 sm:p-5 hover:bg-white/5 transition-colors space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0 text-[#FFFF00]">
                        {p.paymentMethodType === 'upi' ? (
                          <Smartphone className="h-5 w-5" />
                        ) : (
                          <Landmark className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-black text-white">
                            {p.tournamentName || 'Tournament Prize'}
                          </h4>
                          {p.positionTitle && (
                            <span className="text-[10px] font-bold text-[#FFFF00] px-2 py-0.5 rounded-md bg-white/10">
                              {p.positionTitle}
                            </span>
                          )}
                          {getStatusBadge(p.payoutStatus, isOverdue)}
                        </div>
                        <p className="text-xs text-white/60 mt-0.5 font-mono">
                          Ref: <span className="text-white/80 font-bold">{p.payoutReference}</span>
                        </p>
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      <div className="text-xl font-black text-white font-display text-emerald-400">
                        ₹{Number(p.amountInr).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <span className="text-[11px] text-white/50 block">
                        via {p.paymentMethodType === 'upi' ? 'Google Pay / UPI' : 'Bank Transfer'}
                      </span>
                    </div>
                  </div>

                  {/* 24-Hour SLA Countdown & Settlement Info Banner */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-white/5 text-xs">
                    {/* Eligibility & Deadline */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">
                        Eligibility Date
                      </span>
                      <span className="text-white/80 font-medium">
                        {p.eligibleAt ? formatDate(p.eligibleAt) : formatDate(p.createdAt)}
                      </span>
                    </div>

                    {/* SLA Status Countdown */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">
                        Payout SLA Status
                      </span>
                      {p.payoutStatus === 'PAID' ? (
                        <span className="text-[#00E676] font-bold flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Completed {p.paidAt ? formatDate(p.paidAt) : ''}</span>
                        </span>
                      ) : p.payoutStatus === 'FAILED' ? (
                        <span className="text-rose-300 font-bold flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" />
                          <span>Payment attempt failed</span>
                        </span>
                      ) : isOverdue ? (
                        <span className="text-amber-300 font-bold flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-amber-400" />
                          <span>Processing in progress — payout underway</span>
                        </span>
                      ) : (
                        <span className="text-[#FFFF00] font-bold flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-[#FFFF00]" />
                          <span>Payout expected within {hoursLeft}h {minutesLeft}m</span>
                        </span>
                      )}
                    </div>

                    {/* Destination */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">
                        Payout Destination
                      </span>
                      <span className="text-white/80 font-mono text-[11px]">
                        {p.paymentDetails?.maskedAccountNumber ||
                          p.paymentDetails?.upiId ||
                          (p.paymentMethodType === 'upi' ? 'Google Pay / UPI' : 'Bank Transfer')}
                      </span>
                    </div>
                  </div>

                  {/* Failure / Issue Explanation if FAILED */}
                  {p.payoutStatus === 'FAILED' && p.failureReason && (
                    <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs">
                      <span className="font-bold text-white">Status Note: </span>
                      <span>{p.failureReason}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
