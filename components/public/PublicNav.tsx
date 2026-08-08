'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PUBLIC_NAV_ITEMS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import { getPublicLiveMatches } from '@/services/publicTournamentService';
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches';

interface PublicNavProps {
  onItemClick?: () => void;
  isMobile?: boolean;
}

export default function PublicNav({ onItemClick, isMobile = false }: PublicNavProps) {
  const pathname = usePathname();
  const [liveCount, setLiveCount] = useState<number>(0);

  const fetchLiveCount = useCallback(async () => {
    try {
      const liveMatches = await getPublicLiveMatches();
      setLiveCount(liveMatches.length);
    } catch {
      // Silent fail on nav
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await fetchLiveCount();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchLiveCount]);

  useRealtimeMatches(fetchLiveCount);

  if (isMobile) {
    return (
      <nav className="flex flex-col space-y-2 py-2">
        {PUBLIC_NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const isLiveItem = item.href === '/live';
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onItemClick}
              className={cn(
                'flex items-center justify-between px-4 py-3.5 rounded-2xl text-base font-semibold transition-all duration-200 touch-target',
                isActive
                  ? 'bg-primary text-white shadow-md shadow-primary/20'
                  : 'text-[#0B3323] hover:bg-secondary/80 bg-white/60 border border-border/50'
              )}
            >
              <div className="flex items-center gap-2">
                <span>{item.label}</span>
                {isLiveItem && liveCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500 text-white font-bold animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    {liveCount}
                  </span>
                )}
              </div>
              <ChevronRight
                className={cn(
                  'h-5 w-5 transition-transform',
                  isActive ? 'text-white' : 'text-muted-foreground'
                )}
              />
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex items-center space-x-1.5 lg:space-x-3">
      {PUBLIC_NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        const isLiveItem = item.href === '/live';
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 tracking-tight flex items-center gap-1.5',
              isActive
                ? 'bg-primary text-white shadow-md shadow-primary/20 scale-[1.02]'
                : 'text-muted-foreground hover:text-[#0B3323] hover:bg-secondary/80'
            )}
          >
            <span>{item.label}</span>
            {isLiveItem && liveCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white font-bold animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                {liveCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
