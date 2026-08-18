'use client';

import React, { useState } from 'react';
import { Swords, CheckCircle2, Radio, Clock, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import type { RoundWithMatches } from '@/services/matchService';
import type { GroupStageOverview } from '@/services/groupService';
import type { FullMatchData } from '@/services/matchService';
import { Badge } from '@/components/ui/badge';
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
  const [showFinishedMatchdays, setShowFinishedMatchdays] = useState<boolean>(false);

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

  const isSingleLeague = groupStage?.groups.length === 1;

  // Build Matchday / Round Sections
  interface MatchdaySection {
    id: string;
    label: string;
    roundNumber: number;
    isCompleted: boolean;
    isFinal: boolean;
    matches: FullMatchData[];
  }

  const matchdaySections: MatchdaySection[] = [];

  if (rounds.length > 0) {
    for (const r of rounds) {
      if (r.matches.length === 0) continue;
      const isCompleted = r.matches.length > 0 && r.matches.every((m) => m.status === 'completed' || m.status === 'walkover');
      const isFinal = r.name.toLowerCase().includes('final');

      matchdaySections.push({
        id: r.id,
        label: r.name,
        roundNumber: r.round_number || 1,
        isCompleted,
        isFinal,
        matches: r.matches,
      });
    }
  } else if (groupStage) {
    for (const gDet of groupStage.groups) {
      if (gDet.matches.length === 0) continue;

      const roundMap = new Map<string, FullMatchData[]>();
      for (const m of gDet.matches) {
        const rKey = m.round_id || 'r1';
        const list = roundMap.get(rKey) || [];
        list.push(m);
        roundMap.set(rKey, list);
      }

      let rNum = 1;
      for (const [rId, mList] of roundMap) {
        const isCompleted = mList.length > 0 && mList.every((m) => m.status === 'completed' || m.status === 'walkover');
        matchdaySections.push({
          id: rId,
          label: isSingleLeague ? `Matchday ${rNum}` : `${gDet.group.name} — Round ${rNum}`,
          roundNumber: rNum,
          isCompleted,
          isFinal: false,
          matches: mList,
        });
        rNum++;
      }
    }
  }

  // Filter out completed matchdays AUTOMATICALLY (No button required!)
  const activeMatchdaySections = matchdaySections.filter((sec) => !sec.isCompleted);
  const finishedMatchdaySections = matchdaySections.filter((sec) => sec.isCompleted);

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

      {/* ACTIVE MATCHDAYS (Automatically displayed; completed matchdays hidden automatically!) */}
      {activeMatchdaySections.length > 0 ? (
        <div className="space-y-6">
          {activeMatchdaySections.map(({ label, isFinal, matches }) => (
            <div key={label} className="space-y-2.5">
              <div className="flex items-center gap-2">
                {isFinal ? <span className="text-lg">🏆</span> : <Clock className="h-4 w-4 text-emerald-600" />}
                <h3 className={cn(
                  'text-sm font-black uppercase tracking-wide',
                  isFinal ? 'text-amber-700' : 'text-[#0B3323]'
                )}>
                  {label}
                </h3>
                <Badge variant="outline" className="text-[10px] font-bold bg-[#F4F8F5] text-emerald-800 border-emerald-300">
                  Active Matchday
                </Badge>
                <div className="flex-1 h-px bg-border/50" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {matches.map((m) => <MatchCard key={m.id} match={m} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* If all matchdays in the tournament are completed */
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50/50 p-6 text-center space-y-2">
          <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
          <h3 className="text-base font-black text-emerald-950">🏆 All Matchdays Completed!</h3>
          <p className="text-xs text-emerald-800">
            All matchday fixtures have been played. Check the live Points Table above for final standings.
          </p>
        </div>
      )}

      {/* Optional History Section for Finished Matchdays */}
      {finishedMatchdaySections.length > 0 && (
        <div className="pt-4 border-t border-border/60">
          <button
            type="button"
            onClick={() => setShowFinishedMatchdays(!showFinishedMatchdays)}
            className="flex items-center justify-between w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>Finished Matchdays History ({finishedMatchdaySections.length} Matchdays Completed)</span>
            </span>
            {showFinishedMatchdays ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showFinishedMatchdays && (
            <div className="space-y-6 pt-4">
              {finishedMatchdaySections.map(({ label, isFinal, matches }) => (
                <div key={label} className="space-y-2 opacity-80">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <h4 className="text-xs font-extrabold uppercase text-slate-600">
                      {label} (Completed)
                    </h4>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {matches.map((m) => <MatchCard key={m.id} match={m} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
