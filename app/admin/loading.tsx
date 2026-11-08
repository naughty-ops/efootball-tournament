import React from 'react';

export default function AdminLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Banner Skeleton */}
      <div className="rounded-3xl bg-[#1010C5]/60 border border-white/10 p-6 space-y-3">
        <div className="h-4 w-32 bg-white/20 rounded-full" />
        <div className="h-7 w-60 bg-white/25 rounded-xl" />
        <div className="h-4 w-80 max-w-full bg-white/10 rounded-lg" />
      </div>

      {/* Grid of Metric / Queue Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl bg-[#1010C5]/40 border border-white/10 p-5 space-y-3">
            <div className="h-7 w-7 rounded-lg bg-white/20" />
            <div className="h-8 w-20 bg-white/30 rounded-lg" />
            <div className="h-3 w-28 bg-white/15 rounded-md" />
          </div>
        ))}
      </div>

      {/* Table / List Skeleton */}
      <div className="rounded-3xl bg-[#1010C5]/40 border border-white/10 p-6 space-y-4">
        <div className="h-5 w-48 bg-white/20 rounded-md" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5 border border-white/5" />
          ))}
        </div>
      </div>
    </div>
  );
}
