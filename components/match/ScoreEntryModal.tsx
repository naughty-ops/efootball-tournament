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
  onCompleteMatch?: (scoreA: number, scoreB: number) => Promise<void>;
  onSubmitScore?: (scoreA: number, scoreB: number) => Promise<void>;
  participantA: string;
  participantB: string;
  currentScoreA: number;
  currentScoreB: number;
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
  isLive = false,
  isGroupMatch = false,
  allowDraw = false,
  isLoading = false,
}: ScoreEntryModalProps) {
  const canDraw = isGroupMatch || allowDraw;
  const [scoreA, setScoreA] = useState(currentScoreA);
  const [scoreB, setScoreB] = useState(currentScoreB);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfirmComplete, setShowConfirmComplete] = useState(false);

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
    if (!canDraw && scoreA === scoreB) {
      setErrorMessage('Knockout matches require a winner. Scores cannot be equal.');
      return;
    }

    setErrorMessage(null);
    if (onCompleteMatch) {
      await onCompleteMatch(scoreA, scoreB);
    } else if (onSubmitScore) {
      await onSubmitScore(scoreA, scoreB);
    }
    onClose();
  };

  let winnerPreview = 'TBD';
  if (scoreA > scoreB) winnerPreview = participantA;
  else if (scoreB > scoreA) winnerPreview = participantB;
  else if (scoreA === scoreB && canDraw) winnerPreview = 'Draw (1 Point Each)';

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
              {participantA}
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
              {participantB}
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

        {/* Draw Info */}
        {scoreA === scoreB && (
          canDraw ? (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs font-semibold">
              League / Group Match Draw — 1 point each upon completion.
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-destructive/10 text-destructive text-xs font-semibold">
              Knockout matches require a winner. Scores cannot be equal.
            </div>
          )
        )}

        {/* Confirmation State overlay */}
        {showConfirmComplete && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
            <p className="font-bold text-sm">Complete this match?</p>
            <p>
              Final score: <strong className="text-[#0B3323]">{participantA} {scoreA} — {scoreB} {participantB}</strong>
            </p>
            <p className="text-amber-800/80">
              Outcome: <strong>{winnerPreview}</strong>
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
                disabled={isLoading || (!canDraw && scoreA === scoreB)}
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
