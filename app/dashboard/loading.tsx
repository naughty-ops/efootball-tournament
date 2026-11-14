import React from 'react';
import { DashboardStatsSkeleton, TournamentCardSkeleton } from '@/components/ui/AppSkeletons';

export default function DashboardLoading() {
  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 space-y-6 sm:space-y-8 animate-in fade-in duration-150">
      {/* Hero Welcome Skeleton */}
      <div className="rounded-[32px] bg-[#1010C5]/70 border border-white/20 p-6 sm:p-8 lg:p-10 space-y-4 animate-pulse">
        <div className="h-5 w-32 bg-white/20 rounded-full" />
        <div className="h-10 w-72 max-w-full bg-white/25 rounded-2xl" />
        <div className="h-4 w-96 max-w-full bg-white/15 rounded-lg" />
      </div>

      {/* 4 Overview Metric Cards Skeleton */}
      <DashboardStatsSkeleton />

      {/* Recent Tournaments Content Skeleton */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div className="h-6 w-44 bg-white/20 rounded-xl" />
          <div className="h-5 w-24 bg-white/15 rounded-full" />
        </div>
        <TournamentCardSkeleton count={3} />
      </div>
    </main>
  );
}
