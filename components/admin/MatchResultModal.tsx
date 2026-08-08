'use client';

import React from 'react';
import { X, CheckCircle2, Trophy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { FullMatchData } from '@/services/matchService';

interface MatchResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  match: FullMatchData | null;
  scoreA: number;
  scoreB: number;
  winnerName: string;
  resultType: 'normal' | 'walkover' | 'disqualification';
  isLoading: boolean;
}

export function MatchResultModal({
  isOpen,
  onClose,
  onConfirm,
  match,
  scoreA,
  scoreB,
  winnerName,
  resultType,
  isLoading,
}: MatchResultModalProps) {
  if (!isOpen || !match) return null;

  const playerAName = match.participantAUser ? match.participantAUser.username : 'Participant A';
  const playerBName = match.participantBUser ? match.participantBUser.username : 'Participant B';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

      {/* Modal Content */}
      <div className="relative w-full max-w-md bg-white rounded-3xl border border-border shadow-2xl p-6 z-10 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[#0B3323]">Confirm Match Result</h3>
              <p className="text-xs text-muted-foreground">Match #{match.match_position}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={isLoading} className="text-muted-foreground hover:text-[#0B3323] p-1 rounded-xl">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Match Summary Box */}
        <div className="p-4 rounded-2xl bg-[#F4F8F5] border border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Result Type</span>
            <Badge variant="outline" className="capitalize font-bold text-xs">
              {resultType}
            </Badge>
          </div>

          <div className="flex items-center justify-between py-2 border-y border-border/60 text-xs">
            <div className="flex items-center gap-2 font-bold text-[#0B3323]">
              {match.participantAUser?.seed_number && (
                <Badge variant="efootball" className="text-[10px] px-1.5 py-0">#{match.participantAUser.seed_number}</Badge>
              )}
              <span>{playerAName}</span>
            </div>

            <div className="font-mono text-base font-extrabold text-primary px-3 py-0.5 rounded-lg bg-white border border-border">
              {resultType === 'normal' ? `${scoreA} - ${scoreB}` : 'W/O'}
            </div>

            <div className="flex items-center gap-2 font-bold text-[#0B3323] text-right">
              <span>{playerBName}</span>
              {match.participantBUser?.seed_number && (
                <Badge variant="efootball" className="text-[10px] px-1.5 py-0">#{match.participantBUser.seed_number}</Badge>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground font-semibold">Advancing Winner:</span>
            <div className="flex items-center gap-1.5 font-extrabold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-lg border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{winnerName}</span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Confirming will complete this match and automatically advance <strong className="text-[#0B3323]">{winnerName}</strong> into the next round bracket slot.
        </p>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading} className="rounded-xl">
            Cancel
          </Button>
          <Button onClick={onConfirm} size="sm" disabled={isLoading} className="font-bold rounded-xl gap-2 shadow-md">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
            <span>Confirm & Save Result</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
