'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Trophy,
  Award,
  Crown,
  Medal,
  Flame,
  Zap,
  ShieldCheck,
  Swords,
  Lock,
  Search,
  CheckCircle2,
  TrendingUp,
  Calendar,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatDate } from '@/lib/utils';
import type { PlayerCareerData, HeadToHeadRecord } from '@/services/careerService';

interface PlayerCareerClientViewProps {
  careerData: PlayerCareerData;
  displayName: string;
}

export default function PlayerCareerClientView({
  careerData,
  displayName,
}: PlayerCareerClientViewProps) {
  const { stats, formGuide, headToHead, achievements, totalAchievementPoints, unlockedCount } = careerData;
  const [h2hSearch, setH2hSearch] = useState('');

  // Icon mapping for achievements
  const getAchievementIcon = (iconName: string) => {
    switch (iconName) {
      case 'Trophy':
        return Trophy;
      case 'Award':
        return Award;
      case 'Crown':
        return Crown;
      case 'Medal':
        return Medal;
      case 'Flame':
        return Flame;
      case 'Zap':
        return Zap;
      case 'ShieldCheck':
        return ShieldCheck;
      default:
        return Award;
    }
  };

  // Rank tier colors & descriptions
  const getRankBadge = (tier: string) => {
    switch (tier) {
      case 'Champion':
        return {
          bg: 'bg-gradient-to-r from-amber-400 via-[#FFFF00] to-yellow-500 text-[#08088F]',
          border: 'border-yellow-300',
          desc: 'Elite Hall of Fame Competitor',
        };
      case 'Diamond':
        return {
          bg: 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white',
          border: 'border-cyan-300',
          desc: 'Masterclass Tournament Tactician',
        };
      case 'Platinum':
        return {
          bg: 'bg-gradient-to-r from-teal-400 to-emerald-500 text-[#08088F]',
          border: 'border-teal-300',
          desc: 'High-Caliber Match Performer',
        };
      case 'Gold':
        return {
          bg: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white',
          border: 'border-amber-400',
          desc: 'Established Tournament Contender',
        };
      case 'Silver':
        return {
          bg: 'bg-gradient-to-r from-slate-300 to-slate-400 text-[#08088F]',
          border: 'border-slate-300',
          desc: 'Emerging Competitive Challenger',
        };
      default:
        return {
          bg: 'bg-gradient-to-r from-amber-800 to-amber-900 text-amber-200',
          border: 'border-amber-700',
          desc: 'Aspiring Rookie Competitor',
        };
    }
  };

  const rankInfo = getRankBadge(stats.rankTier);

  // Filtered Head-to-Head
  const filteredH2H = useMemo(() => {
    const q = h2hSearch.trim().toLowerCase();
    if (!q) return headToHead;
    return headToHead.filter((h) => h.opponentName.toLowerCase().includes(q));
  }, [headToHead, h2hSearch]);

  const achievementPercentage = achievements.length > 0
    ? Math.round((unlockedCount / achievements.length) * 100)
    : 0;

  return (
    <div className="space-y-8">
      {/* 1. Header Rank Tier & Form Guide Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tier Card */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] p-6 text-white relative overflow-hidden shadow-xl lg:col-span-2">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#FFFF00]/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-white/60">
                Official Competitive Tier
              </span>
              <div className="flex items-center gap-3">
                <Badge
                  className={cn(
                    'px-4 py-1.5 rounded-full font-black text-sm tracking-wider uppercase shadow-lg border',
                    rankInfo.bg,
                    rankInfo.border
                  )}
                >
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  {stats.rankTier} Tier
                </Badge>
                <span className="text-xs text-white/70 font-semibold">{rankInfo.desc}</span>
              </div>
              <p className="text-xs text-white/60 pt-1">
                Progression calculated strictly from verified tournament match results.
              </p>
            </div>

            {/* Recent Form */}
            <div className="bg-[#05053B] border border-white/10 rounded-2xl p-4 shrink-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block mb-2">
                Recent Form (Last 5)
              </span>
              {formGuide.length === 0 ? (
                <span className="text-xs text-white/50 italic">No matches played</span>
              ) : (
                <div className="flex items-center gap-1.5">
                  {formGuide.map((res, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shadow-md transition-transform hover:scale-110',
                        res === 'W'
                          ? 'bg-[#00C853] text-[#08088F]'
                          : res === 'D'
                          ? 'bg-amber-400 text-[#08088F]'
                          : 'bg-rose-500 text-white'
                      )}
                    >
                      {res}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Streaks Card */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] p-6 text-white shadow-xl flex flex-col justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/60 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#FFFF00]" />
              Streak Momentum
            </span>
            <div className="grid grid-cols-2 gap-4 pt-3">
              <div className="bg-[#05053B] border border-white/10 rounded-2xl p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-white/50 block">Current Streak</span>
                <span className="text-2xl font-black text-[#00C853] font-display">
                  {stats.currentStreak}W
                </span>
              </div>
              <div className="bg-[#05053B] border border-white/10 rounded-2xl p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-white/50 block">Best Streak</span>
                <span className="text-2xl font-black text-[#FFFF00] font-display">
                  {stats.longestStreak}W
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-white/50 mt-3">
            Consecutive victories across all verified tournament matches.
          </p>
        </Card>
      </div>

      {/* 2. Key Metrics Grid (8 Statistics) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Matches Played */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-2xl p-4 text-white shadow-md">
          <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">Matches Played</span>
          <div className="text-2xl font-black text-[#FFFF00] font-display mt-1">{stats.matchesPlayed}</div>
          <span className="text-[10px] text-white/50 mt-0.5 block">Official fixtures</span>
        </Card>

        {/* Record (W-D-L) */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-2xl p-4 text-white shadow-md">
          <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">Record (W-D-L)</span>
          <div className="text-xl font-black text-white font-display mt-1">
            <span className="text-[#00C853]">{stats.wins}W</span>{' '}
            <span className="text-white/60">{stats.draws}D</span>{' '}
            <span className="text-rose-400">{stats.losses}L</span>
          </div>
          <span className="text-[10px] text-white/50 mt-0.5 block">{stats.winRate}% win rate</span>
        </Card>

        {/* Tournaments Entered */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-2xl p-4 text-white shadow-md">
          <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">Tournaments</span>
          <div className="text-2xl font-black text-white font-display mt-1">{stats.tournamentsEntered}</div>
          <span className="text-[10px] text-white/50 mt-0.5 block">Events contested</span>
        </Card>

        {/* Total Prize Money */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-2xl p-4 text-white shadow-md">
          <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">Total Prize Earned</span>
          <div className="text-2xl font-black text-[#00C853] font-display mt-1">
            ₹{stats.totalPrizeMoneyInr.toLocaleString('en-IN')}
          </div>
          <span className="text-[10px] text-white/50 mt-0.5 block">Paid & approved</span>
        </Card>

        {/* Championships Won */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-2xl p-4 text-white shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-white/60">Champions</span>
            <Crown className="w-3.5 h-3.5 text-[#FFFF00]" />
          </div>
          <div className="text-2xl font-black text-[#FFFF00] font-display mt-1">{stats.championshipsWon}</div>
          <span className="text-[10px] text-white/50 mt-0.5 block">1st place finishes</span>
        </Card>

        {/* Runner-up Finishes */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-2xl p-4 text-white shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-white/60">Runners-Up</span>
            <Medal className="w-3.5 h-3.5 text-slate-300" />
          </div>
          <div className="text-2xl font-black text-slate-200 font-display mt-1">{stats.runnerUpFinishes}</div>
          <span className="text-[10px] text-white/50 mt-0.5 block">2nd place finals</span>
        </Card>

        {/* Achievement Points */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-2xl p-4 text-white shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-white/60">Gamer Points</span>
            <Award className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-cyan-300 font-display mt-1">{totalAchievementPoints}</div>
          <span className="text-[10px] text-white/50 mt-0.5 block">Badge prestige</span>
        </Card>

        {/* Badges Unlocked */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-2xl p-4 text-white shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-white/60">Badges</span>
            <ShieldCheck className="w-3.5 h-3.5 text-[#00C853]" />
          </div>
          <div className="text-2xl font-black text-[#00C853] font-display mt-1">
            {unlockedCount} / {achievements.length}
          </div>
          <span className="text-[10px] text-white/50 mt-0.5 block">{achievementPercentage}% completed</span>
        </Card>
      </div>

      {/* 3. Achievements Showcase */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-xl font-black uppercase tracking-wider text-white font-display flex items-center gap-2">
              <Award className="w-5 h-5 text-[#FFFF00]" />
              Esports Badges & Achievements
            </h2>
            <p className="text-xs text-white/60 mt-0.5">
              Unlock prestigious trophies through competitive milestones and tournament glory.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-36 bg-[#05053B] rounded-full h-3 border border-white/10 overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#FFFF00] to-[#00C853] h-full transition-all duration-500 rounded-full"
                style={{ width: `${achievementPercentage}%` }}
              />
            </div>
            <span className="text-xs font-black text-[#FFFF00]">{achievementPercentage}%</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {achievements.map((ach) => {
            const Icon = getAchievementIcon(ach.badgeIcon);
            return (
              <Card
                key={ach.id}
                className={cn(
                  'rounded-2xl p-5 border transition-all duration-200 relative overflow-hidden',
                  ach.isUnlocked
                    ? 'bg-[#1818D4] border-[#FFFF00]/40 shadow-lg shadow-[#FFFF00]/5'
                    : 'bg-[#05053B]/60 border-white/10 opacity-70'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center border',
                      ach.isUnlocked
                        ? 'bg-[#05053B] border-[#FFFF00]/50 text-[#FFFF00] shadow-md shadow-[#FFFF00]/20'
                        : 'bg-white/5 border-white/10 text-white/40'
                    )}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <Badge
                    className={cn(
                      'text-[10px] font-black uppercase tracking-wider rounded-full px-2 py-0.5',
                      ach.isUnlocked
                        ? 'bg-[#FFFF00] text-[#08088F]'
                        : 'bg-white/10 text-white/50'
                    )}
                  >
                    +{ach.points} pts
                  </Badge>
                </div>

                <div className="mt-4 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-black text-white font-display uppercase tracking-wider">
                      {ach.title}
                    </h3>
                    {ach.isUnlocked && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#00C853] shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-white/70 leading-relaxed min-h-[36px]">
                    {ach.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[10px]">
                  {ach.isUnlocked ? (
                    <span className="text-[#00C853] font-bold">
                      Unlocked {ach.unlockedAt ? formatDate(ach.unlockedAt) : ''}
                    </span>
                  ) : (
                    <span className="text-white/40 flex items-center gap-1 font-semibold">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  )}
                  <span className="text-white/40 uppercase font-bold">{ach.category}</span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 4. Head-to-Head Opponent History */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-xl font-black uppercase tracking-wider text-white font-display flex items-center gap-2">
              <Swords className="w-5 h-5 text-[#FFFF00]" />
              Head-to-Head Rivalry History
            </h2>
            <p className="text-xs text-white/60 mt-0.5">
              Verified lifetime match records against all opponents encountered on the pitch.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-3 h-3.5 w-3.5 text-white/40" />
            <Input
              placeholder="Search opponent..."
              value={h2hSearch}
              onChange={(e) => setH2hSearch(e.target.value)}
              className="pl-9 h-9 text-xs bg-[#05053B] border-white/20 text-white placeholder:text-white/40 rounded-full"
            />
          </div>
        </div>

        {filteredH2H.length === 0 ? (
          <Card className="p-8 text-center bg-[#1818D4] border border-white/20 rounded-2xl text-white">
            <div className="mx-auto w-12 h-12 rounded-xl bg-[#05053B] border border-white/10 flex items-center justify-center text-white/40 mb-3">
              <Swords className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black uppercase tracking-wider font-display">
              {h2hSearch ? `No opponents found matching "${h2hSearch}"` : 'No Head-to-Head Records Yet'}
            </h3>
            <p className="text-xs text-white/60 max-w-md mx-auto mt-1">
              {h2hSearch
                ? 'Try searching with another player username.'
                : 'As you compete against opponents in official tournaments, lifetime head-to-head records will appear here automatically.'}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredH2H.map((record) => {
              const oppWinRate = record.matchesPlayed > 0
                ? Math.round((record.wins / record.matchesPlayed) * 100)
                : 0;

              return (
                <Card
                  key={record.opponentId}
                  className="bg-[#1818D4] border border-white/20 rounded-2xl p-5 text-white shadow-md space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-white font-display uppercase tracking-wider">
                        {record.opponentName}
                      </h4>
                      <span className="text-[10px] text-white/50">
                        {record.matchesPlayed} {record.matchesPlayed === 1 ? 'fixture' : 'fixtures'} played
                      </span>
                    </div>
                    <Badge
                      className={cn(
                        'text-[11px] font-black uppercase tracking-wider rounded-full px-2.5 py-0.5',
                        record.wins > record.losses
                          ? 'bg-[#00C853] text-[#08088F]'
                          : record.wins === record.losses
                          ? 'bg-amber-400 text-[#08088F]'
                          : 'bg-rose-500 text-white'
                      )}
                    >
                      {record.wins > record.losses
                        ? 'Advantage'
                        : record.wins === record.losses
                        ? 'Even'
                        : 'Trailing'}
                    </Badge>
                  </div>

                  {/* W-D-L Stats Bar */}
                  <div className="bg-[#05053B] border border-white/10 rounded-xl p-3 flex items-center justify-between text-center">
                    <div>
                      <span className="text-[9px] uppercase font-bold text-white/40 block">Won</span>
                      <span className="text-base font-black text-[#00C853]">{record.wins}</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase font-bold text-white/40 block">Drawn</span>
                      <span className="text-base font-black text-white/70">{record.draws}</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase font-bold text-white/40 block">Lost</span>
                      <span className="text-base font-black text-rose-400">{record.losses}</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase font-bold text-white/40 block">Win Rate</span>
                      <span className="text-base font-black text-[#FFFF00]">{oppWinRate}%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-white/40 pt-1">
                    <span>Last Match:</span>
                    <span>{record.lastPlayedAt ? formatDate(record.lastPlayedAt) : 'Recent'}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
