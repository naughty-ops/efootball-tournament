'use client';

import React, { useState } from 'react';
import { Target, ChevronDown, ChevronUp } from 'lucide-react';
import type { GroupStageOverview, GroupDetails } from '@/services/groupService';
import type { GroupStandingRow } from '@/lib/group/groupEngine';
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
          <tr className="border-b border-white/20 bg-[#0A0A7A]">
            <th className="text-left py-3 px-4 font-black uppercase tracking-wider text-white w-full">Player</th>
            <th className="py-3 px-2 font-black uppercase tracking-wider text-center text-[#D9DCFF]/80">P</th>
            <th className="py-3 px-2 font-black uppercase tracking-wider text-center text-[#D9DCFF]/80">W</th>
            <th className="py-3 px-2 font-black uppercase tracking-wider text-center text-[#D9DCFF]/80">D</th>
            <th className="py-3 px-2 font-black uppercase tracking-wider text-center text-[#D9DCFF]/80">L</th>
            <th className="py-3 px-2 font-black uppercase tracking-wider text-center text-[#D9DCFF]/80">GF</th>
            <th className="py-3 px-2 font-black uppercase tracking-wider text-center text-[#D9DCFF]/80">GA</th>
            <th className="py-3 px-2 font-black uppercase tracking-wider text-center text-[#D9DCFF]/80">GD</th>
            <th className="py-3 px-2 font-black uppercase tracking-wider text-center text-[#FFFF00]">PTS</th>
            <th className="py-3 px-2 font-black uppercase tracking-wider text-center text-[#D9DCFF]/80">Form</th>
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
                    'border-b border-white/10 transition-colors',
                    isLeagueWinner
                      ? 'bg-[#3434FF] font-bold text-white'
                      : isQualified
                      ? 'bg-[#1E1EF5]/40 font-semibold text-white'
                      : 'hover:bg-white/5 text-white/90'
                  )}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-black',
                        isLeagueWinner || isTopRank ? 'bg-[#FFFF00] text-[#08088F]' : isQualified ? 'bg-[#3434FF] text-white border border-white/20' : 'bg-[#0A0A7A] text-[#D9DCFF]'
                      )}>
                        {idx + 1}
                      </span>
                      <span className="font-bold truncate max-w-[130px] text-white">
                        {row.participant.username}
                      </span>
                      {isLeagueWinner && (
                        <span className="text-[9px] py-0.5 px-2 bg-[#FFFF00] text-[#08088F] font-black rounded-full shrink-0">
                          🏆 Champion
                        </span>
                      )}
                      {isTopRank && (
                        <span className="text-[9px] py-0.5 px-2 bg-[#FFFF00] text-[#08088F] font-black rounded-full shrink-0">
                          1st Place
                        </span>
                      )}
                      {isQualified && !isLeagueWinner && !isTopRank && (
                        <span className="text-[9px] py-0.5 px-2 bg-emerald-500 text-white font-bold rounded-full shrink-0">
                          Qualified
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center font-bold text-[#D9DCFF]">{row.played}</td>
                  <td className="py-3 px-2 text-center font-bold text-emerald-400">{row.wins}</td>
                  <td className="py-3 px-2 text-center font-bold text-[#FFFF00]">{row.draws}</td>
                  <td className="py-3 px-2 text-center font-bold text-[#FF168B]">{row.losses}</td>
                  <td className="py-3 px-2 text-center font-bold text-[#D9DCFF]">{row.goalsFor}</td>
                  <td className="py-3 px-2 text-center font-bold text-[#D9DCFF]">{row.goalsAgainst}</td>
                  <td className={cn('py-3 px-2 text-center font-black', row.goalDifference >= 0 ? 'text-emerald-400' : 'text-[#FF168B]')}>
                    {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                  </td>
                  <td className="py-3 px-2 text-center font-black text-base text-[#FFFF00]">{row.points}</td>
                  <td className="py-3 px-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {(row.form && row.form.length > 0) ? (
                        row.form.map((res, fIdx) => (
                          <span
                            key={fIdx}
                            className={cn(
                              'h-5 w-5 rounded text-[10px] font-black flex items-center justify-center text-white',
                              res === 'W' ? 'bg-emerald-500' : res === 'D' ? 'bg-amber-500' : 'bg-[#FF168B]'
                            )}
                            title={res === 'W' ? 'Win' : res === 'D' ? 'Draw' : 'Loss'}
                          >
                            {res}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-[#D9DCFF]/50 font-mono">-</span>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Qualification Cutoff Indicator Line */}
                {isCutoffBorder && (
                  <tr className="bg-[#FFFF00]/10 border-y-2 border-dashed border-[#FFFF00]/40">
                    <td colSpan={10} className="py-1.5 px-4 text-[10px] font-black text-[#FFFF00] text-center uppercase tracking-widest">
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

  // Filter out completed matchdays AUTOMATICALLY
  const activeRounds = Array.from(roundMap.entries()).filter(([, matches]) =>
    matches.some((m) => m.status !== 'completed' && m.status !== 'walkover')
  );

  const displayRounds = activeRounds.length > 0 ? activeRounds : Array.from(roundMap.entries());

  return (
    <div className="space-y-3 pt-2">
      {displayRounds.map(([roundId, matches], roundIdx) => (
        <div key={roundId}>
          {displayRounds.length > 1 && (
            <p className="text-[11px] font-black uppercase tracking-wider text-[#FFFF00] mb-2 px-1">
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
                    'flex items-center gap-3 px-4 py-3 rounded-2xl border text-xs',
                    isLive ? 'border-[#FF168B] bg-[#FF168B]/15 text-white' : 'border-white/15 bg-[#1010C5] text-white'
                  )}
                >
                  {/* Status dot */}
                  {isLive && (
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF168B] opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF168B]" />
                    </span>
                  )}
                  {/* Participant A */}
                  <span className={cn(
                    'flex-1 font-bold truncate',
                    isCompleted && !isDraw && m.winner_id === m.participant_a ? 'text-[#FFFF00]' : 'text-white'
                  )}>
                    {m.participantAUser?.username ?? 'TBD'}
                  </span>
                  {/* Score */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isCompleted ? (
                      <>
                        <span className="font-black font-display text-white text-base tabular-nums w-5 text-center">{m.score_a}</span>
                        <span className="text-white/40 font-bold">—</span>
                        <span className="font-black font-display text-white text-base tabular-nums w-5 text-center">{m.score_b}</span>
                        {isDraw && (
                          <span className="bg-[#0A0A7A] text-[#D9DCFF] text-[10px] py-0.5 px-2 rounded-full font-bold ml-1">DRAW</span>
                        )}
                      </>
                    ) : isLive ? (
                      <>
                        <span className="font-black font-display text-[#FF168B] text-base tabular-nums w-5 text-center">{m.score_a}</span>
                        <span className="text-[#FF168B]/60 font-bold">—</span>
                        <span className="font-black font-display text-[#FF168B] text-base tabular-nums w-5 text-center">{m.score_b}</span>
                        <span className="text-[10px] py-0.5 px-2 ml-1 bg-[#FF168B] text-white font-black rounded-full animate-pulse">LIVE</span>
                      </>
                    ) : (
                      <span className="text-[#D9DCFF]/70 font-black uppercase text-[11px]">vs</span>
                    )}
                  </div>
                  {/* Participant B */}
                  <span className={cn(
                    'flex-1 text-right font-bold truncate',
                    isCompleted && !isDraw && m.winner_id === m.participant_b ? 'text-[#FFFF00]' : 'text-white'
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
    <div className="rounded-[28px] border border-white/20 bg-[#1818D4] overflow-hidden shadow-xl text-white">
      {/* Group Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-[#1010C5] border-b border-white/20">
        <h3 className="text-base font-black font-display text-white uppercase tracking-wider">{group.group.name}</h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#D9DCFF] font-bold">
            {group.completedMatchesCount}/{group.totalMatchesCount} played
          </span>
          {group.isComplete && (
            <span className="text-[10px] py-0.5 px-2 bg-[#FFFF00] text-[#08088F] font-black rounded-full uppercase">Done</span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {group.totalMatchesCount > 0 && (
        <div className="h-1.5 bg-[#0A0A7A]">
          <div
            className="h-1.5 bg-[#FFFF00] transition-all duration-500 shadow-[0_0_8px_rgba(255,255,0,0.5)]"
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
        <div className="border-t border-white/20">
          <button
            onClick={() => setShowMatches(!showMatches)}
            className="w-full flex items-center justify-between px-6 py-3.5 text-xs font-black uppercase tracking-wider text-[#D9DCFF] hover:text-white hover:bg-white/5 transition-colors"
          >
            <span>{group.matches.length} Fixture{group.matches.length !== 1 ? 's' : ''}</span>
            {showMatches ? <ChevronUp className="h-4 w-4 text-[#FFFF00]" /> : <ChevronDown className="h-4 w-4 text-[#FFFF00]" />}
          </button>
          {showMatches && (
            <div className="px-6 pb-6">
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
      <div className="rounded-[28px] border border-white/20 bg-[#1818D4] p-12 text-center text-white shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3434FF] text-[#FFFF00] mb-3 shadow-md">
          <Target className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-black font-display uppercase tracking-wide text-white">League Season has not started yet</h3>
        <p className="text-xs text-[#D9DCFF]/80 mt-1 max-w-sm mx-auto font-medium">
          League fixtures and standings will appear here once started by the tournament organizer.
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
        <p className="text-xs text-[#D9DCFF]/90 font-medium">
          {isPureLeague ? (
            <>
              Top <span className="font-black text-[#FFFF00]">{groupStage.qualifiersPerGroup}</span> Qualification Cutoff. Win = 3pts · Draw = 1pt · Loss = 0pts
            </>
          ) : isSingleLeague ? (
            <>
              Top <span className="font-black text-[#FFFF00]">{groupStage.qualifiersPerGroup}</span> advance to the Knockout Stage. Win = 3pts · Draw = 1pt · Loss = 0pts
            </>
          ) : (
            <>
              Top <span className="font-black text-[#FFFF00]">{groupStage.qualifiersPerGroup}</span> from each group advance to the knockout stage. Win = 3pts · Draw = 1pt · Loss = 0pts
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
