'use client';

import React, { useState } from 'react';
import {
  Trophy,
  Crown,
  Medal,
  Flame,
  Swords,
  ChevronDown,
  ChevronUp,
  User,
  Sparkles,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ArenaLeaderboardEntry } from '@/types/oneVsOne';

interface ArenaLeaderboardProps {
  initialEntries?: ArenaLeaderboardEntry[];
  className?: string;
}

export default function ArenaLeaderboard({
  initialEntries = [],
  className = '',
}: ArenaLeaderboardProps) {
  const [activeMode, setActiveMode] = useState<'1v1' | 'super4' | 'super8'>('1v1');
  const [activeTimeframe, setActiveTimeframe] = useState<'weekly' | 'monthly' | 'yearly' | 'all-time'>('weekly');
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);

  // Fallback seed entries matching official requested rankings
  const defaultEntries: ArenaLeaderboardEntry[] = [
    {
      rank: 1,
      user_id: 'seed-1',
      display_name: 'RAGNER LOTHBROKE',
      initials: 'R',
      total_winnings_inr: 60,
      wins_count: 2,
      played_count: 2,
    },
    {
      rank: 2,
      user_id: 'seed-2',
      display_name: 'Kkk',
      initials: 'K',
      total_winnings_inr: 50,
      wins_count: 1,
      played_count: 1,
    },
    {
      rank: 3,
      user_id: 'seed-3',
      display_name: 'King ɢᴀᴍɪɴɢ',
      initials: 'K',
      total_winnings_inr: 30,
      wins_count: 2,
      played_count: 3,
    },
    {
      rank: 4,
      user_id: 'seed-4',
      display_name: 'AlphaStriker',
      initials: 'A',
      total_winnings_inr: 25,
      wins_count: 1,
      played_count: 2,
    },
    {
      rank: 5,
      user_id: 'seed-5',
      display_name: 'sulaiman',
      initials: 'S',
      total_winnings_inr: 15,
      wins_count: 1,
      played_count: 1,
    },
  ];

  const entries = initialEntries.length > 0 ? initialEntries : defaultEntries;
  const topThree = entries.slice(0, 3);
  const restOfEntries = entries.slice(3);

  return (
    <div id="leaderboard" className={`space-y-6 ${className}`}>
      {/* Header with Title and Mode Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/15 pb-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFFF00]/10 border border-[#FFFF00]/30 text-[#FFFF00] text-[11px] font-black uppercase tracking-wider">
            <Trophy className="h-3.5 w-3.5" />
            <span>Leaderboard</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black font-display uppercase tracking-wider text-white">
            Arena Rankings
          </h2>
          <p className="text-xs text-white/70">
            Official competitive standings, tournament earnings, and win records.
          </p>
        </div>

        {/* Mode Selector Tabs (1V1, Super 4, Super 8) */}
        <div className="flex items-center gap-1.5 p-1 bg-[#05053B] border border-white/15 rounded-2xl w-fit max-w-full overflow-x-auto no-scrollbar shadow-inner">
          {(['1v1', 'super4', 'super8'] as const).map((m) => {
            const label = m === '1v1' ? '1V1' : m === 'super4' ? 'Super 4' : 'Super 8';
            const isActive = activeMode === m;
            return (
              <button
                key={m}
                onClick={() => setActiveMode(m)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-[#FFFF00] text-[#08088F] shadow-md shadow-yellow-500/25'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Timeframe Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {(['weekly', 'monthly', 'yearly', 'all-time'] as const).map((tf) => {
          const label = tf === 'weekly' ? 'Weekly' : tf === 'monthly' ? 'Monthly' : tf === 'yearly' ? 'Yearly' : 'All-time';
          const isActive = activeTimeframe === tf;
          return (
            <button
              key={tf}
              onClick={() => setActiveTimeframe(tf)}
              className={`px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-[#1E1EF5] text-white border border-[#1E1EF5] shadow-md shadow-blue-600/30'
                  : 'bg-white/5 text-white/60 border border-white/10 hover:text-white hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Top 3 Podium Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        {/* Rank 2 (Silver) */}
        {topThree[1] && (
          <Card className="rounded-[28px] bg-gradient-to-b from-[#1010C5] to-[#080860] border-2 border-slate-300/40 p-5 text-white shadow-xl flex flex-col items-center text-center relative overflow-hidden order-2 md:order-1 transition-all hover:scale-[1.02]">
            {/* Rank Badge */}
            <div className="absolute top-4 left-4 h-7 w-7 rounded-full bg-slate-300 text-[#08088F] font-black text-xs flex items-center justify-center shadow-md">
              2
            </div>

            {/* Avatar */}
            <div className="relative mt-2 mb-3">
              <div className="h-20 w-20 rounded-full bg-slate-700 border-3 border-slate-300 flex items-center justify-center text-2xl font-black text-white shadow-lg">
                {topThree[1].initials || (topThree[1].display_name?.[0] || 'K').toUpperCase()}
              </div>
              <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-slate-300 text-[#08088F] flex items-center justify-center shadow">
                <Medal className="h-3.5 w-3.5" />
              </div>
            </div>

            <h4 className="text-base font-black uppercase text-white truncate max-w-full font-display">
              {topThree[1].display_name}
            </h4>

            {/* Winnings */}
            <div className="text-2xl font-black font-display text-white mt-1">
              ₹{topThree[1].total_winnings_inr}
            </div>

            <p className="text-xs text-white/70 mt-1 font-medium">
              {topThree[1].wins_count} wins · {topThree[1].played_count} played
            </p>
          </Card>
        )}

        {/* Rank 1 (Gold - Elevated in Center) */}
        {topThree[0] && (
          <Card className="rounded-[28px] bg-gradient-to-b from-[#1E1EF5] to-[#0A0A7A] border-3 border-[#FFFF00] p-6 text-white shadow-2xl shadow-yellow-500/20 flex flex-col items-center text-center relative overflow-hidden order-1 md:order-2 md:-translate-y-2 transition-all hover:scale-[1.03]">
            {/* Glowing yellow sweep */}
            <div className="absolute top-0 inset-x-0 h-1 bg-[#FFFF00] shadow-[0_0_15px_#FFFF00]" />

            {/* Crown & Rank Badge */}
            <div className="absolute top-4 left-4 h-8 w-8 rounded-full bg-[#FFFF00] text-[#08088F] font-black text-sm flex items-center justify-center shadow-md">
              1
            </div>

            <div className="h-8 w-8 text-[#FFFF00] mb-1 animate-bounce">
              <Crown className="h-8 w-8 fill-current" />
            </div>

            {/* Avatar */}
            <div className="relative mb-3">
              <div className="h-24 w-24 rounded-full bg-[#08088F] border-4 border-[#FFFF00] flex items-center justify-center text-3xl font-black text-[#FFFF00] shadow-xl">
                {topThree[0].initials || (topThree[0].display_name?.[0] || 'R').toUpperCase()}
              </div>
            </div>

            <h4 className="text-lg font-black uppercase text-white truncate max-w-full font-display tracking-wide">
              {topThree[0].display_name}
            </h4>

            {/* Winnings */}
            <div className="text-3xl font-black font-display text-[#FFFF00] mt-1 shadow-sm">
              ₹{topThree[0].total_winnings_inr}
            </div>

            <p className="text-xs text-[#FFFF00]/90 font-bold mt-1">
              {topThree[0].wins_count} wins · {topThree[0].played_count} played
            </p>
          </Card>
        )}

        {/* Rank 3 (Bronze) */}
        {topThree[2] && (
          <Card className="rounded-[28px] bg-gradient-to-b from-[#1010C5] to-[#080860] border-2 border-[#FF168B]/40 p-5 text-white shadow-xl flex flex-col items-center text-center relative overflow-hidden order-3 md:order-3 transition-all hover:scale-[1.02]">
            {/* Rank Badge */}
            <div className="absolute top-4 left-4 h-7 w-7 rounded-full bg-[#FF168B] text-white font-black text-xs flex items-center justify-center shadow-md">
              3
            </div>

            {/* Avatar */}
            <div className="relative mt-2 mb-3">
              <div className="h-20 w-20 rounded-full bg-pink-950 border-3 border-[#FF168B] flex items-center justify-center text-2xl font-black text-[#FF168B] shadow-lg">
                {topThree[2].initials || (topThree[2].display_name?.[0] || 'K').toUpperCase()}
              </div>
              <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-[#FF168B] text-white flex items-center justify-center shadow">
                <Medal className="h-3.5 w-3.5" />
              </div>
            </div>

            <h4 className="text-base font-black uppercase text-white truncate max-w-full font-display">
              {topThree[2].display_name}
            </h4>

            {/* Winnings */}
            <div className="text-2xl font-black font-display text-[#FF168B] mt-1">
              ₹{topThree[2].total_winnings_inr}
            </div>

            <p className="text-xs text-white/70 mt-1 font-medium">
              {topThree[2].wins_count} wins · {topThree[2].played_count} played
            </p>
          </Card>
        )}
      </div>

      {/* Extended Leaderboard (ranks 4+) */}
      {showFullLeaderboard && restOfEntries.length > 0 && (
        <div className="space-y-2 pt-2 animate-in fade-in duration-300">
          <div className="rounded-2xl bg-[#1010C5] border border-white/15 overflow-hidden">
            <table className="w-full text-left text-sm text-white">
              <thead className="bg-[#08088F] text-xs font-black uppercase tracking-wider text-white/70 border-b border-white/10">
                <tr>
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Player</th>
                  <th className="py-3 px-4 text-center">Record</th>
                  <th className="py-3 px-4 text-right">Winnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 font-medium">
                {restOfEntries.map((player) => (
                  <tr key={player.user_id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-mono font-black text-white/60">
                      #{player.rank}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-white/10 text-xs font-black flex items-center justify-center text-white shrink-0">
                          {player.initials || (player.display_name?.[0] || 'P').toUpperCase()}
                        </div>
                        <span className="font-bold text-white truncate">
                          {player.display_name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center text-xs text-white/70">
                      {player.wins_count}W · {player.played_count}P
                    </td>
                    <td className="py-3 px-4 text-right font-black font-display text-[#00E676]">
                      ₹{player.total_winnings_inr}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View full leaderboard button */}
      <div className="text-center pt-2">
        <Button
          onClick={() => setShowFullLeaderboard(!showFullLeaderboard)}
          variant="outline"
          className="rounded-full border-white/20 text-white hover:bg-white/10 text-xs font-black uppercase tracking-wider h-10 px-6 gap-2 transition-all cursor-pointer"
        >
          <span>{showFullLeaderboard ? 'Collapse Leaderboard' : 'View full leaderboard'}</span>
          {showFullLeaderboard ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
