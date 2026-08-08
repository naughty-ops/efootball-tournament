'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Trophy, Menu, X, Flame } from 'lucide-react';
import PublicNav from './PublicNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function PublicHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-white/90 backdrop-blur-md transition-all">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Left: Brand / Logo */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-md shadow-primary/20 group-hover:scale-105 transition-transform">
              <Trophy className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-lg tracking-tight text-[#0B3323] leading-none">
                eFootball
              </span>
              <span className="text-[10px] font-bold tracking-wider text-primary uppercase mt-0.5">
                Tournaments
              </span>
            </div>
          </Link>
        </div>

        {/* Center: Desktop Navigation Items */}
        <div className="hidden md:flex flex-1 justify-center items-center px-4">
          <PublicNav />
        </div>

        {/* Right: Balanced Info / Live Indicator */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          <Badge variant="efootball" className="gap-1.5 py-1 px-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold text-[#0B3323]">eSports Live</span>
          </Badge>
        </div>

        {/* Mobile Hamburger Toggle Button */}
        <div className="flex md:hidden items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close Menu' : 'Open Menu'}
            className="text-[#0B3323] hover:bg-secondary/80 touch-target rounded-xl"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6 text-primary" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </Button>
        </div>

      </div>

      {/* Mobile Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 top-16 z-40 bg-black/40 backdrop-blur-xs md:hidden animate-in fade-in duration-200"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Animated Dropdown Drawer */}
      {mobileMenuOpen && (
        <div className="absolute top-16 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-b border-border shadow-2xl p-5 md:hidden animate-in slide-in-from-top-3 duration-250">
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-border/50">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Navigation Menu
            </span>
            <Badge variant="efootball" className="gap-1 text-[11px]">
              <Flame className="h-3 w-3 text-primary" />
              eFootball Hub
            </Badge>
          </div>

          {/* Mobile Nav Links */}
          <PublicNav isMobile onItemClick={() => setMobileMenuOpen(false)} />
        </div>
      )}
    </header>
  );
}
