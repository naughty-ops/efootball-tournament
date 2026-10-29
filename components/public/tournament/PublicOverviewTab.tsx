'use client';

import React from 'react';
import { Users, Target, GitBranch, Trophy, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TournamentWithStats } from '@/services/tournamentService';
import type { GroupStageOverview } from '@/services/groupService';
import type { BracketOverview } from '@/services/bracketService';
import { SeasonStatsCards } from '@/components/tournament/SeasonStatsCards';
import { TournamentRegistrationCard } from '@/components/tournament/TournamentRegistrationCard';

interface PublicOverviewTabProps {
  tournament: TournamentWithStats;
  groupStage: GroupStageOverview | null;
  bracket: BracketOverview | null;
}

function formatTournamentFormat(format: string) {
  switch (format) {
    case 'group_knockout':
    case 'single_league_knockout': return 'League + Knockout';
    case 'knockout': return 'Single Elimination Knockout';
    case 'league': return 'League / Round Robin';
    default: return format.replace(/_/g, ' ');
  }
}

export default function PublicOverviewTab({
  tournament,
  groupStage,
  bracket,
}: PublicOverviewTabProps) {
  const isCompleted = tournament.status === 'completed';
  const champion = tournament.championUser;
  const runnerUp = tournament.runnerUpUser;

  const stats: { icon: React.ElementType; label: string; value: string }[] = [
    {
      icon: Users,
      label: 'Participants',
      value: `${tournament.participant_count} / ${tournament.max_participants}`,
    },
    ...(groupStage && groupStage.groups.length > 0 ? [
      {
        icon: Target,
        label: 'Groups',
        value: `${groupStage.groups.length}`,
      },
      {
        icon: Info,
        label: 'Qualification',
        value: `Top ${groupStage.qualifiersPerGroup} per group`,
      },
      {
        icon: Info,
        label: 'Rounds per Pair',
        value: `${groupStage.roundsPerPair} ${groupStage.roundsPerPair === 1 ? 'round' : 'rounds'}`,
      },
    ] : []),
    ...(bracket && bracket.rounds.length > 0 ? [
      {
        icon: GitBranch,
        label: 'Knockout Rounds',
        value: `${bracket.totalRounds}`,
      },
      {
        icon: Users,
        label: 'Bracket Size',
        value: `${bracket.bracketSize}`,
      },
    ] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Championship Honor Roll Banner if Completed */}
      {isCompleted && (
        <div className="rounded-[32px] bg-[#1010C5] border border-[#FFFF00]/40 p-6 shadow-2xl text-white space-y-4">
          <div className="flex items-center justify-between border-b border-white/20 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="bg-[#FFFF00] text-[#08088F] font-black text-[10px] uppercase tracking-widest px-3 py-1 rounded-full">
                CHAMPIONSHIP RESULT
              </span>
              <span className="text-xs text-[#FFFF00] font-black uppercase tracking-wider">Official Winner</span>
            </div>
            {tournament.completed_at && (
              <span className="text-[11px] text-[#D9DCFF]/70 font-mono">
                Completed {new Date(tournament.completed_at).toLocaleDateString()}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Champion Card */}
            <div className="p-5 rounded-2xl bg-[#3434FF] border border-[#FFFF00]/50 space-y-1 shadow-lg">
              <div className="flex items-center gap-2 text-[#FFFF00] text-xs font-black uppercase tracking-wider">
                <Trophy className="h-4 w-4 text-[#FFFF00]" />
                <span>🏆 TOURNAMENT CHAMPION</span>
              </div>
              <p className="text-2xl sm:text-3xl font-black font-display uppercase tracking-wide text-white truncate">
                {champion?.username || 'Champion TBD'}
              </p>
            </div>

            {/* Runner Up Card */}
            {runnerUp && (
              <div className="p-5 rounded-2xl bg-[#0A0A7A] border border-white/20 space-y-1">
                <div className="flex items-center gap-2 text-[#D9DCFF] text-xs font-bold uppercase tracking-wider">
                  <Badge variant="outline" className="text-[9px] font-bold border-white/30 text-white">2nd</Badge>
                  <span>🥈 RUNNER-UP</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold font-display uppercase text-white truncate">
                  {runnerUp.username}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tournament Registration Card */}
      <TournamentRegistrationCard tournament={tournament} />

      {/* Format card */}
      <Card className="bg-[#1818D4] border-white/20 text-white rounded-[28px] shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-black font-display uppercase tracking-wider text-white flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[#FFFF00]" />
            Tournament Format
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm font-bold text-[#FFFF00]">
            {formatTournamentFormat(tournament.format)}
          </p>
          {tournament.rules_text && (
            <p className="text-xs text-[#D9DCFF]/90 mt-2 leading-relaxed whitespace-pre-line font-medium">
              {tournament.rules_text}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {stats.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="flex flex-col gap-1.5 rounded-2xl border border-white/20 bg-[#1010C5] p-4 shadow-md"
          >
            <div className="flex items-center gap-1.5 text-[#D9DCFF]/80">
              <Icon className="h-3.5 w-3.5 text-[#FFFF00]" />
              <span className="text-[11px] font-black uppercase tracking-wider">{label}</span>
            </div>
            <span className="text-xl font-black font-display tracking-wide text-white">{value}</span>
          </div>
        ))}
      </div>

      {/* Group stage progress */}
      {groupStage && groupStage.totalGroupMatches > 0 && (
        <Card className="bg-[#1818D4] border-white/20 text-white rounded-[28px] shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black font-display uppercase tracking-wider text-white">Group Stage Progress</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="flex items-center justify-between text-xs text-[#D9DCFF]">
              <span className="font-medium">Matches Completed</span>
              <span className="font-black text-[#FFFF00]">
                {groupStage.completedGroupMatches} / {groupStage.totalGroupMatches}
              </span>
            </div>
            <div className="w-full bg-[#0A0A7A] rounded-full h-2.5 overflow-hidden border border-white/10">
              <div
                className="bg-[#FFFF00] rounded-full h-full transition-all duration-500 shadow-[0_0_10px_rgba(255,255,0,0.5)]"
                style={{
                  width: `${groupStage.totalGroupMatches > 0
                    ? Math.round((groupStage.completedGroupMatches / groupStage.totalGroupMatches) * 100)
                    : 0}%`
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#D9DCFF]/80 font-medium">
                {groupStage.isGroupStageComplete ? '✓ Group stage complete' : 'In progress'}
              </span>
              {groupStage.isFinalized && (
                <span className="bg-[#FFFF00] text-[#08088F] font-black text-[10px] uppercase px-2.5 py-0.5 rounded-full">
                  Finalized
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Season Stats Cards */}
      <SeasonStatsCards tournamentId={tournament.id} />

      {/* Bracket status */}
      {bracket && bracket.rounds.length > 0 && (
        <Card className="bg-[#1818D4] border-white/20 text-white rounded-[28px] shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black font-display uppercase tracking-wider text-white">Knockout Stage</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-3">
              <span className={
                bracket.status === 'Completed'
                  ? 'bg-[#FFFF00] text-[#08088F] font-black text-xs uppercase px-3 py-1 rounded-full'
                  : bracket.status === 'In Progress'
                  ? 'bg-[#3434FF] text-white font-black text-xs uppercase px-3 py-1 rounded-full border border-white/20'
                  : 'bg-[#0A0A7A] text-[#D9DCFF] font-bold text-xs uppercase px-3 py-1 rounded-full'
              }>
                {bracket.status}
              </span>
              <span className="text-xs text-[#D9DCFF]/90 font-medium">
                {bracket.totalRounds} round{bracket.totalRounds !== 1 ? 's' : ''}
                {bracket.byesCount > 0 && ` · ${bracket.byesCount} bye${bracket.byesCount !== 1 ? 's' : ''}`}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
