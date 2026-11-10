'use client';

import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Trophy,
  Coins,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WalletTransactionItem } from '@/types/wallet';

type PerformancePeriod = 'day' | 'week' | 'month';

interface WalletPerformanceChartProps {
  transactions: WalletTransactionItem[];
}

export default function WalletPerformanceChart({ transactions }: WalletPerformanceChartProps) {
  const [period, setPeriod] = useState<PerformancePeriod>('week');
  const [hoveredPoint, setHoveredPoint] = useState<{
    label: string;
    prizesInr: number;
    payoutsInr: number;
  } | null>(null);

  // Compute analytics dynamically from real ledger transactions
  const analytics = useMemo(() => {
    const now = new Date();
    const completedTxs = (transactions || []).filter((tx) => tx.status === 'completed');

    if (period === 'day') {
      // 24 Hourly buckets for Today (00:00 - 23:00)
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const todayEnd = todayStart + 24 * 3600 * 1000;
      const yesterdayStart = todayStart - 24 * 3600 * 1000;

      const hourlyMap = new Map<number, { prizes: number; payouts: number }>();
      for (let h = 0; h < 24; h++) {
        hourlyMap.set(h, { prizes: 0, payouts: 0 });
      }

      let totalPrizes = 0;
      let totalPayouts = 0;
      let yesterdayPrizes = 0;

      for (const tx of completedTxs) {
        const txTime = new Date(tx.createdAt).getTime();
        const amt = Number(tx.amountInr || 0);

        if (txTime >= todayStart && txTime < todayEnd) {
          const hour = new Date(tx.createdAt).getHours();
          const bucket = hourlyMap.get(hour) || { prizes: 0, payouts: 0 };
          if (tx.transactionType === 'TOURNAMENT_PRIZE' || tx.transactionType === 'BONUS_REWARD') {
            bucket.prizes += amt;
            totalPrizes += amt;
          } else if (tx.transactionType === 'PAYOUT_COMPLETED') {
            bucket.payouts += amt;
            totalPayouts += amt;
          }
          hourlyMap.set(hour, bucket);
        } else if (txTime >= yesterdayStart && txTime < todayStart) {
          if (tx.transactionType === 'TOURNAMENT_PRIZE' || tx.transactionType === 'BONUS_REWARD') {
            yesterdayPrizes += amt;
          }
        }
      }

      const points = [];
      for (let h = 0; h < 24; h++) {
        const b = hourlyMap.get(h)!;
        points.push({
          key: `hour-${h}`,
          label: `${String(h).padStart(2, '0')}:00`,
          shortLabel: `${h}h`,
          prizesInr: b.prizes,
          payoutsInr: b.payouts,
        });
      }

      let comparison = null;
      if (yesterdayPrizes > 0) {
        const diff = totalPrizes - yesterdayPrizes;
        const pct = (diff / yesterdayPrizes) * 100;
        comparison = {
          pct: Number(pct.toFixed(1)),
          isPositive: diff >= 0,
          label: 'vs yesterday',
        };
      }

      return {
        totalEarningsInr: totalPrizes,
        totalPayoutsInr: totalPayouts,
        points,
        comparison,
        hasActivity: totalPrizes > 0 || totalPayouts > 0,
        subtext: 'Hourly breakdown of prize rewards won and payouts completed today',
      };
    }

    if (period === 'week') {
      // Last 7 days
      const days = [];
      const dayMap = new Map<string, { prizes: number; payouts: number }>();

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
        const shortDate = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
        days.push({ dateKey, label: `${weekday} ${shortDate}`, shortLabel: weekday });
        dayMap.set(dateKey, { prizes: 0, payouts: 0 });
      }

      const weekStart = new Date(now.getTime() - 7 * 24 * 3600 * 1000).getTime();
      const prevWeekStart = new Date(now.getTime() - 14 * 24 * 3600 * 1000).getTime();

      let totalPrizes = 0;
      let totalPayouts = 0;
      let prevWeekPrizes = 0;

      for (const tx of completedTxs) {
        const txDate = new Date(tx.createdAt);
        const txTime = txDate.getTime();
        const dateKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;
        const amt = Number(tx.amountInr || 0);

        if (dayMap.has(dateKey)) {
          const bucket = dayMap.get(dateKey)!;
          if (tx.transactionType === 'TOURNAMENT_PRIZE' || tx.transactionType === 'BONUS_REWARD') {
            bucket.prizes += amt;
            totalPrizes += amt;
          } else if (tx.transactionType === 'PAYOUT_COMPLETED') {
            bucket.payouts += amt;
            totalPayouts += amt;
          }
        } else if (txTime >= prevWeekStart && txTime < weekStart) {
          if (tx.transactionType === 'TOURNAMENT_PRIZE' || tx.transactionType === 'BONUS_REWARD') {
            prevWeekPrizes += amt;
          }
        }
      }

      const points = days.map((d) => {
        const b = dayMap.get(d.dateKey)!;
        return {
          key: d.dateKey,
          label: d.label,
          shortLabel: d.shortLabel,
          prizesInr: b.prizes,
          payoutsInr: b.payouts,
        };
      });

      let comparison = null;
      if (prevWeekPrizes > 0) {
        const diff = totalPrizes - prevWeekPrizes;
        const pct = (diff / prevWeekPrizes) * 100;
        comparison = {
          pct: Number(pct.toFixed(1)),
          isPositive: diff >= 0,
          label: 'vs previous week',
        };
      }

      return {
        totalEarningsInr: totalPrizes,
        totalPayoutsInr: totalPayouts,
        points,
        comparison,
        hasActivity: totalPrizes > 0 || totalPayouts > 0,
        subtext: 'Daily earnings and completed payouts over the last 7 days',
      };
    }

    // Month: Last 30 Days grouped into 6 5-day intervals or daily points
    const days = [];
    const dayMap = new Map<string, { prizes: number; payouts: number }>();

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      days.push({ dateKey, label, shortLabel: String(d.getDate()) });
      dayMap.set(dateKey, { prizes: 0, payouts: 0 });
    }

    const monthStart = new Date(now.getTime() - 30 * 24 * 3600 * 1000).getTime();
    const prevMonthStart = new Date(now.getTime() - 60 * 24 * 3600 * 1000).getTime();

    let totalPrizes = 0;
    let totalPayouts = 0;
    let prevMonthPrizes = 0;

    for (const tx of completedTxs) {
      const txDate = new Date(tx.createdAt);
      const txTime = txDate.getTime();
      const dateKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;
      const amt = Number(tx.amountInr || 0);

      if (dayMap.has(dateKey)) {
        const bucket = dayMap.get(dateKey)!;
        if (tx.transactionType === 'TOURNAMENT_PRIZE' || tx.transactionType === 'BONUS_REWARD') {
          bucket.prizes += amt;
          totalPrizes += amt;
        } else if (tx.transactionType === 'PAYOUT_COMPLETED') {
          bucket.payouts += amt;
          totalPayouts += amt;
        }
      } else if (txTime >= prevMonthStart && txTime < monthStart) {
        if (tx.transactionType === 'TOURNAMENT_PRIZE' || tx.transactionType === 'BONUS_REWARD') {
          prevMonthPrizes += amt;
        }
      }
    }

    const points = days.map((d) => {
      const b = dayMap.get(d.dateKey)!;
      return {
        key: d.dateKey,
        label: d.label,
        shortLabel: d.shortLabel,
        prizesInr: b.prizes,
        payoutsInr: b.payouts,
      };
    });

    let comparison = null;
    if (prevMonthPrizes > 0) {
      const diff = totalPrizes - prevMonthPrizes;
      const pct = (diff / prevMonthPrizes) * 100;
      comparison = {
        pct: Number(pct.toFixed(1)),
        isPositive: diff >= 0,
        label: 'vs previous 30 days',
      };
    }

    return {
      totalEarningsInr: totalPrizes,
      totalPayoutsInr: totalPayouts,
      points,
      comparison,
      hasActivity: totalPrizes > 0 || totalPayouts > 0,
      subtext: 'Daily trajectory of prize earnings and disbursements over the past 30 days',
    };
  }, [transactions, period]);

  const maxVal = useMemo(() => {
    const highest = Math.max(
      ...analytics.points.map((p) => Math.max(p.prizesInr, p.payoutsInr)),
      50
    );
    return Math.ceil(highest * 1.2);
  }, [analytics.points]);

  return (
    <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-xl overflow-hidden text-white">
      {/* Header */}
      <CardHeader className="p-4 sm:p-5 border-b border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base sm:text-lg font-black text-white flex items-center gap-2 font-display uppercase tracking-wider">
              <TrendingUp className="h-4 w-4 text-[#00E676]" />
              <span>Earnings & Payout Performance</span>
            </CardTitle>
          </div>
          <p className="text-xs text-white/60 mt-0.5">{analytics.subtext}</p>
        </div>

        {/* 3 Filters: Day, Week, Month */}
        <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-white/15 self-stretch sm:self-auto justify-center">
          {(['day', 'week', 'month'] as PerformancePeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPeriod(p);
                setHoveredPoint(null);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                period === p
                  ? 'bg-[#FFFF00] text-[#08088F] shadow-md scale-100'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {p === 'day' ? 'Day' : p === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* KPI Row with Comparison Badge */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-black/25 border border-white/10">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">
              {period === 'day' ? 'Daily Earnings Total' : period === 'week' ? 'Weekly Earnings Total' : 'Monthly Earnings Total'}
            </span>
            <div className="text-xl sm:text-2xl font-black text-[#00E676] font-display mt-0.5">
              ₹{analytics.totalEarningsInr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">
              Payouts Completed
            </span>
            <div className="text-xl sm:text-2xl font-black text-cyan-300 font-display mt-0.5">
              ₹{analytics.totalPayoutsInr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="flex flex-col justify-center">
            {analytics.comparison ? (
              <div className="flex items-center gap-1.5">
                <Badge
                  className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 border flex items-center gap-1 ${
                    analytics.comparison.isPositive
                      ? 'bg-[#00C853]/20 text-[#00E676] border-[#00C853]/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}
                >
                  {analytics.comparison.isPositive ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {analytics.comparison.pct > 0 ? `+${analytics.comparison.pct}%` : `${analytics.comparison.pct}%`}
                  </span>
                </Badge>
                <span className="text-[10px] text-white/60 font-semibold">{analytics.comparison.label}</span>
              </div>
            ) : (
              <span className="text-[11px] text-white/40 italic">
                Baseline period (no prior comparison)
              </span>
            )}
          </div>
        </div>

        {/* Legend & Hover Data Point Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-4 text-xs font-bold">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-[#00E676] shadow-[0_0_8px_rgba(0,230,118,0.5)]" />
              <span className="text-white/80">Prize Earnings</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
              <span className="text-white/80">Settled Payouts</span>
            </div>
          </div>

          {hoveredPoint ? (
            <div className="text-xs font-mono bg-white/10 px-3 py-1 rounded-xl border border-white/20 animate-in fade-in flex items-center gap-2">
              <span className="font-bold text-[#FFFF00]">{hoveredPoint.label}:</span>
              <span className="text-[#00E676]">Prizes: ₹{hoveredPoint.prizesInr}</span>
              <span className="text-white/40">•</span>
              <span className="text-cyan-300">Payouts: ₹{hoveredPoint.payoutsInr}</span>
            </div>
          ) : (
            <span className="text-[11px] text-white/50 italic">Hover or tap any bar for exact figures</span>
          )}
        </div>

        {/* Chart View */}
        {!analytics.hasActivity ? (
          // Clean Empty State
          <div className="py-12 px-4 text-center flex flex-col items-center justify-center bg-black/20 rounded-2xl border border-white/10">
            <div className="h-12 w-12 rounded-2xl bg-[#00C853]/10 border border-[#00C853]/20 flex items-center justify-center text-[#00E676] mb-3">
              <Trophy className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-black text-white uppercase tracking-wider">
              No Financial Activity in this Period
            </h4>
            <p className="text-xs text-white/60 max-w-sm mt-1">
              {period === 'day'
                ? 'No tournament prizes or payouts recorded today yet.'
                : period === 'week'
                ? 'No transactions completed in the last 7 days.'
                : 'No transactions completed in the past 30 days.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Bars Container */}
            <div className="h-56 sm:h-64 flex items-end gap-1 sm:gap-2 pt-6 pb-2 px-1 border-b border-white/15 overflow-x-auto">
              {analytics.points.map((pt) => {
                const prizeHeightPct = Math.min(100, Math.round((pt.prizesInr / maxVal) * 100));
                const payoutHeightPct = Math.min(100, Math.round((pt.payoutsInr / maxVal) * 100));
                const hasValue = pt.prizesInr > 0 || pt.payoutsInr > 0;

                return (
                  <div
                    key={pt.key}
                    onMouseEnter={() => setHoveredPoint(pt)}
                    onClick={() => setHoveredPoint(pt)}
                    className="flex-1 min-w-[14px] sm:min-w-[20px] h-full flex flex-col justify-end items-center group cursor-pointer"
                  >
                    <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-full">
                      {/* Prize Bar */}
                      <div
                        style={{ height: `${Math.max(4, prizeHeightPct)}%` }}
                        className={`w-full max-w-[12px] sm:max-w-[16px] rounded-t-sm transition-all duration-300 ${
                          pt.prizesInr > 0
                            ? 'bg-[#00E676] group-hover:bg-[#00FF85] shadow-[0_0_10px_rgba(0,230,118,0.4)]'
                            : 'bg-white/5'
                        }`}
                      />
                      {/* Payout Bar */}
                      <div
                        style={{ height: `${Math.max(4, payoutHeightPct)}%` }}
                        className={`w-full max-w-[12px] sm:max-w-[16px] rounded-t-sm transition-all duration-300 ${
                          pt.payoutsInr > 0
                            ? 'bg-cyan-400 group-hover:bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.4)]'
                            : 'bg-white/5'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Labels Axis */}
            <div className="flex items-center justify-between text-[10px] text-white/50 font-mono pt-1 px-1">
              {analytics.points.map((pt, idx) => {
                // Show label every few ticks on mobile or month
                const showLabel =
                  period === 'day'
                    ? idx % 4 === 0
                    : period === 'week'
                    ? true
                    : idx % 5 === 0 || idx === analytics.points.length - 1;

                return (
                  <div key={pt.key} className="flex-1 text-center truncate">
                    {showLabel ? pt.shortLabel : ''}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
