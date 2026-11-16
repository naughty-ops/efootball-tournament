'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Swords, Loader2, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { joinWaitingMatchByCodeAction } from '@/app/actions/oneVsOneActions';

interface JoinMatchModalProps {
  initialCode?: string;
  onClose: () => void;
  onJoined: (matchId: string) => void;
}

export default function JoinMatchModal({
  initialCode = '',
  onClose,
  onJoined,
}: JoinMatchModalProps) {
  const [matchCode, setMatchCode] = useState(initialCode);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchCode.trim()) {
      setErrorMsg('Please enter a valid match code.');
      return;
    }

    setIsJoining(true);
    setErrorMsg(null);

    const res = await joinWaitingMatchByCodeAction(matchCode.trim());
    setIsJoining(false);

    if (!res.success || !res.data) {
      setErrorMsg(res.error || 'Failed to join match. Please check the code.');
      return;
    }

    onJoined(res.data.matchId);
    onClose();
  };

  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-md rounded-[28px] bg-[#1010C5] border border-white/20 p-6 sm:p-7 text-white shadow-2xl shadow-black/80 relative space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white/80 hover:text-white transition-all cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-[#FFFF00] text-[#08088F] flex items-center justify-center shadow-lg shadow-yellow-500/20 shrink-0">
            <Swords className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#FFFF00] block">
              1 VS 1 Arena Duel
            </span>
            <h3 className="text-xl sm:text-2xl font-black font-display uppercase tracking-wider text-white">
              Join Challenge Room
            </h3>
          </div>
        </div>

        <p className="text-xs text-white/70 leading-relaxed">
          Enter the match code provided by your opponent to enter their room and start the duel immediately.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-white/80">
              Match Code
            </label>
            <Input
              type="text"
              value={matchCode}
              onChange={(e) => setMatchCode(e.target.value.toUpperCase())}
              placeholder="e.g. 1V1-21DB-5700"
              className="h-12 rounded-xl bg-[#08088F] border-white/25 text-white placeholder-white/40 font-mono text-center text-base tracking-widest font-black uppercase focus:border-[#FFFF00]"
              disabled={isJoining}
              autoFocus
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-300 font-bold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="p-3 rounded-xl bg-[#00E676]/10 border border-[#00E676]/25 text-[11px] text-[#00E676] flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Entry fee will be deducted and locked safely in escrow upon joining.</span>
          </div>

          <div className="pt-2 flex items-center gap-2">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              disabled={isJoining}
              className="w-1/3 rounded-xl border-white/20 text-white/80 hover:bg-white/10 text-xs font-bold h-11"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isJoining || !matchCode.trim()}
              className="flex-1 rounded-xl bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs uppercase tracking-wider h-11 shadow-lg shadow-yellow-500/20 gap-2 cursor-pointer transition-all"
            >
              {isJoining ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-[#08088F]" />
                  <span>Entering Arena...</span>
                </>
              ) : (
                <>
                  <span>Join Match</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
}
