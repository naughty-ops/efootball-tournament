'use client';

import React, { useState, useMemo } from 'react';
import {
  Trophy,
  Medal,
  Swords,
  Edit,
  Radio,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Eye,
  Award,
  Zap,
} from 'lucide-react';
import type { BracketOverview, FullMatchData, RoundWithMatches } from '@/services/bracketService';
import type { Participant } from '@/types/database';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatDate } from '@/lib/utils';
import { formatTournamentFormat } from '@/components/tournament/TournamentCard';

interface SymmetricalKnockoutBracketProps {
  bracket: BracketOverview | null;
  isAdmin?: boolean;
  onScoreMatch?: (match: FullMatchData) => void;
  onEditSlot?: (match: FullMatchData, slot: 'participant_a' | 'participant_b') => void;
  onMatchClick?: (match: FullMatchData) => void;
  onReopenCelebration?: () => void;
}

/**
 * Reusable Player Slot Component within a Match Card
 */
function PlayerSlot({
  participant,
  score,
  isWinner,
  isLoser,
  isBye,
  isCompleted,
  isLive,
  isSlotA,
  onClickSlot,
  isAdmin,
}: {
  participant: Participant | null | undefined;
  score: number | null | undefined;
  isWinner: boolean;
  isLoser: boolean;
  isBye: boolean;
  isCompleted: boolean;
  isLive: boolean;
  isSlotA: boolean;
  onClickSlot?: () => void;
  isAdmin?: boolean;
}) {
  const getInitials = (name: string) => {
    if (!name) return 'P';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div
      onClick={onClickSlot}
      className={cn(
        'group flex items-center justify-between gap-2 px-3 py-2 rounded-xl transition-all duration-200 border',
        isWinner
          ? 'bg-gradient-to-r from-emerald-50 via-emerald-100/50 to-emerald-50 border-emerald-300 shadow-xs'
          : isLoser
          ? 'bg-slate-50/60 border-transparent opacity-70'
          : participant
          ? 'bg-white border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30'
          : 'bg-slate-50/40 border-dashed border-slate-200',
        isAdmin && onClickSlot ? 'cursor-pointer' : ''
      )}
    >
      {/* Player Identity */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {participant?.seed_number ? (
          <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-md border border-emerald-200 shrink-0">
            #{participant.seed_number}
          </span>
        ) : null}

        {/* Avatar / Initials Circle */}
        <div
          className={cn(
            'h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 shadow-2xs border',
            isWinner
              ? 'bg-emerald-600 text-white border-emerald-500 ring-2 ring-emerald-200'
              : participant
              ? 'bg-[#0B3323] text-white border-[#0B3323]'
              : 'bg-slate-200 text-slate-400 border-slate-300'
          )}
        >
          {participant ? getInitials(participant.username) : '?'}
        </div>

        {/* Username */}
        <div className="min-w-0 flex-1">
          <span
            title={participant?.username || (isBye ? 'BYE' : 'TBD')}
            className={cn(
              'text-xs font-bold block truncate tracking-tight',
              isWinner
                ? 'text-emerald-950 font-black'
                : isLoser
                ? 'text-slate-500 line-through'
                : participant
                ? 'text-[#0B3323]'
                : 'text-slate-400 italic'
            )}
          >
            {participant ? participant.username : isBye ? 'BYE (Auto-Advance)' : 'TBD'}
          </span>
          {participant?.real_name && (
            <span className="text-[9px] text-muted-foreground block truncate -mt-0.5">
              {participant.real_name}
            </span>
          )}
        </div>
      </div>

      {/* Score Box & Winner Tag */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isWinner && (
          <Badge className="bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0 border-0 uppercase">
            WIN
          </Badge>
        )}
        {isCompleted || isLive ? (
          <span
            className={cn(
              'h-7 w-7 rounded-lg flex items-center justify-center text-xs font-black tabular-nums border shadow-2xs',
              isWinner
                ? 'bg-emerald-600 text-white border-emerald-500'
                : isLive
                ? 'bg-rose-100 text-rose-700 border-rose-300 font-extrabold'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            )}
          >
            {score ?? 0}
          </span>
        ) : (
          <span className="h-7 w-7 rounded-lg flex items-center justify-center text-xs text-slate-300 bg-slate-50 border border-slate-200 font-mono">
            -
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Reusable Interactive Match Card
 */
function MatchCard({
  match,
  isFinalMatch = false,
  isAdmin = false,
  onScoreMatch,
  onEditSlot,
  onMatchClick,
}: {
  match: FullMatchData;
  isFinalMatch?: boolean;
  isAdmin?: boolean;
  onScoreMatch?: (match: FullMatchData) => void;
  onEditSlot?: (match: FullMatchData, slot: 'participant_a' | 'participant_b') => void;
  onMatchClick?: (match: FullMatchData) => void;
}) {
  const playerA = match.participantAUser;
  const playerB = match.participantBUser;

  const isCompleted = match.status === 'completed' || match.status === 'walkover';
  const isLive = match.status === 'live';
  const isBye = match.status === 'walkover' || Boolean(match.notes?.includes('BYE'));

  const isWinnerA = isCompleted && match.winner_id === match.participant_a && Boolean(match.participant_a);
  const isWinnerB = isCompleted && match.winner_id === match.participant_b && Boolean(match.participant_b);
  const isLoserA = isCompleted && !isWinnerA && Boolean(match.participant_a);
  const isLoserB = isCompleted && !isWinnerB && Boolean(match.participant_b);

  const canEditScore = isAdmin && (Boolean(playerA && playerB) || isCompleted || isLive || match.status === 'ready');

  return (
    <Card
      className={cn(
        'relative transition-all duration-300 overflow-hidden flex flex-col justify-between group',
        isFinalMatch
          ? 'w-72 sm:w-80 border-2 border-amber-400 bg-gradient-to-b from-white via-amber-50/30 to-yellow-50/50 shadow-lg ring-4 ring-amber-400/20'
          : isLive
          ? 'w-64 border-2 border-rose-400 bg-rose-50/20 shadow-md ring-2 ring-rose-300/30'
          : isCompleted
          ? 'w-64 border-emerald-200/90 bg-white hover:border-emerald-400 shadow-xs hover:shadow-md'
          : 'w-64 border-slate-200 bg-white/95 hover:border-slate-300 shadow-2xs'
      )}
    >
      {/* Match Header */}
      <div
        className={cn(
          'px-3 py-1.5 border-b flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider',
          isFinalMatch
            ? 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 text-slate-950 border-amber-300'
            : isLive
            ? 'bg-rose-600 text-white border-rose-500'
            : 'bg-[#F4F8F5] text-[#0B3323] border-slate-100'
        )}
      >
        <span className="flex items-center gap-1.5 font-mono">
          {isFinalMatch ? <Trophy className="h-3 w-3 text-slate-950" /> : <Swords className="h-3 w-3 opacity-70" />}
          <span>MATCH #{match.match_position}</span>
        </span>

        <div className="flex items-center gap-1">
          {isLive && (
            <Badge className="bg-white text-rose-700 font-black text-[9px] px-1.5 py-0 border-0 gap-1 animate-pulse">
              <Radio className="h-2.5 w-2.5 text-rose-600" />
              <span>LIVE</span>
            </Badge>
          )}
          {isBye && (
            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[9px] font-extrabold">
              BYE
            </Badge>
          )}
          {!isLive && !isBye && (
            <Badge
              variant={isCompleted ? 'default' : 'outline'}
              className={cn(
                'text-[9px] font-bold px-1.5 py-0 capitalize',
                isCompleted ? 'bg-emerald-600 text-white border-0' : 'text-slate-500 border-slate-300'
              )}
            >
              {match.status}
            </Badge>
          )}
        </div>
      </div>

      {/* Slots Body */}
      <div className="p-2.5 space-y-2">
        <PlayerSlot
          participant={playerA}
          score={match.score_a}
          isWinner={isWinnerA}
          isLoser={isLoserA}
          isBye={!playerA && isBye}
          isCompleted={isCompleted}
          isLive={isLive}
          isSlotA={true}
          onClickSlot={isAdmin && onEditSlot ? () => onEditSlot(match, 'participant_a') : undefined}
          isAdmin={isAdmin}
        />

        <PlayerSlot
          participant={playerB}
          score={match.score_b}
          isWinner={isWinnerB}
          isLoser={isLoserB}
          isBye={!playerB && isBye}
          isCompleted={isCompleted}
          isLive={isLive}
          isSlotA={false}
          onClickSlot={isAdmin && onEditSlot ? () => onEditSlot(match, 'participant_b') : undefined}
          isAdmin={isAdmin}
        />
      </div>

      {/* Footer Controls */}
      <div className="px-2.5 py-1.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-1 text-[10px]">
        {match.scheduled_time ? (
          <span className="flex items-center gap-1 text-slate-500 font-medium truncate">
            <Clock className="h-3 w-3 text-slate-400" />
            <span>{formatDate(match.scheduled_time)}</span>
          </span>
        ) : (
          <span className="text-slate-400 font-mono">Knockout Stage</span>
        )}

        <div className="flex items-center gap-1">
          {isAdmin && canEditScore && onScoreMatch && (
            <Button
              size="sm"
              onClick={() => onScoreMatch(match)}
              className="h-6 px-2 text-[10px] font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white gap-1 rounded-lg shadow-2xs"
            >
              <Edit className="h-3 w-3" />
              <span>Edit Score</span>
            </Button>
          )}

          {onMatchClick && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMatchClick(match)}
              className="h-6 px-1.5 text-[10px] font-semibold text-slate-600 hover:text-emerald-800"
            >
              <Eye className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Main Symmetrical Knockout Bracket System Component
 */
export default function SymmetricalKnockoutBracket({
  bracket,
  isAdmin = false,
  onScoreMatch,
  onEditSlot,
  onMatchClick,
  onReopenCelebration,
}: SymmetricalKnockoutBracketProps) {
  const [activeMobileRoundIdx, setActiveMobileRoundIdx] = useState(0);
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');

  if (!bracket || bracket.rounds.length === 0 || bracket.status === 'Not Generated') {
    return (
      <Card className="border-dashed border-2 border-slate-200 bg-white p-12 text-center rounded-3xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 mb-4 border border-emerald-200 shadow-2xs">
          <Swords className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-black text-[#0B3323]">Knockout bracket will appear once fixtures are generated</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
          The playoff tree will automatically map Round of 16, Quarter-Finals, Semi-Finals, and Grand Final matches dynamically as participants qualify.
        </p>
      </Card>
    );
  }

  const { rounds, totalRounds, bracketSize, byesCount, tournament } = bracket;
  const isCompleted = tournament.status === 'completed';
  const champion = tournament.championUser;
  const runnerUp = tournament.runnerUpUser;

  const maxRoundNumber = Math.max(...rounds.map((r) => r.round_number));
  const grandFinalRound = rounds.find((r) => r.round_number === maxRoundNumber);
  const grandFinalMatch = grandFinalRound?.matches[0];

  // Rounds excluding the Grand Final round
  const prelimRounds = useMemo(
    () => rounds.filter((r) => r.round_number < maxRoundNumber).sort((a, b) => a.round_number - b.round_number),
    [rounds, maxRoundNumber]
  );

  return (
    <div className="space-y-6">
      {/* Header Info Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#0B3323] text-emerald-400 flex items-center justify-center shrink-0 shadow-xs">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-[#0B3323] tracking-tight">{tournament.name}</h2>
              <Badge className="bg-emerald-600 text-white font-bold text-[10px] uppercase">
                {formatTournamentFormat(tournament.format)}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 font-semibold">
              {bracketSize}-Player Bracket · {totalRounds} Rounds · {byesCount} Byes Assigned
            </p>
          </div>
        </div>

        {/* View Mode & Celebration Triggers */}
        <div className="flex items-center gap-2">
          {isCompleted && champion && onReopenCelebration && (
            <Button
              size="sm"
              onClick={onReopenCelebration}
              className="h-8 text-xs font-extrabold bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 hover:from-amber-600 hover:to-yellow-600 gap-1.5 shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Watch Winner Celebration</span>
            </Button>
          )}

          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('tree')}
              className={cn(
                'px-3 py-1 text-xs font-bold rounded-lg transition-all',
                viewMode === 'tree' ? 'bg-white text-[#0B3323] shadow-2xs' : 'text-slate-500 hover:text-[#0B3323]'
              )}
            >
              Playoff Tree
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'px-3 py-1 text-xs font-bold rounded-lg transition-all',
                viewMode === 'list' ? 'bg-white text-[#0B3323] shadow-2xs' : 'text-slate-500 hover:text-[#0B3323]'
              )}
            >
              Round List
            </button>
          </div>
        </div>
      </div>

      {/* Symmetrical Bracket Canvas (Desktop & Tablet) */}
      {viewMode === 'tree' ? (
        <div className="relative w-full overflow-x-auto no-scrollbar rounded-3xl border border-slate-200 bg-[#F4F8F5]/80 p-6 sm:p-8 shadow-xs">
          <div className="flex items-center justify-center min-w-max gap-8 sm:gap-12 py-4">
            {/* LEFT WING: R16 -> QF -> SF */}
            <div className="flex items-center gap-8 sm:gap-10">
              {prelimRounds.map((round) => {
                const leftMatches = round.matches.filter(
                  (m) => m.match_position <= Math.ceil(round.matches.length / 2)
                );

                return (
                  <div key={`left-round-${round.id}`} className="flex flex-col gap-6 items-center">
                    {/* Round Title */}
                    <div className="text-center py-1.5 px-4 bg-white/90 rounded-xl border border-slate-200 shadow-2xs w-full">
                      <span className="text-[11px] font-black text-[#0B3323] uppercase tracking-wider block">
                        {round.name}
                      </span>
                    </div>

                    {/* Match Cards Stack */}
                    <div className="flex flex-col gap-6 justify-around h-full">
                      {leftMatches.map((m) => (
                        <MatchCard
                          key={m.id}
                          match={m}
                          isAdmin={isAdmin}
                          onScoreMatch={onScoreMatch}
                          onEditSlot={onEditSlot}
                          onMatchClick={onMatchClick}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* CENTER COLUMN: CHAMPION STAGE + GRAND FINAL */}
            <div className="flex flex-col items-center gap-8 px-4 shrink-0">
              {/* CHAMPION STAGE */}
              <div className="w-72 sm:w-80 rounded-3xl border-2 border-amber-400 bg-gradient-to-b from-slate-900 via-[#0B2518] to-slate-950 p-6 text-white text-center shadow-xl relative overflow-hidden">
                <div className="absolute top-2 left-4">
                  <Sparkles className="h-4 w-4 text-amber-400/50" />
                </div>
                <div className="absolute top-2 right-4">
                  <Sparkles className="h-4 w-4 text-amber-400/50" />
                </div>

                <div className="flex flex-col items-center gap-2">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 text-slate-950 flex items-center justify-center shadow-lg ring-4 ring-amber-400/20">
                    <Trophy className="h-8 w-8" />
                  </div>

                  <div>
                    <Badge className="bg-amber-400 text-slate-950 font-black text-[10px] uppercase tracking-widest px-2.5 py-0.5 border-0 mb-1">
                      🏆 TOURNAMENT CHAMPION
                    </Badge>
                    <h3 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 tracking-tight truncate max-w-[240px]">
                      {champion ? champion.username : 'Winner TBD'}
                    </h3>
                    {champion?.real_name && (
                      <p className="text-xs text-amber-300/80 font-semibold">{champion.real_name}</p>
                    )}
                  </div>

                  {runnerUp && (
                    <div className="mt-2 pt-2 border-t border-amber-500/20 w-full flex items-center justify-center gap-2 text-xs text-slate-300">
                      <Medal className="h-3.5 w-3.5 text-slate-400" />
                      <span>Runner-Up: <strong className="text-white">{runnerUp.username}</strong></span>
                    </div>
                  )}
                </div>
              </div>

              {/* GRAND FINAL MATCH */}
              {grandFinalMatch && (
                <div className="flex flex-col items-center gap-2">
                  <div className="text-center py-1.5 px-6 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 rounded-xl font-black text-xs uppercase tracking-widest shadow-md">
                    ⚡ GRAND FINAL
                  </div>

                  <MatchCard
                    match={grandFinalMatch}
                    isFinalMatch={true}
                    isAdmin={isAdmin}
                    onScoreMatch={onScoreMatch}
                    onEditSlot={onEditSlot}
                    onMatchClick={onMatchClick}
                  />
                </div>
              )}
            </div>

            {/* RIGHT WING: SF <- QF <- R16 */}
            <div className="flex items-center gap-8 sm:gap-10">
              {[...prelimRounds].reverse().map((round) => {
                const rightMatches = round.matches.filter(
                  (m) => m.match_position > Math.ceil(round.matches.length / 2)
                );

                return (
                  <div key={`right-round-${round.id}`} className="flex flex-col gap-6 items-center">
                    {/* Round Title */}
                    <div className="text-center py-1.5 px-4 bg-white/90 rounded-xl border border-slate-200 shadow-2xs w-full">
                      <span className="text-[11px] font-black text-[#0B3323] uppercase tracking-wider block">
                        {round.name}
                      </span>
                    </div>

                    {/* Match Cards Stack */}
                    <div className="flex flex-col gap-6 justify-around h-full">
                      {rightMatches.map((m) => (
                        <MatchCard
                          key={m.id}
                          match={m}
                          isAdmin={isAdmin}
                          onScoreMatch={onScoreMatch}
                          onEditSlot={onEditSlot}
                          onMatchClick={onMatchClick}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Round List Fallback View */
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveMobileRoundIdx((prev) => Math.max(0, prev - 1))}
              disabled={activeMobileRoundIdx === 0}
              className="h-8 px-2"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <span className="text-xs font-black text-[#0B3323]">
              {rounds[activeMobileRoundIdx]?.name || `Round ${activeMobileRoundIdx + 1}`} ({activeMobileRoundIdx + 1}/{rounds.length})
            </span>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveMobileRoundIdx((prev) => Math.min(rounds.length - 1, prev + 1))}
              disabled={activeMobileRoundIdx === rounds.length - 1}
              className="h-8 px-2"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {rounds[activeMobileRoundIdx] && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rounds[activeMobileRoundIdx].matches.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  isFinalMatch={m.round_id === grandFinalRound?.id}
                  isAdmin={isAdmin}
                  onScoreMatch={onScoreMatch}
                  onEditSlot={onEditSlot}
                  onMatchClick={onMatchClick}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
