'use client';

import React from 'react';
import { Trophy, Medal, Sparkles, Award } from 'lucide-react';
import { calculatePrizeSplit } from '@/lib/utils';
import { cn } from '@/lib/utils';

export interface TournamentPrizeShowcaseProps {
  prizePoolPaise?: number | null;
  currency?: string;
  isCompleted?: boolean;
  championName?: string | null;
  runnerUpName?: string | null;
  variant?: 'card' | 'banner' | 'chip';
  className?: string;
}

export function TournamentPrizeShowcase({
  prizePoolPaise = 0,
  isCompleted = false,
  championName,
  runnerUpName,
  variant = 'card',
  className,
}: TournamentPrizeShowcaseProps) {
  const split = calculatePrizeSplit(prizePoolPaise || 0);

  // 1. CHIP VARIANT (For Hero Banners and Registration Header)
  if (variant === 'chip') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm backdrop-blur-md transition-all select-none',
          split.hasPrizeMoney
            ? 'bg-amber-400/20 border-amber-300/40 text-amber-200'
            : 'bg-white/10 border-white/20 text-[#D9DCFF]',
          className
        )}
        title="Total prize money distributed to champions / runners up."
      >
        <Trophy className={cn('h-3.5 w-3.5', split.hasPrizeMoney ? 'text-[#FFFF00]' : 'text-white/70')} />
        <div className="flex items-center gap-1.5 text-xs font-black tracking-wide font-display uppercase">
          <span className="text-[10px] text-white/70 font-bold">Prize Pool:</span>
          <span className={split.hasPrizeMoney ? 'text-[#FFFF00] font-black' : 'text-white font-bold'}>
            {split.hasPrizeMoney ? split.formattedTotal : 'Trophy & Glory'}
          </span>
        </div>
      </div>
    );
  }

  // 2. CARD VARIANT (For TournamentCard.tsx inside grid lists)
  if (variant === 'card') {
    return (
      <div
        className={cn(
          'rounded-xl p-2.5 backdrop-blur-md border transition-all space-y-1.5 overflow-hidden',
          split.hasPrizeMoney
            ? 'bg-gradient-to-r from-amber-500/15 via-[#1818D4]/40 to-emerald-500/15 border-amber-400/30'
            : 'bg-black/30 border-white/10',
          className
        )}
      >
        {/* Showcase Header */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-300">
            <Trophy className="h-3 w-3 text-[#FFFF00] shrink-0" />
            <span>Prize Pool</span>
          </div>
          <span
            className={cn(
              'font-black font-display text-xs tracking-wide',
              split.hasPrizeMoney ? 'text-[#FFFF00]' : 'text-white/80'
            )}
          >
            {split.hasPrizeMoney ? split.formattedTotal : 'Trophy & Glory'}
          </span>
        </div>

        {/* Distributed Notice */}
        <p className="text-[9px] text-[#D9DCFF]/80 font-medium leading-tight">
          Total prize money distributed to champions / runners up.
        </p>

        {/* Distribution Pills */}
        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-black/40 border border-amber-400/20 text-[10px]">
            <span className="text-amber-300/90 font-bold flex items-center gap-1">
              <Trophy className="h-2.5 w-2.5 text-[#FFFF00]" />
              1st
            </span>
            <span className="font-extrabold text-white">
              {split.hasPrizeMoney ? split.formattedChampion : '70%'}
            </span>
          </div>
          <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-black/40 border border-white/10 text-[10px]">
            <span className="text-slate-300 font-bold flex items-center gap-1">
              <Medal className="h-2.5 w-2.5 text-slate-300" />
              2nd
            </span>
            <span className="font-extrabold text-white">
              {split.hasPrizeMoney ? split.formattedRunnerUp : '30%'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 3. BANNER VARIANT (For PublicOverviewTab & Admin Tournament Details)
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[28px] p-6 sm:p-7 border shadow-xl text-white space-y-5',
        split.hasPrizeMoney
          ? 'bg-gradient-to-br from-[#1010C5] via-[#0A0A7A] to-[#1818D4] border-amber-400/40'
          : 'bg-[#1818D4] border-white/20',
        className
      )}
    >
      {/* Decorative Gold Glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header & Total Showcase */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/15 pb-5 relative z-10">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-[#FFFF00] text-[#08088F] font-black text-[10px] uppercase tracking-widest px-3 py-0.5 rounded-full shadow-xs flex items-center gap-1">
              <Trophy className="h-3 w-3 text-[#08088F]" />
              <span>Official Prize Showcase</span>
            </span>
            {split.hasPrizeMoney && (
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Cash Pool
              </span>
            )}
          </div>
          <h3 className="text-xl sm:text-2xl font-black font-display uppercase tracking-wider text-white">
            Tournament Prize Pool
          </h3>
          <p className="text-xs text-[#D9DCFF]/90 font-medium leading-relaxed">
            Total prize money distributed to champions / runners up.
          </p>
        </div>

        {/* Large Total Value Box */}
        <div className="flex flex-col sm:items-end justify-center bg-black/30 backdrop-blur-md px-5 py-3 rounded-2xl border border-amber-400/30 shrink-0">
          <span className="text-[10px] font-bold text-amber-300 uppercase tracking-widest block">
            Total Distributed
          </span>
          <span className="text-2xl sm:text-3xl font-black font-display tracking-tight text-[#FFFF00] drop-shadow-sm">
            {split.hasPrizeMoney ? split.formattedTotal : 'Trophy & Ranking'}
          </span>
        </div>
      </div>

      {/* Distribution Showcase Cards: Champions & Runners Up */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
        {/* Champion / 1st Place Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-amber-500/20 via-[#1818D4] to-[#0A0A7A] border border-amber-400/50 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-black uppercase tracking-wider">
              <div className="h-7 w-7 rounded-lg bg-amber-400/30 border border-amber-300 flex items-center justify-center">
                <Trophy className="h-4 w-4 text-[#FFFF00]" />
              </div>
              <span>🏆 Champion (1st Place)</span>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-amber-950 px-2 py-0.5 rounded-md">
              70% Share
            </span>
          </div>

          <div className="pt-1">
            <div className="text-2xl sm:text-3xl font-black font-display text-white tracking-tight">
              {split.hasPrizeMoney ? split.formattedChampion : 'Championship Trophy'}
            </div>
            <p className="text-[11px] text-[#D9DCFF]/80 font-medium mt-0.5">
              Awarded to the grand final tournament victor.
            </p>
          </div>

          {isCompleted && championName && (
            <div className="pt-2 border-t border-white/10 flex items-center justify-between">
              <span className="text-[10px] font-bold text-white/60 uppercase">Awarded To:</span>
              <span className="text-xs font-black text-[#FFFF00] uppercase font-display truncate">
                {championName}
              </span>
            </div>
          )}
        </div>

        {/* Runner-Up / 2nd Place Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-700/20 via-[#1818D4] to-[#0A0A7A] border border-slate-400/30 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300 text-xs font-black uppercase tracking-wider">
              <div className="h-7 w-7 rounded-lg bg-slate-600/30 border border-slate-400 flex items-center justify-center">
                <Medal className="h-4 w-4 text-slate-200" />
              </div>
              <span>🥈 Runner-Up (2nd Place)</span>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider bg-slate-700 text-slate-200 px-2 py-0.5 rounded-md border border-slate-500">
              30% Share
            </span>
          </div>

          <div className="pt-1">
            <div className="text-2xl sm:text-3xl font-black font-display text-white tracking-tight">
              {split.hasPrizeMoney ? split.formattedRunnerUp : 'Runner-Up Medal'}
            </div>
            <p className="text-[11px] text-[#D9DCFF]/80 font-medium mt-0.5">
              Awarded to the tournament grand final runner-up.
            </p>
          </div>

          {isCompleted && runnerUpName && (
            <div className="pt-2 border-t border-white/10 flex items-center justify-between">
              <span className="text-[10px] font-bold text-white/60 uppercase">Awarded To:</span>
              <span className="text-xs font-black text-slate-200 uppercase font-display truncate">
                {runnerUpName}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
