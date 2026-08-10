'use client';

import React from 'react';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import PublicNav from './PublicNav';
import { Badge } from '@/components/ui/badge';

export default function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-white/95 backdrop-blur-md shadow-xs transition-all">
      {/* Primary Header Row */}
      <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Left: Brand / Logo */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center gap-2 sm:gap-2.5 group">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-primary text-white shadow-md shadow-primary/20 group-hover:scale-105 transition-transform">
              <Trophy className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-[#0B3323] leading-none">
                eFootball
              </span>
              <span className="text-[9px] sm:text-[10px] font-bold tracking-wider text-primary uppercase mt-0.5">
                Tournaments
              </span>
            </div>
          </Link>
        </div>

        {/* Center: Desktop Navigation Bar (Visible on md+) */}
        <div className="hidden md:flex flex-1 justify-center items-center px-4">
          <PublicNav />
        </div>

        {/* Right: eSports Live Status Indicator */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Badge variant="efootball" className="gap-1.5 py-1 px-2.5 sm:px-3 text-xs font-bold shadow-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[11px] sm:text-xs text-[#0B3323] font-extrabold">eSports Live</span>
          </Badge>
        </div>
      </div>

      {/* Mobile Horizontal Navigation Row (Visible on screens < md) */}
      <div className="md:hidden border-t border-border/50 bg-slate-50/90 px-3 py-1.5 overflow-x-auto no-scrollbar touch-pan-x">
        <div className="mx-auto max-w-7xl">
          <PublicNav />
        </div>
      </div>
    </header>
  );
}
