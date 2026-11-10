'use client';

import React from 'react';
import Link from 'next/link';
import { Trophy, Swords } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompetitionSubNavProps {
  activeTab: 'tournaments' | 'matches';
  tournamentCount?: number;
  matchCount?: number;
}

export default function CompetitionSubNav({
  activeTab,
  tournamentCount,
  matchCount,
}: CompetitionSubNavProps) {
  const tabs = [
    {
      id: 'tournaments',
      label: 'My Tournaments',
      href: '/dashboard/tournaments',
      icon: Trophy,
      count: tournamentCount,
    },
    {
      id: 'matches',
      label: 'My Matches',
      href: '/dashboard/matches',
      icon: Swords,
      count: matchCount,
    },
  ];

  return (
    <div className="flex items-center gap-2 p-1.5 bg-[#05053B] border border-white/10 rounded-2xl w-fit">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <Link
            key={tab.id}
            href={tab.href}
            prefetch
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 cursor-pointer select-none',
              isActive
                ? 'bg-[#FFFF00] text-[#08088F] shadow-md shadow-[#FFFF00]/20'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            )}
          >
            <Icon className={cn('w-4 h-4', isActive ? 'text-[#08088F]' : 'text-white/60')} />
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span
                className={cn(
                  'ml-1 px-1.5 py-0.5 text-[10px] rounded-full font-black leading-none',
                  isActive
                    ? 'bg-[#08088F] text-[#FFFF00]'
                    : 'bg-white/10 text-white/70'
                )}
              >
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
