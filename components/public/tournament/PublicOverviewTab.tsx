'use client';

import React from 'react';
import { Users, Target, GitBranch, Trophy, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TournamentWithStats } from '@/services/tournamentService';
import type { GroupStageOverview } from '@/services/groupService';
import type { BracketOverview } from '@/services/bracketService';

interface PublicOverviewTabProps {
  tournament: TournamentWithStats;
  groupStage: GroupStageOverview | null;
  bracket: BracketOverview | null;
}

function formatTournamentFormat(format: string) {
  switch (format) {
    case 'group_knockout': return 'Group Stage → Knockout';
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
        <div className="rounded-3xl bg-gradient-to-b from-slate-900 via-[#0B2518] to-slate-950 border border-amber-500/40 p-6 shadow-xl text-white space-y-4">
          <div className="flex items-center justify-between border-b border-amber-500/20 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-500 text-slate-950 font-black text-[10px] uppercase tracking-widest px-2.5 py-0.5 border-0">
                CHAMPIONSHIP RESULT
              </Badge>
              <span className="text-xs text-amber-300 font-bold uppercase tracking-wider">Official Winner</span>
            </div>
            {tournament.completed_at && (
              <span className="text-[11px] text-slate-400 font-mono">
                Completed {new Date(tournament.completed_at).toLocaleDateString()}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Champion Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-amber-400/10 to-amber-500/20 border border-amber-400/50 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-300 text-xs font-black uppercase tracking-wider">
                <Trophy className="h-4 w-4 text-amber-400" />
                <span>🏆 TOURNAMENT CHAMPION</span>
              </div>
              <p className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 truncate">
                {champion?.username || 'Champion TBD'}
              </p>
            </div>

            {/* Runner Up Card */}
            {runnerUp && (
              <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <Badge variant="outline" className="text-[9px] font-bold border-slate-500 text-slate-300">2nd</Badge>
                  <span>🥈 RUNNER-UP</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-slate-200 truncate">
                  {runnerUp.username}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Format card */}
      <Card className="bg-white border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-[#0B3323] flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Tournament Format
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm font-semibold text-muted-foreground">
            {formatTournamentFormat(tournament.format)}
          </p>
          {tournament.rules_text && (
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed whitespace-pre-line">
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
            className="flex flex-col gap-1.5 rounded-2xl border border-border bg-white p-4 shadow-xs"
          >
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Icon className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
            </div>
            <span className="text-lg font-black text-[#0B3323]">{value}</span>
          </div>
        ))}
      </div>

      {/* Group stage progress */}
      {groupStage && groupStage.totalGroupMatches > 0 && (
        <Card className="bg-white border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-[#0B3323]">Group Stage Progress</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Matches Completed</span>
              <span className="font-bold text-[#0B3323]">
                {groupStage.completedGroupMatches} / {groupStage.totalGroupMatches}
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-primary rounded-full h-2 transition-all duration-500"
                style={{
                  width: `${groupStage.totalGroupMatches > 0
                    ? Math.round((groupStage.completedGroupMatches / groupStage.totalGroupMatches) * 100)
                    : 0}%`
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {groupStage.isGroupStageComplete ? '✓ Group stage complete' : 'In progress'}
              </span>
              {groupStage.isFinalized && (
                <Badge variant="efootball" className="text-[10px]">Finalized</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bracket status */}
      {bracket && bracket.rounds.length > 0 && (
        <Card className="bg-white border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-[#0B3323]">Knockout Stage</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-2">
              <Badge
                className={
                  bracket.status === 'Completed'
                    ? 'bg-emerald-500 text-white border-0'
                    : bracket.status === 'In Progress'
                    ? 'bg-blue-500 text-white border-0'
                    : ''
                }
                variant={bracket.status === 'Generated' ? 'secondary' : 'outline'}
              >
                {bracket.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
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
