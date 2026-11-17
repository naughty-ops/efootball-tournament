'use client';

import React from 'react';
import { Trophy, Medal, Star, Sparkles, Crown } from 'lucide-react';
import type { Participant } from '@/types/database';

interface PublicChampionBannerProps {
  champion: Participant;
  runnerUp?: Participant | null;
  completedAt?: string | null;
}

export default function PublicChampionBanner({
  champion,
  runnerUp,
  completedAt,
}: PublicChampionBannerProps) {
  const champName = champion.real_name || champion.username || 'Champion';
  const runnerName = runnerUp ? (runnerUp.real_name || runnerUp.username || 'Runner-Up') : null;

  return (
    <div className="relative overflow-hidden rounded-[32px] border-2 border-[#FFFF00]/60 bg-gradient-to-br from-[#1010C5] via-[#1414D0] to-[#0A0A7A] p-6 sm:p-8 text-white shadow-2xl">
      {/* Dynamic Ambient Stadium Glow */}
      <div className="absolute -top-16 -right-16 w-64 h-64 bg-[#FFFF00]/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-[#3434FF]/25 rounded-full blur-3xl pointer-events-none" />

      {/* Decorative Football Corner Angles */}
      <div className="yellow-angle-left top-4 opacity-50" />
      <div className="yellow-angle-right top-4 opacity-50" />

      {/* Subtle Star Accents */}
      <Star className="absolute top-5 left-10 h-4 w-4 text-[#FFFF00]/40 rotate-12" />
      <Star className="absolute top-6 right-12 h-4 w-4 text-[#FFFF00]/40 -rotate-12" />

      <div className="relative z-10 space-y-6">
        {/* Banner Header Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/20 pb-4">
          <div className="flex items-center gap-2">
            <span className="bg-[#FFFF00] text-[#08088F] font-black text-[11px] uppercase tracking-widest px-3.5 py-1 rounded-full shadow-md flex items-center gap-1.5 font-display">
              <Sparkles className="h-3.5 w-3.5 text-[#08088F]" />
              <span>OFFICIAL CHAMPIONSHIP PODIUM</span>
            </span>
          </div>
          {completedAt && (
            <p className="text-xs text-[#D9DCFF] font-mono font-medium">
              Concluded {new Date(completedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
            </p>
          )}
        </div>

        {/* Podium Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {/* Champion Box */}
          <div className="relative overflow-hidden p-6 rounded-2xl bg-gradient-to-br from-[#3434FF] to-[#2525D9] border-2 border-[#FFFF00] shadow-[0_0_25px_rgba(255,255,0,0.25)] space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#FFFF00] uppercase tracking-wider flex items-center gap-2 font-display">
                <Crown className="h-4 w-4 text-[#FFFF00]" />
                <span>TOURNAMENT CHAMPION</span>
              </span>
              <span className="bg-[#FFFF00] text-[#08088F] font-black text-[10px] uppercase px-2.5 py-0.5 rounded-full shadow-xs">
                1ST PLACE
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-[#FFFF00] text-[#08088F] flex items-center justify-center font-black text-2xl shadow-lg border-2 border-white/40 shrink-0">
                <Trophy className="h-7 w-7 text-[#08088F]" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl sm:text-3xl font-black font-display uppercase tracking-wide text-white truncate drop-shadow-sm">
                  {champName}
                </h2>
                {champion.seed_number ? (
                  <span className="inline-block mt-1 text-[11px] font-extrabold text-[#FFFF00] bg-[#08088F]/60 px-2 py-0.5 rounded-md border border-[#FFFF00]/30">
                    Seed #{champion.seed_number}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Runner-Up Box */}
          {runnerUp && (
            <div className="relative overflow-hidden p-6 rounded-2xl bg-gradient-to-br from-[#0C0C80] to-[#07075A] border border-white/25 shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-[#D9DCFF] uppercase tracking-wider flex items-center gap-2 font-display">
                  <Medal className="h-4 w-4 text-[#D9DCFF]" />
                  <span>RUNNER-UP</span>
                </span>
                <span className="border border-white/30 bg-white/10 text-white font-bold text-[10px] uppercase px-2.5 py-0.5 rounded-full">
                  2ND PLACE
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/30 text-white flex items-center justify-center font-black text-2xl shadow-md shrink-0">
                  <Medal className="h-7 w-7 text-[#D9DCFF]" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl sm:text-2xl font-bold font-display uppercase text-white tracking-wide truncate">
                    {runnerName}
                  </h3>
                  {runnerUp.seed_number ? (
                    <span className="inline-block mt-1 text-[11px] font-bold text-[#D9DCFF] bg-white/10 px-2 py-0.5 rounded-md border border-white/20">
                      Seed #{runnerUp.seed_number}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
