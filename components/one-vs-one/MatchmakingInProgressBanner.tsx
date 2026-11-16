'use client';

import React, { useState, useEffect } from 'react';
import { Share2, Copy, Check, X, Clock, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OneVsOneMatchDetail } from '@/types/oneVsOne';
import { cancelWaitingMatchAction } from '@/app/actions/oneVsOneActions';
import ShareMatchModal from './ShareMatchModal';

interface MatchmakingInProgressBannerProps {
  match: OneVsOneMatchDetail;
  onCancelled?: () => void;
  className?: string;
  showActions?: boolean;
}

export default function MatchmakingInProgressBanner({
  match,
  onCancelled,
  className = '',
  showActions = true,
}: MatchmakingInProgressBannerProps) {
  const [elapsed, setElapsed] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatElapsed = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(match.match_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    setCancelError(null);
    const res = await cancelWaitingMatchAction(match.id);
    setIsCancelling(false);

    if (!res.success) {
      setCancelError(res.error || 'Failed to cancel matchmaking.');
      return;
    }
    onCancelled?.();
  };

  return (
    <>
      <div
        className={`w-full rounded-2xl bg-gradient-to-r from-[#030312] via-[#050528] to-[#020216] border border-[#1E1EF5]/40 shadow-2xl p-4 sm:p-5 text-white relative overflow-hidden transition-all ${className}`}
      >
        {/* Subtle authentic stadium ambient glow on the right */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-[#1E1EF5]/20 via-[#1E1EF5]/5 to-transparent pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Exact Matchmaking in Progress bar matching uploaded image */}
          <div className="flex items-center gap-3.5 sm:gap-4 w-full md:w-auto">
            {/* Authentic 12-dot circular rotating loader */}
            <div className="relative shrink-0 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9">
              <svg
                className="w-full h-full animate-spin text-white"
                viewBox="0 0 38 38"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="19" cy="4" r="2.5" fill="currentColor" fillOpacity="1" />
                <circle cx="26.5" cy="6" r="2.5" fill="currentColor" fillOpacity="0.9" />
                <circle cx="32" cy="11.5" r="2.5" fill="currentColor" fillOpacity="0.8" />
                <circle cx="34" cy="19" r="2.5" fill="currentColor" fillOpacity="0.7" />
                <circle cx="32" cy="26.5" r="2.5" fill="currentColor" fillOpacity="0.6" />
                <circle cx="26.5" cy="32" r="2.5" fill="currentColor" fillOpacity="0.5" />
                <circle cx="19" cy="34" r="2.5" fill="currentColor" fillOpacity="0.4" />
                <circle cx="11.5" cy="32" r="2.5" fill="currentColor" fillOpacity="0.3" />
                <circle cx="6" cy="26.5" r="2.5" fill="currentColor" fillOpacity="0.22" />
                <circle cx="4" cy="19" r="2.5" fill="currentColor" fillOpacity="0.16" />
                <circle cx="6" cy="11.5" r="2.5" fill="currentColor" fillOpacity="0.11" />
                <circle cx="11.5" cy="6" r="2.5" fill="currentColor" fillOpacity="0.07" />
              </svg>
            </div>

            {/* Authentic Text matching screenshot */}
            <div className="space-y-0.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-base sm:text-lg md:text-xl font-bold tracking-wide text-white drop-shadow-sm font-sans">
                  Matchmaking in Progress...
                </span>
                <span className="text-xs font-mono font-bold text-[#FFFF00] bg-[#FFFF00]/15 border border-[#FFFF00]/30 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                  <Clock className="h-3 w-3" />
                  <span>{formatElapsed(elapsed)}</span>
                </span>
              </div>
              <p className="text-xs text-white/60">
                Searching for verified rival in{' '}
                <span className="text-[#FFFF00] font-black">{match.card?.name || '1v1 Arena'}</span>
                {' · '}
                Code:{' '}
                <span className="font-mono font-bold text-white/90">{match.match_code}</span>
              </p>
            </div>
          </div>

          {/* Right Action Controls */}
          {showActions && (
            <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
              {/* Share / Invite Button */}
              <Button
                onClick={() => setShowShareModal(true)}
                size="sm"
                className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs uppercase tracking-wider px-3.5 h-8 gap-1.5 cursor-pointer shadow-md shadow-yellow-500/20"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share Match</span>
              </Button>

              {/* Copy Code */}
              <Button
                onClick={handleCopyCode}
                size="sm"
                variant="outline"
                className="rounded-full border-white/20 text-white hover:bg-white/10 text-xs font-bold px-3 h-8 gap-1.5 cursor-pointer"
              >
                {copiedCode ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#00E676]" />
                    <span className="text-[#00E676]">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </Button>

              {/* Cancel Matchmaking */}
              <Button
                onClick={handleCancel}
                disabled={isCancelling}
                size="sm"
                variant="ghost"
                className="rounded-full text-white/60 hover:text-red-400 hover:bg-red-500/10 text-xs font-bold px-3 h-8 gap-1 cursor-pointer transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                <span>{isCancelling ? 'Cancelling...' : 'Cancel'}</span>
              </Button>
            </div>
          )}
        </div>

        {cancelError && (
          <div className="mt-2 text-xs text-red-400 font-semibold bg-red-950/40 p-2 rounded-lg border border-red-500/30">
            {cancelError}
          </div>
        )}
      </div>

      {showShareModal && (
        <ShareMatchModal match={match} onClose={() => setShowShareModal(false)} />
      )}
    </>
  );
}
