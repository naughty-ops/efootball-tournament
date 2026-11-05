'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { cn } from '@/lib/utils';
import { playTouch } from '@/src/lib/sounds/sound-manager';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ElementType;
  badge?: React.ReactNode;
  disabled?: boolean;
}

interface SwipeableTabBarProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * Premium Mobile Touch Tab Bar
 * Displays tabs horizontally in a clean pill bar and automatically scrolls
 * the active tab into center view upon selection or swipe.
 */
export function SwipeableTabBar({
  tabs,
  activeTab,
  onTabChange,
  className,
  ariaLabel = 'Navigation Tabs',
}: SwipeableTabBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll active tab pill into view horizontally
  useEffect(() => {
    if (activeTabRef.current && barRef.current) {
      const container = barRef.current;
      const tab = activeTabRef.current;
      const containerWidth = container.offsetWidth;
      const tabLeft = tab.offsetLeft;
      const tabWidth = tab.offsetWidth;

      container.scrollTo({
        left: tabLeft - containerWidth / 2 + tabWidth / 2,
        behavior: 'smooth',
      });
    }
  }, [activeTab]);

  return (
    <div
      ref={barRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1 px-1 touch-pan-x',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            ref={isActive ? activeTabRef : null}
            onClick={() => {
              if (!tab.disabled) onTabChange(tab.id);
            }}
            disabled={tab.disabled}
            className={cn(
              'px-3.5 sm:px-4 py-2 text-xs font-black uppercase tracking-wider rounded-full transition-all duration-200 whitespace-nowrap flex items-center gap-2 border select-none shrink-0 min-h-[40px]',
              isActive
                ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.35)] scale-[1.02]'
                : 'bg-[#1010C5] text-white/85 border-white/15 hover:border-[#FFFF00]/50 hover:text-white active:scale-95'
            )}
          >
            {Icon && <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-[#08088F]' : 'text-[#FFFF00]')} />}
            <span>{tab.label}</span>
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}

interface SwipeableTabContainerProps {
  tabs: (TabItem | string)[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

/**
 * Premium Mobile Swipeable Tab Content Container
 * Enables natural left/right swipe navigation between tabs with smooth directional transitions.
 */
export function SwipeableTabContainer({
  tabs,
  activeTab,
  onTabChange,
  children,
  className,
  disabled = false,
}: SwipeableTabContainerProps) {
  const getTabId = (t: TabItem | string) => (typeof t === 'string' ? t : t.id);
  const isTabDisabled = (t: TabItem | string) => (typeof t === 'string' ? false : !!t.disabled);

  const currentIndex = tabs.findIndex((t) => getTabId(t) === activeTab);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('left');

  const handleNextTab = () => {
    if (currentIndex < tabs.length - 1) {
      const nextTab = tabs[currentIndex + 1];
      if (!isTabDisabled(nextTab)) {
        playTouch();
        setSlideDirection('left');
        onTabChange(getTabId(nextTab));
      }
    }
  };

  const handlePrevTab = () => {
    if (currentIndex > 0) {
      const prevTab = tabs[currentIndex - 1];
      if (!isTabDisabled(prevTab)) {
        playTouch();
        setSlideDirection('right');
        onTabChange(getTabId(prevTab));
      }
    }
  };

  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: handleNextTab,
    onSwipeRight: handlePrevTab,
    minDeltaX: 45,
    maxDeltaYRatio: 0.65,
    disabled,
  });

  return (
    <div
      {...swipeHandlers}
      className={cn('relative w-full touch-pan-y', className)}
      role="tabpanel"
      id={`tabpanel-${activeTab}`}
      aria-labelledby={`tab-${activeTab}`}
    >
      <div
        key={activeTab}
        className={cn(
          'transition-all duration-200 ease-out animate-in fade-in',
          slideDirection === 'left' ? 'slide-in-from-right-3' : 'slide-in-from-left-3'
        )}
      >
        {children}
      </div>
    </div>
  );
}
