'use client';

import React from 'react';

interface KeralaEmptyStateProps {
  title: string;
  description: string;
  icon?: 'live' | 'tournament' | 'match' | 'standings';
  children?: React.ReactNode;
}

export default function KeralaEmptyState({
  title,
  description,
  icon = 'tournament',
  children,
}: KeralaEmptyStateProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-emerald-300/60 bg-gradient-to-br from-white via-emerald-50/30 to-[#F4F8F5] p-8 text-center shadow-xs">
      {/* Subtle Botanical SVG background */}
      <div className="pointer-events-none absolute inset-0 opacity-5 flex items-center justify-center">
        <svg viewBox="0 0 200 200" className="h-64 w-64 text-[#0B3323]">
          <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 8" />
          <path d="M 100 20 Q 140 100 100 180 Q 60 100 100 20 Z" fill="currentColor" />
        </svg>
      </div>

      <div className="relative z-10 max-w-sm mx-auto space-y-3">
        {/* Kerala Botanical Emblem Header */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0B3323] text-emerald-400 shadow-md shadow-[#0B3323]/20 border border-emerald-500/30">
          {icon === 'live' ? (
            <span className="relative flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500" />
            </span>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
              <path d="M12 2L15 8L22 9L17 14L18 21L12 18L6 21L7 14L2 9L9 8L12 2Z" fill="currentColor" fillOpacity="0.2" />
            </svg>
          )}
        </div>

        <h3 className="text-base font-extrabold text-[#0B3323]">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>

        {children && <div className="pt-2">{children}</div>}
      </div>
    </div>
  );
}
