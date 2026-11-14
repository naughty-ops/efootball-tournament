'use client';

import React, { useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { PUBLIC_NAV_ITEMS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Trophy, Radio, Home, Info, Phone } from 'lucide-react';
import { useLiveMatchesQuery } from '@/hooks/queries/useLiveMatchesQuery';
import { useRealtimeMatches, type RealtimePayload } from '@/hooks/useRealtimeMatches';

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
  const rawPathname = usePathname();
  const pathname = rawPathname || '';
  const router = useRouter();
  const activeTabRef = useRef<HTMLAnchorElement>(null);

  // Reusable TanStack Query live matches cache: eliminates duplicate network requests across tabs
  const { data: liveMatches = [], refetch } = useLiveMatchesQuery();
  const liveCount = liveMatches.length;

  // Realtime hook synchronizes live match count automatically
  const handleRealtimeMatchUpdate = useCallback(
    (payload?: RealtimePayload) => {
      if (payload?.table === 'matches' && payload?.eventType === 'UPDATE') {
        const oldStatus = payload.old?.status;
        const newStatus = payload.new?.status;
        if (oldStatus && newStatus && oldStatus === newStatus) {
          return;
        }
      }
      refetch();
    },
    [refetch]
  );

  useRealtimeMatches(handleRealtimeMatchUpdate);

  // Auto-scroll active item into view on mobile
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [pathname]);

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
              ref={isActive ? activeTabRef : undefined}
              href={item.href}
              prefetch={true}
              onMouseEnter={() => router.prefetch(item.href)}
              onTouchStart={() => router.prefetch(item.href)}
              onClick={onItemClick}
              className={cn(
                'transition-all duration-200 ease-out whitespace-nowrap flex items-center justify-center gap-1.5 rounded-full font-black tracking-wide active:scale-95 touch-target min-h-[40px] px-2.5 sm:px-4 py-1.5 sm:py-2 shrink-0',
                isActive
                  ? 'bg-[#FFFF00] text-[#08088F] shadow-md'
                  : 'text-white hover:text-[#FFFF00] hover:bg-white/10'
              )}
            >
              <IconComponent
                className={cn(
                  'h-4 w-4 shrink-0 transition-transform duration-200',
                  isActive ? 'text-[#08088F]' : 'text-[#FFFF00]'
                )}
              />
              <span className="text-xs sm:text-sm uppercase tracking-wider font-display font-black">
                {item.label}
              </span>

              {/* Realtime Live Counter Badge */}
              {isLiveItem && liveCount > 0 && (
                <span
                  className={cn(
                    'relative ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black leading-tight flex items-center justify-center transition-colors shadow-sm',
                    isActive
                      ? 'bg-[#FF168B] text-white'
                      : 'bg-[#FF168B] text-white animate-pulse'
                  )}
                >
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
