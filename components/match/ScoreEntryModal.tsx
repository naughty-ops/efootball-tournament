'use client';

import React, { useState, useEffect } from 'react';
import { BaseModal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Check, Radio, Trophy, AlertCircle } from 'lucide-react';

interface ScoreEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdateLiveScore?: (scoreA: number, scoreB: number) => Promise<void>;
  onCompleteMatch?: (
    scoreA: number,
    scoreB: number,
    penA?: number | null,
    penB?: number | null,
    decidedBy?: 'normal' | 'penalties'
  ) => Promise<void>;
  onSubmitScore?: (
    scoreA: number,
    scoreB: number,
    penA?: number | null,
    penB?: number | null,
    decidedBy?: 'normal' | 'penalties'
  ) => Promise<void>;
  participantA: string;
  participantB: string;
  currentScoreA: number;
  currentScoreB: number;
  currentPenaltyScoreA?: number | null;
  currentPenaltyScoreB?: number | null;
  currentDecidedBy?: string | null;
  isLive?: boolean;
  isGroupMatch?: boolean;
  allowDraw?: boolean;
  isLoading?: boolean;
}

export function ScoreEntryModal({
  isOpen,
  onClose,
  onUpdateLiveScore,
  onCompleteMatch,
  onSubmitScore,
  participantA,
  participantB,
  currentScoreA,
  currentScoreB,
  currentPenaltyScoreA,
  currentPenaltyScoreB,
  currentDecidedBy,
  isLive = false,
  isGroupMatch = false,
  allowDraw = false,
  isLoading = false,
}: ScoreEntryModalProps) {
  const canDraw = isGroupMatch || allowDraw;
  const [scoreA, setScoreA] = useState(currentScoreA);
  const [scoreB, setScoreB] = useState(currentScoreB);

  const [isPenalties, setIsPenalties] = useState<boolean>(currentDecidedBy === 'penalties');
  const [penScoreA, setPenScoreA] = useState<number | ''>(currentPenaltyScoreA ?? '');
  const [penScoreB, setPenScoreB] = useState<number | ''>(currentPenaltyScoreB ?? '');

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfirmComplete, setShowConfirmComplete] = useState(false);

  const isKnockoutDraw = !canDraw && scoreA === scoreB;

  // Auto enable penalties strictly when a knockout match score is tied
  useEffect(() => {
    if (isKnockoutDraw) {
      setIsPenalties(true);
    } else {
      setIsPenalties(false);
      setPenScoreA('');
      setPenScoreB('');
    }
  }, [isKnockoutDraw]);

  // Debounced Live Auto-Save when modal is open and match is LIVE
  useEffect(() => {
    if (!isOpen || !isLive || !onUpdateLiveScore) return;
    if (scoreA === currentScoreA && scoreB === currentScoreB) return;

    if (scoreA < 0 || scoreB < 0 || isNaN(scoreA) || isNaN(scoreB)) {
      return;
    }

    const timer = setTimeout(async () => {
      setSaveState('saving');
      try {
        await onUpdateLiveScore(scoreA, scoreB);
        setSaveState('saved');
        setErrorMessage(null);
      } catch (err: unknown) {
        setSaveState('error');
        const msg = err instanceof Error ? err.message : 'Failed to save score';
        setErrorMessage(msg);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [scoreA, scoreB, currentScoreA, currentScoreB, isLive, onUpdateLiveScore, isOpen]);

  const handleConfirmComplete = async () => {
    if (scoreA < 0 || scoreB < 0 || isNaN(scoreA) || isNaN(scoreB)) {
      setErrorMessage('Scores must be non-negative numbers.');
      return;
    }

    if (isKnockoutDraw) {
      if (penScoreA === '' || penScoreB === '' || isNaN(Number(penScoreA)) || isNaN(Number(penScoreB))) {
        setErrorMessage('Penalty shootout scores are required for tied knockout matches.');
        return;
      }
      if (Number(penScoreA) === Number(penScoreB)) {
        setErrorMessage('Penalty shootout scores cannot be tied. A winner must be decided.');
        return;
      }
    }

    setErrorMessage(null);
    const pA = isKnockoutDraw && penScoreA !== '' ? Number(penScoreA) : null;
    const pB = isKnockoutDraw && penScoreB !== '' ? Number(penScoreB) : null;
    const dec = isKnockoutDraw ? 'penalties' : 'normal';

    if (onCompleteMatch) {
      await onCompleteMatch(scoreA, scoreB, pA, pB, dec);
    } else if (onSubmitScore) {
      await onSubmitScore(scoreA, scoreB, pA, pB, dec);
    }
    onClose();
  };

  let winnerPreview = 'TBD';
  if (isKnockoutDraw && penScoreA !== '' && penScoreB !== '') {
    winnerPreview = Number(penScoreA) > Number(penScoreB) ? `${participantA} (Won on Penalties)` : `${participantB} (Won on Penalties)`;
  } else if (scoreA > scoreB) {
    winnerPreview = participantA;
  } else if (scoreB > scoreA) {
    winnerPreview = participantB;
  } else if (scoreA === scoreB && canDraw) {
    winnerPreview = 'Draw (1 Point Each)';
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={isLive ? '🔴 Live Match Score' : 'Record Match Score'}
      description={`Manage match between ${participantA} and ${participantB}`}
    >
      <div className="space-[#0B3323] space-y-4 pt-1">
        {errorMessage && (
          <div className="p-3 text-xs bg-destructive/10 border border-destructive/20 text-destructive rounded-xl font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isLive && (
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#F4F8F5] border border-border text-xs font-bold">
            <div className="flex items-center gap-1.5 text-rose-700">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              <span>Match is LIVE</span>
            </div>
            <div className="flex items-center gap-1 font-semibold text-muted-foreground">
              {saveState === 'saving' && (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                  <span className="text-amber-700">Saving...</span>
                </>
              )}
              {saveState === 'saved' && (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Saved ✓</span>
                </>
              )}
              {saveState === 'error' && <span className="text-destructive font-bold">Save Error</span>}
            </div>
          </div>
        )}

        {/* Score Inputs */}
        <div className="grid grid-cols-2 gap-4 items-center">
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#0B3323] truncate block">
              {participantA} (Score)
            </label>
            <Input
              type="number"
              min={0}
              value={scoreA}
              onChange={(e) => setScoreA(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="text-center font-mono font-bold text-xl h-14"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[#0B3323] truncate block text-right">
              {participantB} (Score)
            </label>
            <Input
              type="number"
              min={0}
              value={scoreB}
              onChange={(e) => setScoreB(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="text-center font-mono font-bold text-xl h-14"
            />
          </div>
        </div>

        {/* Penalty Shootout Section - Revealed strictly when knockout match is tied */}
        {isKnockoutDraw && (
          <div className="p-3 bg-[#F4F8F5] rounded-2xl border border-emerald-300/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#0B3323] flex items-center gap-1.5">
                <Trophy className="h-4 w-4 text-emerald-600" />
                <span>Knockout Tie — Enter Penalty Shootout Scores</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-emerald-200/60">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#0B3323] block truncate">
                  {participantA} Penalty PK
                </label>
                <Input
                  type="number"
                  min={0}
                  placeholder="e.g. 4"
                  value={penScoreA}
                  onChange={(e) => setPenScoreA(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="text-center font-mono font-bold text-base h-10 border-emerald-400 bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#0B3323] block truncate text-right">
                  {participantB} Penalty PK
                </label>
                <Input
                  type="number"
                  min={0}
                  placeholder="e.g. 3"
                  value={penScoreB}
                  onChange={(e) => setPenScoreB(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="text-center font-mono font-bold text-base h-10 border-emerald-400 bg-white"
                />
              </div>

              {penScoreA !== '' && penScoreB !== '' && (
                <div className="col-span-2 p-2 bg-emerald-100 border border-emerald-300 rounded-xl text-center text-xs font-black text-emerald-950 font-mono">
                  Final Result Preview: {scoreA} ({penScoreA})–({penScoreB}) {scoreB}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Draw Info for Group matches */}
        {scoreA === scoreB && canDraw && (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs font-semibold">
            League / Group Match Draw — 1 point each upon completion.
          </div>
        )}

        {/* Confirmation State overlay */}
        {showConfirmComplete && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
            <p className="font-bold text-sm">Complete this match?</p>
            <p>
              Final Result:{' '}
              <strong className="text-[#0B3323] font-mono">
                {participantA} {scoreA}
                {isPenalties && penScoreA !== '' ? ` (${penScoreA})` : ''} —{' '}
                {isPenalties && penScoreB !== '' ? `(${penScoreB}) ` : ''}
                {scoreB} {participantB}
              </strong>
            </p>
            <p className="text-amber-800/80">
              Winner: <strong>{winnerPreview}</strong>
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowConfirmComplete(false)}
                disabled={isLoading}
                className="text-xs font-bold bg-white"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmComplete}
                disabled={isLoading}
                className="text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white gap-1"
              >
                {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                <span>Confirm & Lock Final Result</span>
              </Button>
            </div>
          </div>
        )}

        {/* Actions */}
        {!showConfirmComplete && (
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={onClose} className="font-bold text-xs">
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setShowConfirmComplete(true)}
                disabled={isLoading || (!canDraw && !isPenalties && scoreA === scoreB)}
                className="font-bold text-xs bg-emerald-700 hover:bg-emerald-800 text-white gap-1"
              >
                <Trophy className="h-3.5 w-3.5" />
                <span>Complete Match</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
}
