import React from 'react';

export default function TournamentsLoading() {
  return (
    <div className="space-y-8 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse">
      {/* Header Skeleton */}
      <div className="space-y-3">
        <div className="h-5 w-36 bg-[#FFFF00]/30 rounded-full" />
        <div className="h-9 w-64 bg-white/25 rounded-xl" />
        <div className="h-4 w-96 max-w-full bg-white/10 rounded-md" />
      </div>

      {/* Filter Bar Skeleton */}
      <div className="flex gap-2 py-2 overflow-x-auto">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 w-24 rounded-full bg-white/10 shrink-0" />
        ))}
      </div>

      {/* Tournament Cards Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="rounded-3xl bg-[#1010C5]/40 border border-white/10 p-5 space-y-4 min-h-[220px]"
          >
            <div className="h-5 w-3/4 bg-white/20 rounded-md" />
            <div className="h-4 w-1/2 bg-white/10 rounded-md" />
            <div className="pt-4 flex items-center justify-between border-t border-white/10">
              <div className="h-4 w-20 bg-white/15 rounded-md" />
              <div className="h-8 w-24 bg-[#FFFF00]/20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
