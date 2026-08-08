'use client';

import React from 'react';
import { GitBranch, Trophy } from 'lucide-react';
import type { BracketOverview } from '@/services/bracketService';
import type { FullMatchData } from '@/services/bracketService';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PublicBracketTabProps {
  bracket: BracketOverview | null;
}

function BracketMatch({ match, isFinalRound }: { match: FullMatchData; isFinalRound: boolean }) {
  const isCompleted = match.status === 'completed' || match.status === 'walkover';
  const isLive = match.status === 'live';
  const isDraw = isCompleted && match.score_a === match.score_b && !match.winner_id;

  return (
    <div
      className={cn(
        'rounded-xl border p-3 min-w-[160px] transition-all',
        isFinalRound
          ? 'border-amber-200 bg-gradient-to-b from-amber-50 to-yellow-50 shadow-sm'
          : isLive
          ? 'border-red-200 bg-red-50/50'
          : isCompleted
          ? 'border-border/80 bg-white'
          : 'border-dashed border-border bg-white/60'
      )}
    >
      {/* Slot A */}
      <div className={cn(
        'flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg mb-1',
        isCompleted && match.winner_id === match.participant_a ? 'bg-emerald-50 border border-emerald-200' : 'bg-transparent'
      )}>
        <span className={cn(
          'text-xs font-semibold truncate max-w-[100px]',
          match.participantAUser
            ? isCompleted && match.winner_id !== match.participant_a && !isDraw
              ? 'text-muted-foreground/60 line-through'
              : 'text-[#0B3323]'
            : 'text-muted-foreground/50 italic'
        )}>
          {match.participantAUser?.username ?? 'TBD'}
        </span>
        {isCompleted || isLive ? (
          <span className={cn(
            'text-sm font-black tabular-nums shrink-0',
            isLive ? 'text-red-600' : isCompleted && match.winner_id === match.participant_a ? 'text-emerald-700' : 'text-muted-foreground'
          )}>
            {match.score_a ?? 0}
          </span>
        ) : null}
      </div>

      {/* Divider */}
      <div className="h-px bg-border/50 mx-1" />

      {/* Slot B */}
      <div className={cn(
        'flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg mt-1',
        isCompleted && match.winner_id === match.participant_b ? 'bg-emerald-50 border border-emerald-200' : 'bg-transparent'
      )}>
        <span className={cn(
          'text-xs font-semibold truncate max-w-[100px]',
          match.participantBUser
            ? isCompleted && match.winner_id !== match.participant_b && !isDraw
              ? 'text-muted-foreground/60 line-through'
              : 'text-[#0B3323]'
            : 'text-muted-foreground/50 italic'
        )}>
          {match.participantBUser?.username ?? 'TBD'}
        </span>
        {isCompleted || isLive ? (
          <span className={cn(
            'text-sm font-black tabular-nums shrink-0',
            isLive ? 'text-red-600' : isCompleted && match.winner_id === match.participant_b ? 'text-emerald-700' : 'text-muted-foreground'
          )}>
            {match.score_b ?? 0}
          </span>
        ) : null}
      </div>

      {/* Status badges */}
      <div className="flex justify-center mt-2">
        {isLive && (
          <Badge className="bg-red-500 hover:bg-red-500 text-white border-0 gap-1 text-[10px] font-bold">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
            </span>
            LIVE
          </Badge>
        )}
        {isDraw && (
          <Badge variant="outline" className="text-[10px] font-bold text-amber-600 border-amber-300">DRAW</Badge>
        )}
      </div>
    </div>
  );
}

export default function PublicBracketTab({ bracket }: PublicBracketTabProps) {
  if (!bracket || bracket.rounds.length === 0 || bracket.status === 'Not Generated') {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-white p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary mb-3">
          <GitBranch className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-bold text-[#0B3323]">The knockout stage has not started yet</h3>
        <p className="text-xs text-muted-foreground mt-1">
          The bracket will appear here once the knockout stage begins.
        </p>
      </div>
    );
  }

  const maxRound = Math.max(...bracket.rounds.map((r) => r.round_number));

  return (
    <div className="space-y-5">
      {/* Bracket status */}
      <div className="flex items-center gap-2">
        <Badge
          className={cn(
            'font-bold',
            bracket.status === 'Completed' ? 'bg-emerald-500 text-white border-0' : ''
          )}
          variant={bracket.status === 'In Progress' ? 'default' : bracket.status === 'Generated' ? 'secondary' : 'outline'}
        >
          {bracket.status}
        </Badge>
        <span className="text-xs text-muted-foreground font-semibold">
          {bracket.totalRounds} round{bracket.totalRounds !== 1 ? 's' : ''} · {bracket.bracketSize} bracket
        </span>
      </div>

      {/* Horizontal scrollable bracket */}
      <div className="w-full overflow-x-auto no-scrollbar rounded-2xl border border-border bg-[#F4F8F5]/50 p-5">
        <div className="flex gap-6 items-start min-w-max py-2">
          {bracket.rounds.map((round) => {
            const isFinalRound = round.round_number === maxRound;
            return (
              <div key={round.id} className="flex flex-col gap-3 shrink-0">
                {/* Round header */}
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  {isFinalRound && <Trophy className="h-3.5 w-3.5 text-amber-500" />}
                  <span className={cn(
                    'text-[11px] font-black uppercase tracking-wider',
                    isFinalRound ? 'text-amber-700' : 'text-muted-foreground'
                  )}>
                    {round.name}
                  </span>
                </div>

                {/* Matches in this round */}
                <div className="flex flex-col gap-3">
                  {round.matches.map((match) => (
                    <BracketMatch
                      key={match.id}
                      match={match}
                      isFinalRound={isFinalRound}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground font-semibold px-1">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-200 border border-emerald-300" />
          Winner
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm border border-dashed border-border" />
          Awaiting Match
        </span>
        {bracket.byesCount > 0 && (
          <span className="flex items-center gap-1 text-primary/70">
            · {bracket.byesCount} bye{bracket.byesCount !== 1 ? 's' : ''} assigned
          </span>
        )}
      </div>
    </div>
  );
}
