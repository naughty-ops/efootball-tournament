'use client';

import React from 'react';
import { Swords } from 'lucide-react';
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
  const isDraw = isCompleted && match.score_a === match.score_b && !match.winner_id;
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

  // Build unified match sections
  const sections: { label: string; isFinal: boolean; matches: FullMatchData[] }[] = [];

  // Group stage matches
  if (groupStage && groupStage.groups.some((g) => g.matches.length > 0)) {
    const roundsPerPair = groupStage.roundsPerPair;
    if (roundsPerPair > 1) {
      // Show by round within each group
      for (const group of groupStage.groups) {
        const roundMap = new Map<string, FullMatchData[]>();
        for (const m of group.matches) {
          const roundId = m.round_id ?? 'r1';
          const list = roundMap.get(roundId) ?? [];
          list.push(m);
          roundMap.set(roundId, list);
        }
        let rIdx = 1;
        for (const [, matches] of roundMap) {
          sections.push({ label: `${group.group.name} — Round ${rIdx}`, isFinal: false, matches });
          rIdx++;
        }
      }
    } else {
      for (const group of groupStage.groups) {
        if (group.matches.length > 0) {
          sections.push({ label: group.group.name, isFinal: false, matches: group.matches });
        }
      }
    }
  }

  // Knockout rounds
  for (const round of rounds) {
    // Skip group stage rounds (they're already covered above)
    if (round.name.toLowerCase().includes('group stage')) continue;
    if (round.matches.length === 0) continue;

    const isFinal = round.name.toLowerCase().includes('final');
    sections.push({ label: round.name, isFinal, matches: round.matches });
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-white p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary mb-3">
          <Swords className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-bold text-[#0B3323]">No matches have been scheduled yet</h3>
        <p className="text-xs text-muted-foreground mt-1">Fixtures will appear here once they are created.</p>
      </div>
    );
  }

  const isSingleLeague = groupStage?.groups.length === 1;

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
              Top {groupStage.qualifiersPerGroup} advance to Knockout
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

      {sections.map(({ label, isFinal, matches }) => (
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
          <div className="space-y-2">
            {matches.map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
