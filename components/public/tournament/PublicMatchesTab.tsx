'use client';

import React, { useState } from 'react';
import { Swords, CheckCircle2, Clock, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import type { RoundWithMatches } from '@/services/matchService';
import type { GroupStageOverview } from '@/services/groupService';
import type { FullMatchData } from '@/services/matchService';
import { cn } from '@/lib/utils';

interface PublicMatchesTabProps {
  rounds: RoundWithMatches[];
  groupStage: GroupStageOverview | null;
}

function MatchCard({ match }: { match: FullMatchData }) {
  const isLive = match.status === 'live';
  const isCompleted = match.status === 'completed' || match.status === 'walkover';
  const isPenalty = isCompleted && match.decided_by === 'penalties';
  const isDraw = isCompleted && match.status === 'completed' && match.score_a === match.score_b && !match.winner_id && !isPenalty;
  const isWalkover = match.status === 'walkover';

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 transition-all shadow-md',
        isLive
          ? 'border-[#FF168B] bg-[#FF168B]/15 text-white shadow-[0_0_15px_rgba(255,22,139,0.25)]'
          : 'border-white/20 bg-[#1818D4] text-white hover:border-[#FFFF00]/50'
      )}
    >
      {/* Status top row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-black uppercase tracking-wider text-[#D9DCFF]/70">
          Match {String(match.match_position).padStart(2, '0')}
        </span>
        <div className="flex items-center gap-1.5">
          {isLive && (
            <span className="bg-[#FF168B] text-white border-0 gap-1 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center">
              <span className="relative flex h-1.5 w-1.5 mr-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
              </span>
              LIVE
            </span>
          )}
          {isPenalty && (
            <span className="text-[10px] font-black text-[#FFFF00] border border-[#FFFF00]/40 bg-[#0A0A7A] px-2 py-0.5 rounded-full">
              PENALTIES
            </span>
          )}
          {isCompleted && !isDraw && !isWalkover && !isPenalty && (
            <span className="text-[10px] font-black bg-[#0A0A7A] text-[#D9DCFF] px-2 py-0.5 rounded-full">
              COMPLETED
            </span>
          )}
          {isDraw && (
            <span className="text-[10px] font-black text-[#08088F] bg-[#FFFF00] px-2 py-0.5 rounded-full">
              DRAW
            </span>
          )}
          {isWalkover && (
            <span className="text-[10px] font-bold text-[#D9DCFF]/70 bg-white/10 px-2 py-0.5 rounded-full">
              WALKOVER
            </span>
          )}
          {!isLive && !isCompleted && (
            <span className="text-[10px] font-bold text-white/80 bg-[#1010C5] border border-white/20 px-2 py-0.5 rounded-full">
              SCHEDULED
            </span>
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
              ? 'text-[#FFFF00] font-black'
              : 'text-white'
          )}>
            {match.participantAUser?.username ?? 'TBD'}
          </p>
          {isCompleted && !isDraw && match.winner_id === match.participant_a && (
            <span className="text-[10px] font-black text-[#FFFF00] uppercase tracking-wider">WINNER</span>
          )}
        </div>

        {/* Score center */}
        <div className="flex items-center gap-2 shrink-0">
          {isCompleted || isLive ? (
            isPenalty &&
            match.penalty_score_a !== null &&
            match.penalty_score_a !== undefined &&
            match.penalty_score_b !== null &&
            match.penalty_score_b !== undefined ? (
              <div className="flex items-center gap-1.5 text-white font-mono">
                <span className="text-xl font-black font-display">{match.score_a}</span>
                <span className="text-xs font-black text-[#08088F] bg-[#FFFF00] px-1.5 py-0.5 rounded-full">
                  ({match.penalty_score_a})
                </span>
                <span className="font-bold text-white/40 font-sans px-0.5">–</span>
                <span className="text-xs font-black text-[#08088F] bg-[#FFFF00] px-1.5 py-0.5 rounded-full">
                  ({match.penalty_score_b})
                </span>
                <span className="text-xl font-black font-display">{match.score_b}</span>
              </div>
            ) : (
              <>
                <span className={cn(
                  'text-2xl font-black font-display tabular-nums w-7 text-center',
                  isLive ? 'text-[#FF168B]' : 'text-white'
                )}>
                  {match.score_a ?? 0}
                </span>
                <span className={cn('font-bold text-sm', isLive ? 'text-[#FF168B]/60' : 'text-white/40')}>—</span>
                <span className={cn(
                  'text-2xl font-black font-display tabular-nums w-7 text-center',
                  isLive ? 'text-[#FF168B]' : 'text-white'
                )}>
                  {match.score_b ?? 0}
                </span>
              </>
            )
          ) : (
            <span className="text-xs font-black text-[#D9DCFF]/70 uppercase px-2">vs</span>
          )}
        </div>

        {/* Participant B */}
        <div className="flex-1 min-w-0 text-left">
          <p className={cn(
            'text-sm font-bold truncate',
            isCompleted && !isDraw && match.winner_id === match.participant_b
              ? 'text-[#FFFF00] font-black'
              : 'text-white'
          )}>
            {match.participantBUser?.username ?? 'TBD'}
          </p>
          {isCompleted && !isDraw && match.winner_id === match.participant_b && (
            <span className="text-[10px] font-black text-[#FFFF00] uppercase tracking-wider">WINNER</span>
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
      <div className="rounded-[28px] border border-white/20 bg-[#1818D4] p-12 text-center text-white shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3434FF] text-[#FFFF00] mb-3 shadow-md">
          <Swords className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-black font-display uppercase tracking-wide text-white">No matches scheduled yet</h3>
        <p className="text-xs text-[#D9DCFF]/80 mt-1 max-w-sm mx-auto font-medium">
          Matches will appear here once fixtures are officially generated.
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
      const isFinal = r.name.toLowerCase().includes('grand final') || r.name.toLowerCase() === 'final';

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

  // Filter out completed matchdays AUTOMATICALLY
  const activeMatchdaySections = matchdaySections.filter((sec) => !sec.isCompleted);
  const finishedMatchdaySections = matchdaySections.filter((sec) => sec.isCompleted);

  return (
    <div className="space-y-6">
      {/* Live Standings Table inline with matches */}
      {groupStage && groupStage.groups.length > 0 && (
        <div className="rounded-[28px] border border-white/20 bg-[#1818D4] overflow-hidden shadow-xl space-y-3 p-5 text-white">
          <div className="flex items-center justify-between border-b border-white/20 pb-3">
            <h3 className="text-sm font-black font-display uppercase tracking-wider text-white flex items-center gap-2">
              <Trophy className="h-4 w-4 text-[#FFFF00]" />
              <span>{isSingleLeague ? 'Live League Standings' : 'Group Standings'}</span>
            </h3>
            <span className="text-[10px] text-[#FFFF00] font-black uppercase tracking-wider bg-[#0A0A7A] px-2.5 py-1 rounded-full">
              Top {groupStage.qualifiersPerGroup} Qualify
            </span>
          </div>
          <div className="w-full overflow-x-auto no-scrollbar pt-1">
            <table className="w-full min-w-[480px] text-xs">
              <thead>
                <tr className="border-b border-white/20 bg-[#0A0A7A]">
                  <th className="text-left py-2.5 px-3 font-black uppercase tracking-wider text-white">Player</th>
                  <th className="py-2.5 px-2 font-black uppercase tracking-wider text-center text-[#D9DCFF]/80">P</th>
                  <th className="py-2.5 px-2 font-black uppercase tracking-wider text-center text-emerald-400">W</th>
                  <th className="py-2.5 px-2 font-black uppercase tracking-wider text-center text-[#FFFF00]">D</th>
                  <th className="py-2.5 px-2 font-black uppercase tracking-wider text-center text-[#FF168B]">L</th>
                  <th className="py-2.5 px-2 font-black uppercase tracking-wider text-center text-[#D9DCFF]/80">GF</th>
                  <th className="py-2.5 px-2 font-black uppercase tracking-wider text-center text-[#D9DCFF]/80">GA</th>
                  <th className="py-2.5 px-2 font-black uppercase tracking-wider text-center text-[#D9DCFF]/80">GD</th>
                  <th className="py-2.5 px-2 font-black uppercase tracking-wider text-center text-[#FFFF00]">PTS</th>
                </tr>
              </thead>
              <tbody>
                {(groupStage.groups[0]?.standings || []).map((row, idx) => {
                  const isTopQual = idx < groupStage.qualifiersPerGroup;
                  return (
                    <tr key={row.participant.id} className={cn('border-b border-white/10 last:border-0 hover:bg-white/5 transition-colors', isTopQual ? 'bg-[#3434FF]/30 font-semibold' : '')}>
                      <td className="py-2.5 px-3 flex items-center gap-2">
                        <span className={cn('flex h-5 w-5 items-center justify-center rounded text-[10px] font-black', isTopQual ? 'bg-[#FFFF00] text-[#08088F]' : 'bg-[#0A0A7A] text-[#D9DCFF]')}>
                          {idx + 1}
                        </span>
                        <span className="font-bold text-white truncate max-w-[120px]">{row.participant.username}</span>
                        {idx === 0 && <span className="text-[10px]">🏆</span>}
                      </td>
                      <td className="py-2.5 px-2 text-center text-[#D9DCFF]">{row.played}</td>
                      <td className="py-2.5 px-2 text-center text-emerald-400 font-bold">{row.wins}</td>
                      <td className="py-2.5 px-2 text-center text-[#FFFF00] font-bold">{row.draws}</td>
                      <td className="py-2.5 px-2 text-center text-[#FF168B] font-bold">{row.losses}</td>
                      <td className="py-2.5 px-2 text-center text-[#D9DCFF]">{row.goalsFor}</td>
                      <td className="py-2.5 px-2 text-center text-[#D9DCFF]">{row.goalsAgainst}</td>
                      <td className={cn('py-2.5 px-2 text-center font-black', row.goalDifference >= 0 ? 'text-emerald-400' : 'text-[#FF168B]')}>
                        {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                      </td>
                      <td className="py-2.5 px-2 text-center font-black text-sm text-[#FFFF00]">{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ACTIVE MATCHDAYS */}
      {activeMatchdaySections.length > 0 ? (
        <div className="space-y-6">
          {activeMatchdaySections.map(({ label, isFinal, matches }) => (
            <div key={label} className="space-y-3">
              <div className="flex items-center gap-2">
                {isFinal ? <span className="text-xl">🏆</span> : <Clock className="h-4 w-4 text-[#FFFF00]" />}
                <h3 className="text-base font-black font-display uppercase tracking-wider text-white">
                  {label}
                </h3>
                <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-[#FFFF00] text-[#08088F]">
                  Active Matchday
                </span>
                <div className="flex-1 h-px bg-white/20" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {matches.map((m) => <MatchCard key={m.id} match={m} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* If all matchdays in the tournament are completed */
        <div className="rounded-[28px] border border-white/20 bg-[#1010C5] p-8 text-center text-white space-y-2 shadow-xl">
          <CheckCircle2 className="h-10 w-10 text-[#FFFF00] mx-auto" />
          <h3 className="text-xl font-black font-display uppercase tracking-wider text-white">🏆 All Matchdays Completed!</h3>
          <p className="text-xs text-[#D9DCFF]/90 font-medium">
            All matchday fixtures have been played. Check the live Points Table above for final standings.
          </p>
        </div>
      )}

      {/* Optional History Section for Finished Matchdays */}
      {finishedMatchdaySections.length > 0 && (
        <div className="pt-4 border-t border-white/20">
          <button
            type="button"
            onClick={() => setShowFinishedMatchdays(!showFinishedMatchdays)}
            className="flex items-center justify-between w-full p-4 rounded-2xl bg-[#1010C5] border border-white/20 text-xs font-black uppercase tracking-wider text-[#D9DCFF] hover:text-white hover:bg-white/5 transition-colors"
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#FFFF00]" />
              <span>Finished Matchdays History ({finishedMatchdaySections.length} Matchdays Completed)</span>
            </span>
            {showFinishedMatchdays ? <ChevronUp className="h-4 w-4 text-[#FFFF00]" /> : <ChevronDown className="h-4 w-4 text-[#FFFF00]" />}
          </button>

          {showFinishedMatchdays && (
            <div className="space-y-6 pt-4">
              {finishedMatchdaySections.map(({ label, isFinal, matches }) => (
                <div key={label} className="space-y-3 opacity-90">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#FFFF00]" />
                    <h4 className="text-xs font-black uppercase font-display tracking-wider text-[#D9DCFF]">
                      {label} (Completed)
                    </h4>
                    <div className="flex-1 h-px bg-white/20" />
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
