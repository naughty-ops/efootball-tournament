'use client';

import React, { useState } from 'react';
import {
  Trophy,
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Clock,
  Swords,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitPlayerScoreAction } from '@/app/actions/matchSchedulingActions';

interface SubmitMatchScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  tournamentId: string;
  participantId: string;
  userDisplayName: string;
  opponentDisplayName: string;
  userSide: 'home' | 'away';
  existingMyScore?: number;
  existingOpponentScore?: number;
  onSuccess: (result: {
    status: string;
    verified?: boolean;
    matching?: boolean;
    conflict?: boolean;
    message?: string;
  }) => void;
}

export default function SubmitMatchScoreModal({
  isOpen,
  onClose,
  matchId,
  tournamentId,
  participantId,
  userDisplayName,
  opponentDisplayName,
  userSide,
  existingMyScore,
  existingOpponentScore,
  onSuccess,
}: SubmitMatchScoreModalProps) {
  const [myScore, setMyScore] = useState<string>(
    existingMyScore !== undefined ? String(existingMyScore) : ''
  );
  const [opponentScore, setOpponentScore] = useState<string>(
    existingOpponentScore !== undefined ? String(existingOpponentScore) : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedMyScore = parseInt(myScore, 10);
    const parsedOpponentScore = parseInt(opponentScore, 10);

    if (isNaN(parsedMyScore) || parsedMyScore < 0) {
      setError('Please enter a valid score for yourself (0 or greater).');
      return;
    }
    if (isNaN(parsedOpponentScore) || parsedOpponentScore < 0) {
      setError("Please enter a valid score for your opponent (0 or greater).");
      return;
    }

    setLoading(true);

    const res = await submitPlayerScoreAction({
      matchId,
      tournamentId,
      participantId,
      myScore: parsedMyScore,
      opponentScore: parsedOpponentScore,
    });

    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to submit score.');
      return;
    }

    onSuccess(res.data || { status: 'awaiting_result' });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-[#0B0B7A] border border-white/20 p-6 shadow-2xl space-y-4">
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute right-4 top-4 p-1.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#FFFF00]/10 border border-[#FFFF00]/30 flex items-center justify-center text-[#FFFF00]">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black uppercase tracking-wider text-white font-display">
              Submit Match Score
            </h3>
            <p className="text-xs text-white/60">Independent result submission</p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Head to head comparison */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-[#080860] border border-white/10">
            {/* You */}
            <div className="space-y-1.5 text-center">
              <span className="text-[10px] font-bold text-[#FFFF00] uppercase tracking-wider block">
                You ({userSide})
              </span>
              <span className="text-xs font-bold text-white block truncate">
                {userDisplayName}
              </span>
              <Input
                type="number"
                min="0"
                max="99"
                value={myScore}
                onChange={(e) => setMyScore(e.target.value)}
                placeholder="0"
                className="bg-[#0A0A7A] border-white/30 text-center text-xl font-black text-white rounded-xl h-12"
                required
                disabled={loading}
                autoFocus
              />
            </div>

            {/* Opponent */}
            <div className="space-y-1.5 text-center">
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider block">
                Opponent ({userSide === 'home' ? 'away' : 'home'})
              </span>
              <span className="text-xs font-bold text-white block truncate">
                {opponentDisplayName}
              </span>
              <Input
                type="number"
                min="0"
                max="99"
                value={opponentScore}
                onChange={(e) => setOpponentScore(e.target.value)}
                placeholder="0"
                className="bg-[#0A0A7A] border-white/30 text-center text-xl font-black text-white rounded-xl h-12"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-200 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>Automatic Verification Rules:</span>
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-sky-200/80">
              <li>Both players have up to 30 minutes from match kickoff to submit.</li>
              <li>Matching scores are verified immediately and standings update automatically.</li>
              <li>Conflicting scores flag the match as DISPUTED and require screenshot evidence.</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="border-white/20 bg-[#0A0A7A] text-white hover:bg-white/10 text-xs rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-xl px-5"
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying...
                </span>
              ) : (
                'Confirm & Submit'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
