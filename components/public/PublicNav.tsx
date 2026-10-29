'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PUBLIC_NAV_ITEMS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Trophy, Radio, Home, Info, Phone } from 'lucide-react';
import { getPublicLiveMatches } from '@/services/publicTournamentService';
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches';

const NAV_ICONS: Record<string, React.ElementType> = {
  '/': Home,
  '/tournaments': Trophy,
  '/live': Radio,
  '/about': Info,
  '/contact': Phone,
};

interface PublicNavProps {
  onItemClick?: () => void;
  className?: string;
  isMobile?: boolean;
}

export default function PublicNav({ onItemClick, className }: PublicNavProps) {
  const pathname = usePathname();
  const [liveCount, setLiveCount] = useState<number>(0);

  const fetchLiveCount = useCallback(async () => {
    try {
      const liveMatches = await getPublicLiveMatches();
      setLiveCount(liveMatches.length);
    } catch {
      // Silent fail
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
    <nav className={cn('flex items-center justify-start sm:justify-center max-w-full overflow-x-auto no-scrollbar px-1', className)}>
      <div className="inline-flex items-center justify-start sm:justify-center gap-1 sm:gap-1.5 rounded-full bg-[#1212B8]/80 sm:bg-white/10 backdrop-blur-md p-1 sm:p-1.5 border border-white/15 shrink-0">
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
                'transition-all duration-200 ease-out whitespace-nowrap flex items-center justify-center gap-1.5 rounded-full font-black tracking-wide active:scale-95 touch-target px-2.5 sm:px-4 py-1.5 sm:py-2 shrink-0',
                isActive
                  ? 'bg-[#FFFF00] text-[#08088F] shadow-md'
                  : 'text-white hover:text-[#FFFF00] hover:bg-white/10'
              )}
            >
              <IconComponent
                className={cn(
                  'h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 transition-transform',
                  isActive ? 'text-[#08088F]' : 'text-[#D9DCFF]'
                )}
              />
              <span className="text-[11px] sm:text-xs md:text-sm">{item.label}</span>
              {isLiveItem && liveCount > 0 && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full font-black animate-pulse shadow-xs',
                    isActive ? 'bg-[#FF168B] text-white' : 'bg-[#FF168B] text-white'
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-white shrink-0" />
                  {liveCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
