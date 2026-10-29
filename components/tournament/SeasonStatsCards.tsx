'use client';

import React, { useState, useEffect } from 'react';
import { Trophy, Flame, ShieldCheck, Swords, Award, Zap, Activity } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getTournamentSeasonRecords, SeasonRecordsOverview } from '@/services/statsService';

interface SeasonStatsCardsProps {
  tournamentId: string;
}

export function SeasonStatsCards({ tournamentId }: SeasonStatsCardsProps) {
  const [records, setRecords] = useState<SeasonRecordsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const data = await getTournamentSeasonRecords(tournamentId);
        if (isMounted) setRecords(data);
      } catch (err) {
        console.error('Failed to load season stats:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [tournamentId]);

  if (loading || !records) {
    return null;
  }

  const { topScorer, mostWins, mostPoints, bestGoalDiff, fewestConceded, longestWinStreak, biggestWinMatch } = records;

  const hasAnyRecord = topScorer || mostWins || mostPoints || bestGoalDiff || longestWinStreak || biggestWinMatch;
  if (!hasAnyRecord) return null;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 font-display">
          <Activity className="h-4 w-4 text-[#FFFF00]" />
          <span>Season Statistics & Honor Roll</span>
        </h3>
        <Badge variant="outline" className="text-[10px] font-mono font-bold text-[#D9DCFF] border-white/20">
          Live Records
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {/* League Shield Leader */}
        {mostPoints && (
          <Card className="bg-[#1D1DE0] border border-white/20 text-white shadow-lg rounded-3xl">
            <CardHeader className="pb-1.5 flex flex-row items-center justify-between space-y-0 p-5">
              <CardTitle className="text-xs font-black text-[#FFFF00] flex items-center gap-1.5 uppercase font-display">
                <Trophy className="h-4 w-4 text-[#FFFF00]" />
                <span>League Leader</span>
              </CardTitle>
              <Badge className="bg-[#FFFF00] text-[#08088F] text-[10px] font-black rounded-full">
                {mostPoints.points} PTS
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1 text-xs p-5 pt-0">
              <span className="font-black text-white text-base block font-display">
                {mostPoints.participant.username}
              </span>
              <p className="text-[11px] text-[#D9DCFF]">
                {mostPoints.wins} Wins, {mostPoints.draws} Draws in {mostPoints.played} matches
              </p>
            </CardContent>
          </Card>
        )}

        {/* Top Scorer / Golden Boot */}
        {topScorer && (
          <Card className="bg-[#1D1DE0] border border-white/20 text-white shadow-lg rounded-3xl">
            <CardHeader className="pb-1.5 flex flex-row items-center justify-between space-y-0 p-5">
              <CardTitle className="text-xs font-black text-[#FFFF00] flex items-center gap-1.5 uppercase font-display">
                <Award className="h-4 w-4 text-[#FFFF00]" />
                <span>Golden Boot</span>
              </CardTitle>
              <Badge className="bg-[#FF168B] text-white text-[10px] font-black rounded-full">
                ⚽ {topScorer.goalsFor} Goals
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1 text-xs p-5 pt-0">
              <span className="font-black text-white text-base block font-display">
                {topScorer.participant.username}
              </span>
              <p className="text-[11px] text-[#D9DCFF]">
                Avg {(topScorer.goalsFor / Math.max(1, topScorer.played)).toFixed(1)} goals per match
              </p>
            </CardContent>
          </Card>
        )}

        {/* Most Wins */}
        {mostWins && (
          <Card className="bg-[#1D1DE0] border border-white/20 text-white shadow-lg rounded-3xl">
            <CardHeader className="pb-1.5 flex flex-row items-center justify-between space-y-0 p-5">
              <CardTitle className="text-xs font-black text-[#FFFF00] flex items-center gap-1.5 uppercase font-display">
                <Zap className="h-4 w-4 text-[#FFFF00]" />
                <span>Most Victories</span>
              </CardTitle>
              <Badge className="bg-[#FFFF00] text-[#08088F] text-[10px] font-black rounded-full">
                {mostWins.wins} Wins
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1 text-xs p-5 pt-0">
              <span className="font-black text-white text-base block font-display">
                {mostWins.participant.username}
              </span>
              <p className="text-[11px] text-[#D9DCFF]">
                Win Rate: {Math.round((mostWins.wins / Math.max(1, mostWins.played)) * 100)}%
              </p>
            </CardContent>
          </Card>
        )}

        {/* Best Defense */}
        {fewestConceded && (
          <Card className="bg-[#1D1DE0] border border-white/20 text-white shadow-lg rounded-3xl">
            <CardHeader className="pb-1.5 flex flex-row items-center justify-between space-y-0 p-5">
              <CardTitle className="text-xs font-black text-[#D9DCFF] flex items-center gap-1.5 uppercase font-display">
                <ShieldCheck className="h-4 w-4 text-[#FFFF00]" />
                <span>Best Defense</span>
              </CardTitle>
              <Badge variant="outline" className="text-[10px] font-black text-white border-white/20 rounded-full">
                {fewestConceded.goalsAgainst} Conceded
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1 text-xs p-5 pt-0">
              <span className="font-black text-white text-base block font-display">
                {fewestConceded.participant.username}
              </span>
              <p className="text-[11px] text-[#D9DCFF]">
                {fewestConceded.cleanSheets} Clean Sheets
              </p>
            </CardContent>
          </Card>
        )}

        {/* Longest Winning Streak */}
        {longestWinStreak && (
          <Card className="bg-[#1D1DE0] border border-white/20 text-white shadow-lg rounded-3xl">
            <CardHeader className="pb-1.5 flex flex-row items-center justify-between space-y-0 p-5">
              <CardTitle className="text-xs font-black text-[#FFFF00] flex items-center gap-1.5 uppercase font-display">
                <Flame className="h-4 w-4 text-[#FF168B]" />
                <span>Winning Streak</span>
              </CardTitle>
              <Badge className="bg-[#FF168B] text-white text-[10px] font-black rounded-full">
                🔥 {longestWinStreak.count} Wins
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1 text-xs p-5 pt-0">
              <span className="font-black text-white text-base block font-display">
                {longestWinStreak.participant.username}
              </span>
              <p className="text-[11px] text-[#D9DCFF]">
                Consecutive victories in league play
              </p>
            </CardContent>
          </Card>
        )}

        {/* Biggest Margin Win */}
        {biggestWinMatch && (
          <Card className="bg-[#1D1DE0] border border-white/20 text-white shadow-lg rounded-3xl">
            <CardHeader className="pb-1.5 flex flex-row items-center justify-between space-y-0 p-5">
              <CardTitle className="text-xs font-black text-[#D9DCFF] flex items-center gap-1.5 uppercase font-display">
                <Swords className="h-4 w-4 text-[#FFFF00]" />
                <span>Biggest Victory</span>
              </CardTitle>
              <Badge className="bg-[#FFFF00] text-[#08088F] text-[10px] font-black rounded-full">
                +{biggestWinMatch.margin} GD
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1 text-xs p-5 pt-0">
              <span className="font-black text-white text-base block font-display">
                {biggestWinMatch.winner.username}
              </span>
              <p className="text-[11px] text-[#D9DCFF]">
                {biggestWinMatch.scoreText} vs {biggestWinMatch.loser.username}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
