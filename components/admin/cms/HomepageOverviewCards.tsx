'use client';

import React from 'react';
import { Layers, Eye, EyeOff, Edit3, Clock } from 'lucide-react';
import type { HomepageOverviewStats } from '@/types/database';

interface HomepageOverviewCardsProps {
  stats: HomepageOverviewStats;
}

export function HomepageOverviewCards({ stats }: HomepageOverviewCardsProps) {
  const formattedLastPublished = stats.lastPublishedAt
    ? new Date(stats.lastPublishedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Never';

  const cards = [
    {
      label: 'Total Sections',
      value: stats.totalSections,
      icon: Layers,
      color: 'text-white',
      bgColor: 'bg-white/10',
      description: 'Defined homepage components',
    },
    {
      label: 'Published & Active',
      value: stats.publishedCount,
      icon: Eye,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/15',
      description: 'Visible to public visitors',
    },
    {
      label: 'Hidden / Disabled',
      value: stats.hiddenCount,
      icon: EyeOff,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/15',
      description: 'Hidden across all viewports',
    },
    {
      label: 'Draft Changes',
      value: stats.draftChangesCount,
      icon: Edit3,
      color: stats.draftChangesCount > 0 ? 'text-[#FFFF00]' : 'text-slate-400',
      bgColor: stats.draftChangesCount > 0 ? 'bg-[#FFFF00]/15' : 'bg-white/5',
      description: stats.draftChangesCount > 0 ? 'Unpublished modifications' : 'In sync with live',
    },
    {
      label: 'Last Published',
      value: formattedLastPublished,
      icon: Clock,
      color: 'text-[#D9DCFF]',
      bgColor: 'bg-white/10',
      description: 'Most recent deployment',
      isText: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div
            key={i}
            className="rounded-2xl sm:rounded-3xl border border-white/15 bg-[#1414B8] p-4 sm:p-5 flex flex-col justify-between shadow-lg"
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[11px] font-black uppercase tracking-wider text-[#D9DCFF] truncate">
                {c.label}
              </span>
              <div className={`h-8 w-8 rounded-xl ${c.bgColor} ${c.color} flex items-center justify-center shrink-0`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>

            <div className="space-y-1">
              <div className={`text-xl sm:text-2xl font-black ${c.color} font-display truncate`}>
                {c.value}
              </div>
              <p className="text-[10px] text-[#A6ACFF] font-medium truncate">
                {c.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
