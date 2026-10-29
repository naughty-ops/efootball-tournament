'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Swords,
  Calendar,
  Radio,
  Flame,
  CheckCircle2,
  Clock,
  Filter,
  Trophy,
  ArrowRight,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Shield,
  Search,
  User,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatDate } from '@/lib/utils';
import type { PlayerMatchItem } from '@/services/playerDashboardService';
import OpponentWhatsAppButton from '@/components/dashboard/OpponentWhatsAppButton';

interface PlayerMatchesClientProps {
  initialMatches: PlayerMatchItem[];
  userDisplayName: string;
  initialError?: string | null;
}

const TABS = [
  { key: 'all', label: 'All Matches', icon: Filter },
  { key: 'upcoming', label: 'Upcoming', icon: Clock },
  { key: 'live', label: 'Live Now', icon: Flame },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
] as const;

export default function PlayerMatchesClient({
  initialMatches,
  userDisplayName,
  initialError,
}: PlayerMatchesClientProps) {
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Calculate real, data-backed match metrics
  const stats = useMemo(() => {
    const total = initialMatches.length;
    const liveCount = initialMatches.filter((m) => m.isLive).length;
    const upcomingCount = initialMatches.filter(
      (m) => !m.isLive && m.status !== 'completed' && m.status !== 'walkover'
    ).length;
    const completedMatches = initialMatches.filter(
      (m) => m.status === 'completed' || m.status === 'walkover'
    );
    const completedCount = completedMatches.length;
    const wins = completedMatches.filter((m) => m.result === 'win').length;
    const draws = completedMatches.filter((m) => m.result === 'draw').length;
    const losses = completedMatches.filter((m) => m.result === 'loss').length;
    const winRate = completedCount > 0 ? Math.round((wins / completedCount) * 100) : 0;

    return { total, liveCount, upcomingCount, completedCount, wins, draws, losses, winRate };
  }, [initialMatches]);

  const filteredMatches = useMemo(() => {
    return initialMatches.filter((m) => {
      // Tab matching
      let matchesTab = true;
      if (selectedTab === 'live') matchesTab = m.isLive;
      else if (selectedTab === 'upcoming') {
        matchesTab = !m.isLive && m.status !== 'completed' && m.status !== 'walkover';
      } else if (selectedTab === 'completed') {
        matchesTab = m.status === 'completed' || m.status === 'walkover';
      }

      // Search matching
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        m.tournamentName.toLowerCase().includes(q) ||
        m.roundName.toLowerCase().includes(q) ||
        m.opponentUsername.toLowerCase().includes(q);

      return matchesTab && matchesSearch;
    });
  }, [initialMatches, selectedTab, searchQuery]);

  return (
    <div className="space-y-8">
      {/* 1. Summary Cards Section */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Fixtures */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-[24px] p-5 shadow-lg text-white">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-black uppercase tracking-wider text-white/70">Total Fixtures</span>
            <div className="h-8 w-8 rounded-full bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00]">
              <Swords className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#FFFF00] font-display">{stats.total}</div>
          <p className="text-[11px] text-white/60 mt-1">Across all tournaments</p>
        </Card>

        {/* Live Matches */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-[24px] p-5 shadow-lg text-white">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-black uppercase tracking-wider text-white/70">Live Now</span>
            <div className="h-8 w-8 rounded-full bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FF168B]">
              <Radio className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#FF168B] font-display">{stats.liveCount}</div>
          <p className="text-[11px] text-white/60 mt-1">Active match rooms</p>
        </Card>

        {/* Upcoming Fixtures */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-[24px] p-5 shadow-lg text-white">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-black uppercase tracking-wider text-white/70">Upcoming</span>
            <div className="h-8 w-8 rounded-full bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00]">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#FFFF00] font-display">{stats.upcomingCount}</div>
          <p className="text-[11px] text-white/60 mt-1">Awaiting kickoff</p>
        </Card>

        {/* Completed Record */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-[24px] p-5 shadow-lg text-white">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-black uppercase tracking-wider text-white/70">Record</span>
            <div className="h-8 w-8 rounded-full bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#00C853]">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-display">
            <span className="text-[#00C853]">{stats.wins}W</span> -{' '}
            <span className="text-white/70">{stats.draws}D</span> -{' '}
            <span className="text-red-400">{stats.losses}L</span>
          </div>
          <p className="text-[11px] text-white/60 mt-1">
            {stats.completedCount > 0 ? `${stats.winRate}% win rate` : 'No matches played yet'}
          </p>
        </Card>
      </div>

      {/* Query Error State */}
      {initialError && initialMatches.length === 0 && (
        <Card className="p-8 text-center bg-red-950/40 border border-red-500/30 rounded-3xl space-y-4 text-white">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-400">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-white uppercase font-display">Unable to Retrieve Matches</h3>
            <p className="text-xs text-white/70 max-w-md mx-auto mt-1">
              {initialError}
            </p>
          </div>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            size="sm"
            className="rounded-full text-xs font-black uppercase tracking-wider border-white/30 text-white hover:bg-white/10 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry Query</span>
          </Button>
        </Card>
      )}

      {/* 2. Controls: Search & Tabs Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSelectedTab(key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-black uppercase tracking-wider border transition-all whitespace-nowrap cursor-pointer',
                selectedTab === key
                  ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00] shadow-md'
                  : 'bg-[#1010C5] text-white/80 border-white/20 hover:border-white/40 hover:text-white'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
              {key === 'all' && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-[#08088F] text-[#FFFF00]">
                  {stats.total}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-white/50" />
          <Input
            placeholder="Search opponent or tournament..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10 text-xs bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 focus:border-[#FFFF00] rounded-full"
          />
        </div>
      </div>

      {/* 3. Matches Grid */}
      {filteredMatches.length === 0 ? (
        <Card className="p-12 text-center bg-[#1818D4] border border-white/20 rounded-[32px] space-y-4 text-white">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00]">
            <Swords className="h-8 w-8 text-[#FFFF00]" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white font-display uppercase tracking-wider">
              {searchQuery
                ? `No fixtures matching "${searchQuery}"`
                : selectedTab === 'all'
                ? 'No Matches Scheduled Yet'
                : `No ${selectedTab} matches found`}
            </h3>
            <p className="text-xs text-white/70 max-w-md mx-auto mt-1 leading-relaxed">
              {searchQuery
                ? 'Try adjusting your search query or switching tabs.'
                : 'When tournament administrators generate pairings and brackets, your matches and live game rooms will be displayed here.'}
            </p>
          </div>
          <Button asChild className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs rounded-full shadow-lg uppercase tracking-wider px-6 cursor-pointer">
            <Link href="/dashboard/tournaments">Check Tournament Status</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredMatches.map((m) => {
            const isCompleted = m.status === 'completed' || m.status === 'walkover';
            const isWon = m.result === 'win';
            const isLost = m.result === 'loss';
            const isDrawn = m.result === 'draw';

            return (
              <Card
                key={m.id}
                className={cn(
                  'p-5 bg-[#1818D4] border rounded-[28px] shadow-xl transition-all space-y-4 flex flex-col justify-between text-white',
                  m.isLive
                    ? 'border-[#FF168B] ring-2 ring-[#FF168B]/40 shadow-[0_0_20px_rgba(255,22,139,0.25)]'
                    : 'border-white/20 hover:border-[#FFFF00]/50'
                )}
              >
                {/* Header: Tournament + Round + Side + Status */}
                <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <span className="text-sm font-black text-white font-display uppercase tracking-wider block line-clamp-1">
                      {m.tournamentName}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-white/70 font-semibold">
                        {m.roundName}
                      </span>
                      <span className="text-[10px] font-black text-[#FFFF00] uppercase px-2 py-0.5 rounded-full bg-[#0A0A7A] border border-white/10">
                        {m.userSide.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {m.isLive ? (
                      <Badge className="bg-[#FF168B] text-white font-black text-[10px] animate-pulse px-2.5 py-0.5 border-0 gap-1 rounded-full uppercase tracking-wider shadow-md">
                        <Radio className="h-3 w-3" />
                        LIVE
                      </Badge>
                    ) : isCompleted ? (
                      isWon ? (
                        <Badge className="bg-[#00C853] text-[#08088F] font-black text-[10px] px-2.5 py-0.5 border-0 rounded-full uppercase tracking-wider shadow-sm">
                          VICTORY
                        </Badge>
                      ) : isLost ? (
                        <Badge variant="destructive" className="font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                          DEFEAT
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] font-black text-white border-white/30 rounded-full uppercase tracking-wider">
                          DRAW
                        </Badge>
                      )
                    ) : (
                      <Badge variant="secondary" className="bg-[#0A0A7A] text-white border border-white/20 text-[10px] font-black rounded-full uppercase tracking-wider">
                        {m.status}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Score / Matchup Display */}
                <div className="grid grid-cols-7 items-center gap-2 py-3 bg-[#0A0A7A]/60 rounded-2xl px-4 border border-white/10">
                  {/* You */}
                  <div className="col-span-3 min-w-0 flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full bg-[#1818D4] border border-[#FFFF00]/60 flex items-center justify-center font-black text-xs text-[#FFFF00] shrink-0">
                      {userDisplayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-black text-[#FFFF00] uppercase tracking-wider block">
                        You ({m.userSide})
                      </span>
                      <span className="text-xs sm:text-sm font-black text-white truncate block">
                        {userDisplayName}
                      </span>
                    </div>
                  </div>

                  {/* Scoreboard */}
                  <div className="col-span-1 text-center shrink-0">
                    {isCompleted || m.isLive ? (
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-1.5 text-xl font-black text-[#FFFF00] font-display">
                          <span>{m.userScore}</span>
                          <span className="text-white/40 text-sm">-</span>
                          <span>{m.opponentScore}</span>
                        </div>
                        {m.decidedBy === 'penalties' && (
                          <span className="text-[9px] font-bold text-white/60 tracking-wider">
                            ({m.userPenalties ?? 0} - {m.opponentPenalties ?? 0} pens)
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-[#08088F] border border-white/20 mx-auto flex items-center justify-center text-[10px] font-black text-[#FFFF00]">
                        VS
                      </div>
                    )}
                  </div>

                  {/* Opponent */}
                  <div className="col-span-3 min-w-0 flex items-center justify-end gap-2.5 text-right">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider block">
                        Opponent ({m.userSide === 'home' ? 'away' : 'home'})
                      </span>
                      <OpponentWhatsAppButton
                        match={m}
                        yourName={userDisplayName}
                      />
                    </div>
                    <div className="h-9 w-9 rounded-full bg-[#08088F] border border-white/20 flex items-center justify-center font-black text-xs text-white/80 shrink-0">
                      {(m.opponentDisplayName || m.opponentUsername).charAt(0).toUpperCase()}
                    </div>
                  </div>
                </div>

                {/* Footer: Scheduled time or live room link */}
                <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-white/70">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-white/50" />
                    <span>
                      {m.scheduledTime ? formatDate(m.scheduledTime) : 'Schedule pending'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {m.isLive ? (
                      <Button asChild size="sm" className="h-8 text-xs font-black bg-[#FF168B] hover:bg-[#FF168B]/90 text-white rounded-full gap-1.5 shadow-md uppercase tracking-wider cursor-pointer">
                        <Link href={`/live/${m.id}`}>
                          <span>Join Live Match</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-black text-[#FFFF00] hover:text-white hover:bg-white/10 rounded-full gap-1 uppercase tracking-wider cursor-pointer">
                        <Link href={`/tournaments/${m.tournamentId}`}>
                          <span>View Bracket</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
