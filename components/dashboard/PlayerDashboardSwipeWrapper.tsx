'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { cn } from '@/lib/utils';

const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/tournaments',
  '/dashboard/matches',
  '/dashboard/profile',
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
  const pathname = usePathname();

  // Find index of current route
  const currentIndex = DASHBOARD_ROUTES.findIndex((r) => {
    if (r === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(r);
  });

  // Pre-fetch adjacent tabs for instantaneous navigation
  useEffect(() => {
    if (currentIndex !== -1) {
      if (currentIndex > 0) {
        router.prefetch(DASHBOARD_ROUTES[currentIndex - 1]);
      }
      if (currentIndex < DASHBOARD_ROUTES.length - 1) {
        router.prefetch(DASHBOARD_ROUTES[currentIndex + 1]);
      }
    }
  }, [currentIndex, router]);

  const handleSwipeLeft = () => {
    if (currentIndex !== -1 && currentIndex < DASHBOARD_ROUTES.length - 1) {
      router.push(DASHBOARD_ROUTES[currentIndex + 1]);
    }
  };

  const handleSwipeRight = () => {
    if (currentIndex !== -1 && currentIndex > 0) {
      router.push(DASHBOARD_ROUTES[currentIndex - 1]);
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
      className={cn('w-full touch-pan-y transition-opacity duration-150', className)}
    >
      {children}
    </div>
  );
}

export default PlayerDashboardSwipeWrapper;
