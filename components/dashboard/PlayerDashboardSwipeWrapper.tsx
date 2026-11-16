'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { cn } from '@/lib/utils';

const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/tournaments',
  '/dashboard/matches',
  '/dashboard/wallet',
  '/dashboard/settings',
];

interface PlayerDashboardSwipeWrapperProps {
  children: React.ReactNode;
  className?: string;
  currentSection?: 'overview' | 'tournaments' | 'matches' | 'profile' | string;
}

export function PlayerDashboardSwipeWrapper({
  children,
  className,
}: PlayerDashboardSwipeWrapperProps) {
  const router = useRouter();
  const rawPathname = usePathname();
  const pathname = rawPathname || '';
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [isPending, startTransition] = useTransition();

  // Find index of current route
  const normalizedPath =
    pathname.startsWith('/dashboard/profile') ||
    pathname.startsWith('/dashboard/career') ||
    pathname.startsWith('/dashboard/tickets') ||
    pathname.startsWith('/dashboard/notifications')
      ? '/dashboard/settings'
      : pathname;
  const currentIndex = DASHBOARD_ROUTES.findIndex((r) => {
    if (r === '/dashboard') return normalizedPath === '/dashboard';
    return normalizedPath.startsWith(r);
  });

  // Reset slide transition on pathname change
  useEffect(() => {
    setSlideDirection(null);
  }, [pathname]);

  // Pre-fetch adjacent tabs sensibly without flooding low-bandwidth mobile connections
  useEffect(() => {
    if (currentIndex === -1) return;

    // Check if client requested Data Saver mode
    const isSaveData = typeof navigator !== 'undefined' && (navigator as any)?.connection?.saveData === true;
    if (isSaveData) return;

    const timer = setTimeout(() => {
      if (currentIndex > 0) {
        router.prefetch(DASHBOARD_ROUTES[currentIndex - 1]);
      }
      if (currentIndex < DASHBOARD_ROUTES.length - 1) {
        router.prefetch(DASHBOARD_ROUTES[currentIndex + 1]);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [currentIndex, router]);

  const handleSwipeLeft = () => {
    if (currentIndex !== -1 && currentIndex < DASHBOARD_ROUTES.length - 1) {
      setSlideDirection('left');
      startTransition(() => {
        router.push(DASHBOARD_ROUTES[currentIndex + 1]);
      });
    }
  };

  const handleSwipeRight = () => {
    if (currentIndex !== -1 && currentIndex > 0) {
      setSlideDirection('right');
      startTransition(() => {
        router.push(DASHBOARD_ROUTES[currentIndex - 1]);
      });
    }
  };

  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    minDeltaX: 45,
    maxDeltaYRatio: 0.65,
  });

  return (
    <div
      {...swipeHandlers}
      className={cn(
        'w-full min-w-0 max-w-full touch-pan-y transition-all duration-200 ease-out',
        slideDirection === 'left' && 'motion-safe:translate-x-[-12px] motion-safe:opacity-75',
        slideDirection === 'right' && 'motion-safe:translate-x-[12px] motion-safe:opacity-75',
        className
      )}
    >
      {children}
    </div>
  );
}

export default PlayerDashboardSwipeWrapper;
