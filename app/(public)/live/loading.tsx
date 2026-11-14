import React from 'react';
import { MatchCardSkeleton } from '@/components/ui/AppSkeletons';

export default function LiveLoading() {
  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto px-2 sm:px-4 font-sans animate-in fade-in duration-150">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2.5">
          <div className="h-3.5 w-3.5 rounded-full bg-[#FF168B]/40 animate-pulse" />
          <div className="h-8 w-44 rounded-xl bg-white/20 animate-pulse" />
        </div>
        <div className="h-8 w-24 rounded-full bg-white/10 animate-pulse" />
      </div>

      {/* Match Cards Skeleton */}
      <MatchCardSkeleton count={4} />
    </div>
  );
}
