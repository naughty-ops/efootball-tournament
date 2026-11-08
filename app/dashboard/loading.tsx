import React from 'react';

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#08088F] text-white">
      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-8 animate-pulse">
        {/* Header / Hero Skeleton */}
        <div className="rounded-3xl bg-[#1010C5]/60 border border-white/10 p-6 sm:p-8 space-y-4">
          <div className="h-4 w-28 bg-white/20 rounded-full" />
          <div className="h-8 w-64 bg-white/20 rounded-xl" />
          <div className="h-4 w-96 max-w-full bg-white/10 rounded-lg" />
        </div>

        {/* 4 Overview Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-2xl bg-[#1010C5]/40 border border-white/10 p-4 sm:p-5 space-y-3"
            >
              <div className="h-8 w-8 rounded-full bg-white/15" />
              <div className="h-6 w-16 bg-white/25 rounded-md" />
              <div className="h-3 w-24 bg-white/15 rounded-md" />
            </div>
          ))}
        </div>

        {/* Content Section Skeleton */}
        <div className="rounded-3xl bg-[#1010C5]/40 border border-white/10 p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="h-5 w-40 bg-white/20 rounded-md" />
            <div className="h-4 w-20 bg-white/15 rounded-full" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-white/5 border border-white/5" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
