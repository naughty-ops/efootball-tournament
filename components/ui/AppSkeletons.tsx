import React from 'react';
import { cn } from '@/lib/utils';

export function TournamentCardSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-[32px] border border-white/15 bg-gradient-to-br from-[#1F1FF0]/40 to-[#1212B8]/40 p-5 sm:p-6 shadow-xl flex flex-col justify-between gap-4 animate-pulse min-h-[280px]"
        >
          {/* Header pill & badge */}
          <div className="flex items-center justify-between gap-2">
            <div className="h-5 w-20 rounded-full bg-white/20" />
            <div className="h-5 w-16 rounded-full bg-[#FFFF00]/20" />
          </div>

          {/* Title and subtitle */}
          <div className="space-y-2 py-2">
            <div className="h-6 w-3/4 rounded-xl bg-white/25" />
            <div className="h-4 w-1/2 rounded-lg bg-white/15" />
          </div>

          {/* Metrics bar */}
          <div className="h-12 w-full rounded-2xl bg-[#08088F]/60 border border-white/10" />

          {/* Action button */}
          <div className="h-11 w-full rounded-full bg-white/20 mt-1" />
        </div>
      ))}
    </div>
  );
}

export function MatchCardSkeleton({ count = 2, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-[28px] border border-white/20 bg-gradient-to-br from-[#1818D4]/50 to-[#1212B8]/50 p-5 sm:p-6 shadow-2xl flex flex-col justify-between gap-5 animate-pulse min-h-[220px]"
        >
          {/* Top Row */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="h-4 w-32 rounded-lg bg-white/20" />
            <div className="h-5 w-16 rounded-full bg-[#FFFF00]/20" />
          </div>

          {/* Competitors & Scoreboard */}
          <div className="h-20 w-full rounded-2xl bg-[#0A0A7A]/70 border border-white/15" />

          {/* Footer Action */}
          <div className="flex items-center justify-between pt-1 border-t border-white/10">
            <div className="h-4 w-24 rounded-lg bg-white/15" />
            <div className="h-9 w-28 rounded-full bg-white/20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardStatsSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4', className)}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-[#1414C8]/50 border border-white/15 animate-pulse space-y-3"
        >
          <div className="h-4 w-20 rounded-md bg-white/20" />
          <div className="h-8 w-14 rounded-lg bg-[#FFFF00]/25" />
          <div className="h-3 w-28 rounded-md bg-white/15" />
        </div>
      ))}
    </div>
  );
}

export function WalletSummarySkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-[32px] bg-[#1212B8]/60 border border-white/20 p-6 sm:p-8 animate-pulse space-y-5', className)}>
      <div className="h-5 w-32 rounded-full bg-white/20" />
      <div className="h-10 w-48 rounded-xl bg-[#00E676]/25" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3">
        <div className="h-14 rounded-2xl bg-[#08088F]/60" />
        <div className="h-14 rounded-2xl bg-[#08088F]/60" />
        <div className="h-14 rounded-2xl bg-[#08088F]/60" />
      </div>
    </div>
  );
}

export function TableRowsSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('rounded-3xl bg-[#1212B8]/40 border border-white/15 p-4 space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 w-full rounded-2xl bg-white/10 animate-pulse flex items-center justify-between px-4"
        >
          <div className="h-4 w-1/3 rounded-lg bg-white/20" />
          <div className="h-4 w-16 rounded-lg bg-white/20" />
        </div>
      ))}
    </div>
  );
}
