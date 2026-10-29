'use client';

import React from 'react';
import { Trophy, Medal, Star, Sparkles } from 'lucide-react';
import type { Participant } from '@/types/database';

interface PublicChampionBannerProps {
  champion: Participant;
  runnerUp?: Participant | null;
  completedAt?: string | null;
}

export default function PublicChampionBanner({ champion, runnerUp, completedAt }: PublicChampionBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-[#FFFF00]/50 bg-[#1010C5] p-6 sm:p-8 text-white shadow-2xl">
      {/* Decorative Stars */}
      <Star className="absolute top-4 left-6 h-5 w-5 text-[#FFFF00]/30 rotate-12" />
      <Star className="absolute top-6 right-8 h-4 w-4 text-[#FFFF00]/30 -rotate-6" />

      <div className="relative z-10 space-y-6">
        {/* Banner Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/20 pb-4">
          <div className="flex items-center gap-2">
            <span className="bg-[#FFFF00] text-[#08088F] font-black text-[10px] uppercase tracking-widest px-3 py-1 rounded-full shadow-sm flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#08088F]" />
              <span>OFFICIAL CHAMPIONSHIP RESULT</span>
            </span>
          </div>
          {completedAt && (
            <p className="text-xs text-[#D9DCFF]/70 font-mono">
              Completed {new Date(completedAt).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Podium Layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Champion Box */}
          <div className="p-5 rounded-2xl bg-[#3434FF] border border-[#FFFF00]/50 shadow-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-[#FFFF00] uppercase tracking-widest flex items-center gap-1.5">
                <Trophy className="h-4 w-4 text-[#FFFF00]" />
                <span>🏆 TOURNAMENT CHAMPION</span>
              </span>
              <span className="bg-[#FFFF00] text-[#08088F] font-black text-[10px] uppercase px-2 py-0.5 rounded-full">1ST PLACE</span>
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black font-display uppercase tracking-wide text-white truncate">
                {champion.username}
              </h2>
              {champion.real_name && (
                <p className="text-xs text-[#FFFF00]/80 font-bold mt-0.5">{champion.real_name}</p>
              )}
            </div>
          </div>

          {/* Runner Up Box */}
          {runnerUp && (
            <div className="p-5 rounded-2xl bg-[#0A0A7A] border border-white/20 shadow-md space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-[#D9DCFF] uppercase tracking-widest flex items-center gap-1.5">
                  <Medal className="h-4 w-4 text-[#D9DCFF]" />
                  <span>🥈 RUNNER-UP</span>
                </span>
                <span className="border border-white/30 text-white font-bold text-[10px] uppercase px-2 py-0.5 rounded-full">2ND PLACE</span>
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-bold font-display uppercase text-white tracking-wide truncate">
                  {runnerUp.username}
                </h3>
                {runnerUp.real_name && (
                  <p className="text-xs text-[#D9DCFF]/70 font-medium mt-0.5">{runnerUp.real_name}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
