'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import PublicNav from './PublicNav';
import { Badge } from '@/components/ui/badge';

export default function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-white/95 backdrop-blur-md shadow-xs transition-all">
      {/* Primary Header Row */}
      <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Left: Official Brand Logo */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center group py-1">
            <div className="relative h-9 sm:h-11 w-auto max-w-[200px] flex items-center group-hover:scale-102 transition-transform">
              <Image
                src="/logos/logo-header-light.png"
                alt="eFootball Tournament Logo"
                width={220}
                height={55}
                className="h-full w-auto object-contain"
                priority
              />
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

      {/* Mobile Centered Horizontal Navigation Row (Visible on screens < md) */}
      <div className="md:hidden border-t border-border/50 bg-slate-50/95 backdrop-blur-md px-2 py-1.5 flex items-center justify-center overflow-x-auto no-scrollbar touch-pan-x">
        <div className="w-full max-w-md flex items-center justify-center">
          <PublicNav className="justify-center w-full" />
        </div>
      </div>
    </header>
  );
}
