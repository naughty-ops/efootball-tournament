'use client';

import React, { useState } from 'react';
import { Swords, ChevronDown, ChevronUp, CheckCircle2, Radio, Clock, Eye, EyeOff, Filter } from 'lucide-react';
import type { RoundWithMatches } from '@/services/matchService';
import type { GroupStageOverview } from '@/services/groupService';
import type { FullMatchData } from '@/services/matchService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PublicMatchesTabProps {
  rounds: RoundWithMatches[];
  groupStage: GroupStageOverview | null;
}

function MatchCard({ match }: { match: FullMatchData }) {
  const isLive = match.status === 'live';
  const isCompleted = match.status === 'completed' || match.status === 'walkover';
  const isDraw = isCompleted && match.status === 'completed' && match.score_a === match.score_b && !match.winner_id;
  const isWalkover = match.status === 'walkover';

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all',
        isLive ? 'border-red-200 bg-red-50/50 shadow-sm' : 'border-border bg-white hover:border-primary/30'
      )}
    >
      {/* Status top row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Match {String(match.match_position).padStart(2, '0')}
        </span>
        <div className="flex items-center gap-1.5">
          {isLive && (
            <Badge className="bg-red-500 hover:bg-red-500 text-white border-0 gap-1 text-[10px] font-bold">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
              </span>
              LIVE
            </Badge>
          )}
          {isCompleted && !isDraw && !isWalkover && (
            <Badge variant="secondary" className="text-[10px] font-bold">COMPLETED</Badge>
          )}
          {isDraw && (
            <Badge variant="outline" className="text-[10px] font-bold text-amber-600 border-amber-300">DRAW</Badge>
          )}
          {isWalkover && (
            <Badge variant="outline" className="text-[10px] font-bold text-muted-foreground">WALKOVER</Badge>
          )}
          {!isLive && !isCompleted && (
            <Badge variant="outline" className="text-[10px] font-bold text-muted-foreground">SCHEDULED</Badge>
          )}
        </div>
      </div>

      {/* Scoreboard */}
      <div className="flex items-center gap-3">
        {/* Participant A */}
        <div className="flex-1 min-w-0 text-right">
          <p className={cn(
            'text-sm font-bold truncate',
            isCompleted && !isDraw && match.winner_id === match.participant_a
              ? 'text-[#0B3323]'
              : isCompleted ? 'text-muted-foreground' : 'text-[#0B3323]'
          )}>
            {match.participantAUser?.username ?? 'TBD'}
          </p>
          {isCompleted && !isDraw && match.winner_id === match.participant_a && (
            <span className="text-[10px] font-bold text-emerald-600">WINNER</span>
          )}
        </div>

        {/* Score center */}
        <div className="flex items-center gap-2 shrink-0">
          {isCompleted || isLive ? (
            <>
              <span className={cn(
                'text-2xl font-black tabular-nums w-7 text-center',
                isLive ? 'text-red-600' : 'text-[#0B3323]'
              )}>
                {match.score_a ?? 0}
              </span>
              <span className={cn('font-bold text-sm', isLive ? 'text-red-400' : 'text-muted-foreground/60')}>—</span>
              <span className={cn(
                'text-2xl font-black tabular-nums w-7 text-center',
                isLive ? 'text-red-600' : 'text-[#0B3323]'
              )}>
                {match.score_b ?? 0}
              </span>
            </>
          ) : (
            <span className="text-sm font-bold text-muted-foreground/60 px-2">vs</span>
          )}
        </div>

        {/* Participant B */}
        <div className="flex-1 min-w-0 text-left">
          <p className={cn(
            'text-sm font-bold truncate',
            isCompleted && !isDraw && match.winner_id === match.participant_b
              ? 'text-[#0B3323]'
              : isCompleted ? 'text-muted-foreground' : 'text-[#0B3323]'
          )}>
            {match.participantBUser?.username ?? 'TBD'}
          </p>
          {isCompleted && !isDraw && match.winner_id === match.participant_b && (
            <span className="text-[10px] font-bold text-emerald-600">WINNER</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PublicMatchesTab({ rounds, groupStage }: PublicMatchesTabProps) {
  const [showCompleted, setShowCompleted] = useState<boolean>(false);
  const [viewFilter, setViewFilter] = useState<'upcoming_live' | 'completed' | 'all'>('upcoming_live');

  if (rounds.length === 0 && (!groupStage || groupStage.groups.every((g) => g.matches.length === 0))) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-white p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary mb-3">
          <Swords className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-bold text-[#0B3323]">No matches have been scheduled yet</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Matches will appear here once fixtures are created.
        </p>
      </div>
    );
  }

  // Collect all matches
  const allMatchesList: FullMatchData[] = [];
  if (groupStage) {
    for (const g of groupStage.groups) {
      allMatchesList.push(...g.matches);
    }
  }
  for (const r of rounds) {
    allMatchesList.push(...r.matches);
  }

  // Separate into completed vs upcoming/live
  const completedMatches = allMatchesList.filter((m) => m.status === 'completed' || m.status === 'walkover');
  const liveMatches = allMatchesList.filter((m) => m.status === 'live');
  const upcomingMatches = allMatchesList.filter((m) => m.status === 'pending');

  const isSingleLeague = groupStage?.groups.length === 1;

  // Build sections for upcoming/live
  const upcomingLiveSections: { label: string; isFinal: boolean; matches: FullMatchData[] }[] = [];
  const completedSections: { label: string; isFinal: boolean; matches: FullMatchData[] }[] = [];

  if (groupStage && groupStage.groups.some((g) => g.matches.length > 0)) {
    for (const group of groupStage.groups) {
      const active = group.matches.filter((m) => m.status !== 'completed' && m.status !== 'walkover');
      const finished = group.matches.filter((m) => m.status === 'completed' || m.status === 'walkover');

      if (active.length > 0) {
        upcomingLiveSections.push({ label: isSingleLeague ? 'League Fixtures' : group.group.name, isFinal: false, matches: active });
      }
      if (finished.length > 0) {
        completedSections.push({ label: isSingleLeague ? 'Completed League Matches' : `${group.group.name} (Completed)`, isFinal: false, matches: finished });
      }
    }
  }

  for (const round of rounds) {
    if (round.name.toLowerCase().includes('group stage')) continue;
    if (round.matches.length === 0) continue;

    const isFinal = round.name.toLowerCase().includes('final');
    const active = round.matches.filter((m) => m.status !== 'completed' && m.status !== 'walkover');
    const finished = round.matches.filter((m) => m.status === 'completed' || m.status === 'walkover');

    if (active.length > 0) {
      upcomingLiveSections.push({ label: round.name, isFinal, matches: active });
    }
    if (finished.length > 0) {
      completedSections.push({ label: `${round.name} (Finished)`, isFinal, matches: finished });
    }
  }

  return (
    <div className="space-y-6">
      {/* Live Standings Table inline with matches */}
      {groupStage && groupStage.groups.length > 0 && (
        <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-xs space-y-2 p-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-xs font-extrabold text-[#0B3323] uppercase tracking-wider flex items-center gap-1.5">
              <span>{isSingleLeague ? '🏆 Live League Standings' : '🏆 Group Standings'}</span>
            </h3>
            <span className="text-[10px] text-muted-foreground font-semibold">
              Top {groupStage.qualifiersPerGroup} Qualification Cutoff
            </span>
          </div>
          <div className="w-full overflow-x-auto no-scrollbar pt-1">
            <table className="w-full min-w-[480px] text-xs">
              <thead>
                <tr className="border-b border-border bg-[#F4F8F5]">
                  <th className="text-left py-2 px-3 font-bold text-[#0B3323]">Player</th>
                  <th className="py-2 px-2 font-bold text-center text-muted-foreground">P</th>
                  <th className="py-2 px-2 font-bold text-center text-emerald-600">W</th>
                  <th className="py-2 px-2 font-bold text-center text-amber-600">D</th>
                  <th className="py-2 px-2 font-bold text-center text-red-500">L</th>
                  <th className="py-2 px-2 font-bold text-center text-muted-foreground">GF</th>
                  <th className="py-2 px-2 font-bold text-center text-muted-foreground">GA</th>
                  <th className="py-2 px-2 font-bold text-center text-muted-foreground">GD</th>
                  <th className="py-2 px-2 font-bold text-center text-[#0B3323]">PTS</th>
                </tr>
              </thead>
              <tbody>
                {(groupStage.groups[0]?.standings || []).map((row, idx) => {
                  const isTopQual = idx < groupStage.qualifiersPerGroup;
                  return (
                    <tr key={row.participant.id} className={cn('border-b border-border/40 last:border-0 hover:bg-[#F4F8F5]/60 transition-colors', isTopQual ? 'bg-emerald-50/40 font-semibold' : '')}>
                      <td className="py-2 px-3 flex items-center gap-2">
                        <span className={cn('flex h-4 w-4 items-center justify-center rounded text-[9px] font-black', isTopQual ? 'bg-emerald-500 text-white' : 'bg-secondary text-muted-foreground')}>
                          {idx + 1}
                        </span>
                        <span className="font-bold text-[#0B3323] truncate max-w-[120px]">{row.participant.username}</span>
                        {idx === 0 && <span className="text-[10px]">🏆</span>}
                      </td>
                      <td className="py-2 px-2 text-center text-muted-foreground">{row.played}</td>
                      <td className="py-2 px-2 text-center text-emerald-600 font-semibold">{row.wins}</td>
                      <td className="py-2 px-2 text-center text-amber-600 font-semibold">{row.draws}</td>
                      <td className="py-2 px-2 text-center text-red-500 font-semibold">{row.losses}</td>
                      <td className="py-2 px-2 text-center text-muted-foreground">{row.goalsFor}</td>
                      <td className="py-2 px-2 text-center text-muted-foreground">{row.goalsAgainst}</td>
                      <td className="py-2 px-2 text-center font-bold">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                      <td className="py-2 px-2 text-center font-black text-[#0B3323]">{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filter / View Switcher Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-2xl bg-white border border-border shadow-2xs">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setViewFilter('upcoming_live')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewFilter === 'upcoming_live'
                ? 'bg-primary text-white shadow-2xs'
                : 'bg-[#F4F8F5] text-slate-700 hover:bg-[#E4ECE7]'
            }`}
          >
            <span>⚡ Live & Upcoming ({liveMatches.length + upcomingMatches.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setViewFilter('completed')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewFilter === 'completed'
                ? 'bg-primary text-white shadow-2xs'
                : 'bg-[#F4F8F5] text-slate-700 hover:bg-[#E4ECE7]'
            }`}
          >
            <span>✓ Completed ({completedMatches.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setViewFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              viewFilter === 'all'
                ? 'bg-primary text-white shadow-2xs'
                : 'bg-[#F4F8F5] text-slate-700 hover:bg-[#E4ECE7]'
            }`}
          >
            <span>All Fixtures ({allMatchesList.length})</span>
          </button>
        </div>

        {completedMatches.length > 0 && viewFilter === 'upcoming_live' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCompleted(!showCompleted)}
            className="h-8 text-xs font-bold text-emerald-800 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 gap-1 rounded-xl"
          >
            {showCompleted ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span>{showCompleted ? 'Hide Completed Matches' : `Show Completed Matches (${completedMatches.length})`}</span>
          </Button>
        )}
      </div>

      {/* Completed Matches Collapsible Section (Hidden initially when viewFilter is 'upcoming_live') */}
      {completedMatches.length > 0 && (viewFilter === 'completed' || (viewFilter === 'upcoming_live' && showCompleted) || viewFilter === 'all') && (
        <div className="space-y-3 p-4 rounded-2xl border border-emerald-200 bg-emerald-50/30">
          <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Completed Match Results ({completedMatches.length} Played)</span>
            </h4>
            <Badge className="bg-emerald-600 text-white font-bold text-[10px]">
              Final Results
            </Badge>
          </div>

          <div className="space-y-4">
            {completedSections.map(({ label, isFinal, matches }) => (
              <div key={label} className="space-y-2">
                <p className="text-[11px] font-bold uppercase text-emerald-900 tracking-wider">
                  {label}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {matches.map((m) => <MatchCard key={m.id} match={m} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live & Upcoming Matches Section */}
      {(viewFilter === 'upcoming_live' || viewFilter === 'all') && (
        <>
          {upcomingLiveSections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center space-y-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
              <h4 className="text-sm font-bold text-[#0B3323]">All Scheduled Fixtures Completed!</h4>
              <p className="text-xs text-muted-foreground">
                All matches for this phase have been played. Expand completed matches above to view final results.
              </p>
            </div>
          ) : (
            upcomingLiveSections.map(({ label, isFinal, matches }) => (
              <div key={label} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  {isFinal && <span className="text-lg">🏆</span>}
                  <h3 className={cn(
                    'text-sm font-bold uppercase tracking-wide',
                    isFinal ? 'text-amber-700' : 'text-[#0B3323]'
                  )}>
                    {label}
                  </h3>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {matches.map((m) => <MatchCard key={m.id} match={m} />)}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
