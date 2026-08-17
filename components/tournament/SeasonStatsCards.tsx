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
        <h3 className="text-sm font-extrabold text-[#0B3323] uppercase tracking-wider flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span>Season Statistics & Honor Roll</span>
        </h3>
        <Badge variant="outline" className="text-[10px] font-mono font-bold text-muted-foreground">
          Live Season Records
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* League Shield Leader */}
        {mostPoints && (
          <Card className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-white border-amber-300/60 shadow-2xs relative overflow-hidden">
            <CardHeader className="pb-1.5 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-extrabold text-amber-950 flex items-center gap-1.5">
                <Trophy className="h-4 w-4 text-amber-600" />
                <span>League Leader / Shield</span>
              </CardTitle>
              <Badge className="bg-amber-500 text-white text-[9px] font-black">
                {mostPoints.points} PTS
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              <span className="font-extrabold text-[#0B3323] text-sm block">
                {mostPoints.participant.username}
              </span>
              <p className="text-[11px] text-muted-foreground">
                {mostPoints.wins} Wins, {mostPoints.draws} Draws in {mostPoints.played} matches
              </p>
            </CardContent>
          </Card>
        )}

        {/* Top Scorer / Golden Boot */}
        {topScorer && (
          <Card className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white border-emerald-300/60 shadow-2xs">
            <CardHeader className="pb-1.5 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                <Award className="h-4 w-4 text-emerald-600" />
                <span>Golden Boot / Top Scorer</span>
              </CardTitle>
              <Badge className="bg-emerald-600 text-white text-[9px] font-black">
                ⚽ {topScorer.goalsFor} Goals
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              <span className="font-extrabold text-[#0B3323] text-sm block">
                {topScorer.participant.username}
              </span>
              <p className="text-[11px] text-muted-foreground">
                Avg {(topScorer.goalsFor / Math.max(1, topScorer.played)).toFixed(1)} goals per match
              </p>
            </CardContent>
          </Card>
        )}

        {/* Most Wins */}
        {mostWins && (
          <Card className="bg-white border-border shadow-2xs">
            <CardHeader className="pb-1.5 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-extrabold text-[#0B3323] flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-primary" />
                <span>Most Victories</span>
              </CardTitle>
              <Badge variant="efootball" className="text-[9px] font-black">
                {mostWins.wins} Wins
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              <span className="font-extrabold text-[#0B3323] text-sm block">
                {mostWins.participant.username}
              </span>
              <p className="text-[11px] text-muted-foreground">
                Win Rate: {Math.round((mostWins.wins / Math.max(1, mostWins.played)) * 100)}%
              </p>
            </CardContent>
          </Card>
        )}

        {/* Best Defense */}
        {fewestConceded && (
          <Card className="bg-white border-border shadow-2xs">
            <CardHeader className="pb-1.5 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-extrabold text-[#0B3323] flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <span>Best Defense</span>
              </CardTitle>
              <Badge variant="outline" className="text-[9px] font-black text-blue-700 border-blue-300">
                {fewestConceded.goalsAgainst} Conceded
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              <span className="font-extrabold text-[#0B3323] text-sm block">
                {fewestConceded.participant.username}
              </span>
              <p className="text-[11px] text-muted-foreground">
                {fewestConceded.cleanSheets} Clean Sheets
              </p>
            </CardContent>
          </Card>
        )}

        {/* Longest Winning Streak */}
        {longestWinStreak && (
          <Card className="bg-white border-border shadow-2xs">
            <CardHeader className="pb-1.5 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-extrabold text-[#0B3323] flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-orange-500" />
                <span>Winning Streak</span>
              </CardTitle>
              <Badge className="bg-orange-500 text-white text-[9px] font-black">
                🔥 {longestWinStreak.count} Wins
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              <span className="font-extrabold text-[#0B3323] text-sm block">
                {longestWinStreak.participant.username}
              </span>
              <p className="text-[11px] text-muted-foreground">
                Consecutive victories in league play
              </p>
            </CardContent>
          </Card>
        )}

        {/* Biggest Win Margin */}
        {biggestWinMatch && (
          <Card className="bg-white border-border shadow-2xs">
            <CardHeader className="pb-1.5 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-extrabold text-[#0B3323] flex items-center gap-1.5">
                <Swords className="h-4 w-4 text-purple-600" />
                <span>Biggest Victory</span>
              </CardTitle>
              <Badge className="bg-purple-600 text-white text-[9px] font-black">
                +{biggestWinMatch.margin} GD
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              <span className="font-extrabold text-[#0B3323] text-sm block">
                {biggestWinMatch.winner.username}
              </span>
              <p className="text-[11px] text-muted-foreground">
                {biggestWinMatch.scoreText} vs {biggestWinMatch.loser.username}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
