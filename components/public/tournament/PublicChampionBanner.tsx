'use client';

import React from 'react';
import { Trophy, Medal, Star, Sparkles, Award } from 'lucide-react';
import type { Participant } from '@/types/database';
import { Badge } from '@/components/ui/badge';

interface PublicChampionBannerProps {
  champion: Participant;
  runnerUp?: Participant | null;
  completedAt?: string | null;
}

export default function PublicChampionBanner({ champion, runnerUp, completedAt }: PublicChampionBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-amber-300/80 bg-gradient-to-b from-slate-900 via-[#0B2518] to-slate-950 p-6 sm:p-8 text-white shadow-xl">
      {/* Decorative Stars */}
      <Star className="absolute top-4 left-6 h-5 w-5 text-amber-400/40 rotate-12" />
      <Star className="absolute top-6 right-8 h-4 w-4 text-amber-400/30 -rotate-6" />

      <div className="relative z-10 space-y-6">
        {/* Banner Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
          <div className="flex items-center gap-2">
            <Badge className="bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-[10px] uppercase tracking-widest px-3 py-1 border-0 shadow-sm gap-1">
              <Sparkles className="h-3 w-3" />
              <span>OFFICIAL CHAMPIONSHIP RESULT</span>
            </Badge>
          </div>
          {completedAt && (
            <p className="text-xs text-slate-400 font-mono">
              Completed {new Date(completedAt).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Podium Layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Champion Box */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/20 via-amber-400/10 to-amber-500/20 border border-amber-400/50 shadow-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-amber-300 uppercase tracking-widest flex items-center gap-1.5">
                <Trophy className="h-4 w-4 text-amber-400" />
                <span>🏆 TOURNAMENT CHAMPION</span>
              </span>
              <Badge className="bg-amber-400 text-slate-950 font-black text-[10px]">1ST PLACE</Badge>
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 tracking-tight truncate">
                {champion.username}
              </h2>
              {champion.real_name && (
                <p className="text-xs text-amber-300/80 font-semibold">{champion.real_name}</p>
              )}
            </div>
          </div>

          {/* Runner Up Box */}
          {runnerUp && (
            <div className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700 shadow-md space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Medal className="h-4 w-4 text-slate-400" />
                  <span>🥈 RUNNER-UP</span>
                </span>
                <Badge variant="outline" className="border-slate-500 text-slate-300 font-bold text-[10px]">2ND PLACE</Badge>
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-200 tracking-tight truncate">
                  {runnerUp.username}
                </h3>
                {runnerUp.real_name && (
                  <p className="text-xs text-slate-400 font-semibold">{runnerUp.real_name}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
