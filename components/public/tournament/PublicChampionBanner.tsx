'use client';

import React from 'react';
import { Trophy, Star } from 'lucide-react';
import type { Participant } from '@/types/database';

interface PublicChampionBannerProps {
  champion: Participant;
}

export default function PublicChampionBanner({ champion }: PublicChampionBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-6 sm:p-8 text-center shadow-sm">
      {/* Decorative stars */}
      <Star className="absolute top-3 left-4 h-4 w-4 text-amber-300 opacity-60 rotate-12" />
      <Star className="absolute top-5 right-6 h-3 w-3 text-amber-300 opacity-60 -rotate-6" />
      <Star className="absolute bottom-4 left-8 h-3 w-3 text-amber-200 opacity-50 rotate-45" />

      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400 shadow-lg shadow-amber-200">
          <Trophy className="h-8 w-8 text-white" />
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-600/80 mb-1">
            🏆 Tournament Champion
          </p>
          <h2 className="text-2xl sm:text-3xl font-black text-amber-800 tracking-tight">
            {champion.username}
          </h2>
          {champion.real_name && (
            <p className="text-sm text-amber-600/70 mt-0.5">{champion.real_name}</p>
          )}
        </div>

        <p className="text-xs text-amber-600/60 font-semibold uppercase tracking-wider">
          Congratulations! 🎉
        </p>
      </div>
    </div>
  );
}
