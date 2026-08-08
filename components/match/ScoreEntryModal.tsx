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
  isLoading = false,
}: ScoreEntryModalProps) {
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
    if (!isGroupMatch && scoreA === scoreB) {
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
  else if (scoreA === scoreB && isGroupMatch) winnerPreview = 'Draw (1 Point Each)';

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={isLive ? '🔴 Live Match Score' : 'Record Match Score'}
      description={`Manage match between ${participantA} and ${participantB}`}
    >
      <div className="space-y-4 pt-1">
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
          isGroupMatch ? (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs font-semibold">
              Group Match Draw — 1 point each upon completion.
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
            <p className="text-[11px] text-amber-700">
              Result: <strong className="text-emerald-800">{winnerPreview}</strong>. Once completed, score updates are finalized and winner advances.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Close
          </Button>

          {isLive ? (
            showConfirmComplete ? (
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmComplete}
                disabled={isLoading || (!isGroupMatch && scoreA === scoreB)}
                className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
                Confirm & Complete Match
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => setShowConfirmComplete(true)}
                disabled={isLoading || (!isGroupMatch && scoreA === scoreB)}
                className="font-bold bg-primary text-white gap-1.5"
              >
                <Trophy className="h-4 w-4" />
                Complete Match
              </Button>
            )
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmComplete}
              disabled={isLoading || (!isGroupMatch && scoreA === scoreB)}
              className="font-bold bg-primary text-white gap-1.5"
            >
              {isLoading ? 'Saving...' : 'Submit Result'}
            </Button>
          )}
        </div>
      </div>
    </BaseModal>
  );
}
