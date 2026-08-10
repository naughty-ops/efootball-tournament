'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PUBLIC_NAV_ITEMS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Home, Radio, Trophy } from 'lucide-react';
import { getPublicLiveMatches } from '@/services/publicTournamentService';
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches';

const NAV_ICONS: Record<string, React.ElementType> = {
  '/': Home,
  '/live': Radio,
  '/tournaments': Trophy,
};

interface PublicNavProps {
  onItemClick?: () => void;
  className?: string;
}

export default function PublicNav({ onItemClick, className }: PublicNavProps) {
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

  return (
    <nav className={cn('flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar touch-pan-x py-1 px-0.5 max-w-full', className)}>
      {PUBLIC_NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        const isLiveItem = item.href === '/live';
        const IconComponent = NAV_ICONS[item.href] || Trophy;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onItemClick}
            className={cn(
              'h-10 sm:h-9 px-3.5 sm:px-4 text-xs sm:text-sm font-extrabold transition-all duration-200 shrink-0 whitespace-nowrap flex items-center justify-center gap-1.5 rounded-xl active:scale-95 touch-target',
              isActive
                ? 'bg-primary text-white shadow-md shadow-primary/25 scale-[1.02] ring-1 ring-primary/40'
                : 'text-[#0B3323]/80 hover:text-[#0B3323] hover:bg-secondary/90 bg-white/70 border border-border/50'
            )}
          >
            <IconComponent className={cn('h-4 w-4 shrink-0', isActive ? 'text-white' : 'text-primary')} />
            <span>{item.label}</span>
            {isLiveItem && liveCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white font-black animate-pulse shadow-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-white shrink-0" />
                {liveCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
