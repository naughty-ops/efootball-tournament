'use client';

import React, { useState } from 'react';
import { Target, ChevronDown, ChevronUp } from 'lucide-react';
import type { GroupStageOverview, GroupDetails } from '@/services/groupService';
import type { GroupStandingRow } from '@/lib/group/groupEngine';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PublicGroupsTabProps {
  groupStage: GroupStageOverview | null;
}

function StandingsTable({
  standings,
  qualifiersPerGroup,
  isCompleted = false,
  isPureLeague = false,
}: {
  standings: GroupStandingRow[];
  qualifiersPerGroup: number;
  isCompleted?: boolean;
  isPureLeague?: boolean;
}) {
  return (
    <div className="w-full overflow-x-auto no-scrollbar">
      <table className="w-full min-w-[560px] text-xs">
        <thead>
          <tr className="border-b border-border bg-[#F4F8F5]">
            <th className="text-left py-2.5 px-3 font-bold text-[#0B3323] w-full">Player</th>
            <th className="py-2.5 px-2 font-bold text-center text-muted-foreground">P</th>
            <th className="py-2.5 px-2 font-bold text-center text-muted-foreground">W</th>
            <th className="py-2.5 px-2 font-bold text-center text-muted-foreground">D</th>
            <th className="py-2.5 px-2 font-bold text-center text-muted-foreground">L</th>
            <th className="py-2.5 px-2 font-bold text-center text-muted-foreground">GF</th>
            <th className="py-2.5 px-2 font-bold text-center text-muted-foreground">GA</th>
            <th className="py-2.5 px-2 font-bold text-center text-muted-foreground">GD</th>
            <th className="py-2.5 px-2 font-bold text-center text-primary">PTS</th>
            <th className="py-2.5 px-2 font-bold text-center text-muted-foreground">Form</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, idx) => {
            const isQualified = idx < qualifiersPerGroup;
            const isLeagueWinner = isCompleted && idx === 0;
            const isTopRank = !isCompleted && idx === 0;
            const isCutoffBorder = idx === qualifiersPerGroup - 1 && idx < standings.length - 1;

            return (
              <React.Fragment key={row.participant.id}>
                <tr
                  className={cn(
                    'border-b border-border/50 transition-colors',
                    isLeagueWinner
                      ? 'bg-amber-50/80 font-bold'
                      : isQualified
                      ? 'bg-emerald-50/60 font-semibold'
                      : 'bg-white hover:bg-[#F4F8F5]/60 text-muted-foreground'
                  )}
                >
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-black',
                        isLeagueWinner ? 'bg-amber-500 text-white' : isQualified ? 'bg-emerald-500 text-white' : 'bg-secondary text-muted-foreground'
                      )}>
                        {idx + 1}
                      </span>
                      <span className={cn('font-bold truncate max-w-[130px]', isLeagueWinner ? 'text-amber-950 font-black' : isQualified ? 'text-[#0B3323]' : 'text-muted-foreground')}>
                        {row.participant.username}
                      </span>
                      {isLeagueWinner && (
                        <Badge className="text-[9px] py-0 px-1.5 bg-amber-500 text-white font-extrabold shadow-2xs border-amber-600 shrink-0">
                          🏆 Champion
                        </Badge>
                      )}
                      {isTopRank && (
                        <Badge className="text-[9px] py-0 px-1.5 bg-emerald-600 text-white font-bold shrink-0">
                          🟢 1st Place
                        </Badge>
                      )}
                      {isQualified && !isLeagueWinner && !isTopRank && (
                        <Badge className="text-[9px] py-0 px-1.5 bg-emerald-600 text-white font-bold shrink-0">
                          🟢 Qualified
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-center font-semibold text-muted-foreground">{row.played}</td>
                  <td className="py-2.5 px-2 text-center font-semibold text-emerald-600">{row.wins}</td>
                  <td className="py-2.5 px-2 text-center font-semibold text-amber-600">{row.draws}</td>
                  <td className="py-2.5 px-2 text-center font-semibold text-red-500">{row.losses}</td>
                  <td className="py-2.5 px-2 text-center font-semibold text-muted-foreground">{row.goalsFor}</td>
                  <td className="py-2.5 px-2 text-center font-semibold text-muted-foreground">{row.goalsAgainst}</td>
                  <td className={cn('py-2.5 px-2 text-center font-bold', row.goalDifference >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                    {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                  </td>
                  <td className="py-2.5 px-2 text-center font-black text-[#0B3323]">{row.points}</td>
                  <td className="py-2.5 px-2 text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      {(row.form && row.form.length > 0) ? (
                        row.form.map((res, fIdx) => (
                          <span
                            key={fIdx}
                            className={cn(
                              'h-4 w-4 rounded text-[9px] font-black flex items-center justify-center text-white',
                              res === 'W' ? 'bg-emerald-500' : res === 'D' ? 'bg-amber-500' : 'bg-rose-500'
                            )}
                            title={res === 'W' ? 'Win' : res === 'D' ? 'Draw' : 'Loss'}
                          >
                            {res}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-muted-foreground font-mono">-</span>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Qualification Cutoff Indicator Line */}
                {isCutoffBorder && (
                  <tr className="bg-emerald-500/10 border-y-2 border-dashed border-emerald-500/40">
                    <td colSpan={10} className="py-1 px-3 text-[10px] font-extrabold text-emerald-800 text-center uppercase tracking-wider">
                      --- Qualification Cutoff (Top {qualifiersPerGroup}) ---
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GroupMatchesList({ group }: { group: GroupDetails }) {
  // Organize by round_id for display
  const roundMap = new Map<string, typeof group.matches>();
  for (const m of group.matches) {
    const roundId = m.round_id ?? 'unknown';
    const list = roundMap.get(roundId) ?? [];
    list.push(m);
    roundMap.set(roundId, list);
  }

  // Filter out completed matchdays AUTOMATICALLY (no buttons required)
  const activeRounds = Array.from(roundMap.entries()).filter(([, matches]) =>
    matches.some((m) => m.status !== 'completed' && m.status !== 'walkover')
  );

  const displayRounds = activeRounds.length > 0 ? activeRounds : Array.from(roundMap.entries());

  return (
    <div className="space-y-3 pt-1">
      {displayRounds.map(([roundId, matches], roundIdx) => (
        <div key={roundId}>
          {displayRounds.length > 1 && (
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
              Round {roundIdx + 1}
            </p>
          )}
          <div className="space-y-2">
            {matches.map((m) => {
              const isDraw = m.status === 'completed' && m.score_a === m.score_b && m.winner_id === null;
              const isLive = m.status === 'live';
              const isCompleted = m.status === 'completed' || m.status === 'walkover';
              return (
                <div
                  key={m.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl border text-xs',
                    isLive ? 'border-red-200 bg-red-50/70' : 'border-border bg-white'
                  )}
                >
                  {/* Status dot */}
                  {isLive && (
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                    </span>
                  )}
                  {/* Participant A */}
                  <span className={cn(
                    'flex-1 font-semibold truncate',
                    isCompleted && !isDraw && m.winner_id === m.participant_a ? 'text-[#0B3323] font-bold' : 'text-muted-foreground'
                  )}>
                    {m.participantAUser?.username ?? 'TBD'}
                  </span>
                  {/* Score */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isCompleted ? (
                      <>
                        <span className="font-black text-[#0B3323] tabular-nums w-4 text-center">{m.score_a}</span>
                        <span className="text-muted-foreground/60 font-bold">—</span>
                        <span className="font-black text-[#0B3323] tabular-nums w-4 text-center">{m.score_b}</span>
                        {isDraw && (
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 ml-1 font-bold">DRAW</Badge>
                        )}
                      </>
                    ) : isLive ? (
                      <>
                        <span className="font-black text-red-600 tabular-nums w-4 text-center">{m.score_a}</span>
                        <span className="text-red-400 font-bold">—</span>
                        <span className="font-black text-red-600 tabular-nums w-4 text-center">{m.score_b}</span>
                        <Badge className="text-[10px] py-0 px-1.5 ml-1 bg-red-500 text-white border-0 font-bold">LIVE</Badge>
                      </>
                    ) : (
                      <span className="text-muted-foreground font-semibold">vs</span>
                    )}
                  </div>
                  {/* Participant B */}
                  <span className={cn(
                    'flex-1 text-right font-semibold truncate',
                    isCompleted && !isDraw && m.winner_id === m.participant_b ? 'text-[#0B3323] font-bold' : 'text-muted-foreground'
                  )}>
                    {m.participantBUser?.username ?? 'TBD'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupCard({
  group,
  qualifiersPerGroup,
  isCompleted,
  isPureLeague,
}: {
  group: GroupDetails;
  qualifiersPerGroup: number;
  isCompleted: boolean;
  isPureLeague: boolean;
}) {
  const [showMatches, setShowMatches] = useState(false);
  const completionPct = group.totalMatchesCount > 0
    ? Math.round((group.completedMatchesCount / group.totalMatchesCount) * 100)
    : 0;

  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-xs">
      {/* Group Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-[#F4F8F5] border-b border-border">
        <h3 className="text-sm font-black text-[#0B3323] uppercase tracking-wide">{group.group.name}</h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground font-semibold">
            {group.completedMatchesCount}/{group.totalMatchesCount} played
          </span>
          {group.isComplete && (
            <Badge className="text-[10px] py-0 bg-emerald-100 text-emerald-700 border-emerald-200 font-bold">Done</Badge>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {group.totalMatchesCount > 0 && (
        <div className="h-1 bg-secondary">
          <div
            className="h-1 bg-primary transition-all duration-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      )}

      {/* Standings table */}
      <StandingsTable
        standings={group.standings}
        qualifiersPerGroup={qualifiersPerGroup}
        isCompleted={isCompleted}
        isPureLeague={isPureLeague}
      />

      {/* Toggle matches */}
      {group.matches.length > 0 && (
        <div className="border-t border-border">
          <button
            onClick={() => setShowMatches(!showMatches)}
            className="w-full flex items-center justify-between px-5 py-3 text-xs font-semibold text-muted-foreground hover:text-[#0B3323] hover:bg-[#F4F8F5]/60 transition-colors"
          >
            <span>{group.matches.length} Fixture{group.matches.length !== 1 ? 's' : ''}</span>
            {showMatches ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showMatches && (
            <div className="px-4 pb-4">
              <GroupMatchesList group={group} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PublicGroupsTab({ groupStage }: PublicGroupsTabProps) {
  if (!groupStage || groupStage.groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-white p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary mb-3">
          <Target className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-bold text-[#0B3323]">League Season has not started yet</h3>
        <p className="text-xs text-muted-foreground mt-1">
          League fixtures and standings will appear here once started by the admin.
        </p>
      </div>
    );
  }

  const isSingleLeague = groupStage.groups.length === 1;
  const isPureLeague = groupStage.tournament.format === 'league';
  const isCompleted = groupStage.tournament.status === 'completed';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-semibold">
          {isPureLeague ? (
            <>
              Top <span className="font-black text-[#0B3323]">{groupStage.qualifiersPerGroup}</span> Qualification Cutoff. Win = 3pts · Draw = 1pt · Loss = 0pts
            </>
          ) : isSingleLeague ? (
            <>
              Top <span className="font-black text-[#0B3323]">{groupStage.qualifiersPerGroup}</span> advance to the Knockout Stage. Win = 3pts · Draw = 1pt · Loss = 0pts
            </>
          ) : (
            <>
              Top <span className="font-black text-[#0B3323]">{groupStage.qualifiersPerGroup}</span> from each group advance to the knockout stage. Win = 3pts · Draw = 1pt · Loss = 0pts
            </>
          )}
        </p>
      </div>

      {groupStage.groups.map((group) => (
        <GroupCard
          key={group.group.id}
          group={{
            ...group,
            group: {
              ...group.group,
              name: isSingleLeague ? 'Official League Points Table' : group.group.name,
            },
          }}
          qualifiersPerGroup={groupStage.qualifiersPerGroup}
          isCompleted={isCompleted}
          isPureLeague={isPureLeague}
        />
      ))}
    </div>
  );
}
