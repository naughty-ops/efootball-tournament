'use client';

import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Share2, ShieldCheck, Clock, Loader2, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OneVsOneMatchDetail } from '@/types/oneVsOne';
import { cancelWaitingMatchAction } from '@/app/actions/oneVsOneActions';
import ShareMatchModal from './ShareMatchModal';

interface MatchmakingBannerProps {
  match: OneVsOneMatchDetail;
  onCancelled?: () => void;
  onReturnToRoom?: () => void;
  className?: string;
  compact?: boolean;
}

export default function MatchmakingBanner({
  match,
  onCancelled,
  onReturnToRoom,
  className = '',
  compact = false,
}: MatchmakingBannerProps) {
  const [elapsed, setElapsed] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    setCancelError(null);
    const res = await cancelWaitingMatchAction(match.id);
    setIsCancelling(false);

    if (!res.success) {
      setCancelError(res.error || 'Failed to cancel queue.');
      return;
    }
    onCancelled?.();
  };

  return (
    <>
      <div
        className={`w-full rounded-2xl bg-gradient-to-r from-[#050524] via-[#08084A] to-[#050524] border border-[#1E1EF5]/40 shadow-2xl shadow-black/60 p-4 sm:p-5 text-white relative overflow-hidden transition-all ${className}`}
      >
        {/* Animated ambient sweep */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1E1EF5]/20 via-transparent to-transparent pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Left: Spinner & Title matching official broadcast indicator */}
          <div className="flex items-center gap-3.5 sm:gap-4 w-full md:w-auto">
            {/* Custom 12-dot circular rotating loader matching uploaded screenshot */}
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
                <circle cx="6" cy="26.5" r="2.5" fill="currentColor" fillOpacity="0.2" />
                <circle cx="4" cy="19" r="2.5" fill="currentColor" fillOpacity="0.15" />
                <circle cx="6" cy="11.5" r="2.5" fill="currentColor" fillOpacity="0.1" />
                <circle cx="11.5" cy="6" r="2.5" fill="currentColor" fillOpacity="0.08" />
              </svg>
            </div>

            {/* Text & Meta */}
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-2">
                  Matchmaking in Progress...
                </span>
                <span className="text-[11px] font-mono font-bold text-[#FFFF00] bg-[#FFFF00]/10 border border-[#FFFF00]/30 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                  <Clock className="h-3 w-3" />
                  <span>{formatElapsed(elapsed)}</span>
                </span>
              </div>
              <p className="text-xs text-white/70">
                Tier: <span className="text-[#FFFF00] font-black">{match.card?.name || '1v1'}</span> • Prize:{' '}
                <span className="text-[#00E676] font-black">₹{match.card?.advertised_payout || 0}</span> • Waiting for opponent to enter
              </p>
            </div>
          </div>

          {/* Right: Actions (Return to Room, Share Match Link, Match Code Copy, Cancel) */}
          <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto justify-end">
            {onReturnToRoom && (
              <Button
                onClick={onReturnToRoom}
                size="sm"
                className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] text-xs font-black uppercase tracking-wider px-4 h-9 gap-1.5 shadow-md shadow-yellow-500/20 transition-all cursor-pointer"
              >
                <Swords className="h-3.5 w-3.5" />
                <span>Return to Room</span>
              </Button>
            )}

            {/* Share Match Link Button */}
            <Button
              onClick={() => setShowShareModal(true)}
              size="sm"
              className="rounded-full bg-[#1E1EF5] hover:bg-[#2A2AFF] text-white text-xs font-black uppercase tracking-wider px-4 h-9 gap-1.5 shadow-md shadow-blue-600/30 transition-all cursor-pointer"
            >
              <Share2 className="h-3.5 w-3.5 text-[#FFFF00]" />
              <span>Share Match Link</span>
            </Button>

            {/* Match Code Chip */}
            <button
              onClick={handleCopyCode}
              title="Click to copy match code"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 text-xs font-mono font-bold text-white transition-all cursor-pointer"
            >
              <span className="text-white/60">Code:</span>
              <span className="text-[#FFFF00] font-black">{match.match_code}</span>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-[#00E676]" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-white/70" />
              )}
            </button>

            {/* Cancel Matchmaking (Instant Refund) */}
            <Button
              onClick={handleCancel}
              disabled={isCancelling}
              size="sm"
              variant="outline"
              className="rounded-full border-red-500/30 text-red-300 hover:bg-red-500/20 hover:text-white hover:border-red-500/50 text-xs font-bold px-3.5 h-9 transition-all cursor-pointer"
            >
              {isCancelling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Cancel</span>
            </Button>
          </div>
        </div>

        {cancelError && (
          <div className="mt-3 p-2.5 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-300 font-bold">
            {cancelError}
          </div>
        )}
      </div>

      {/* Share Match Modal */}
      {showShareModal && (
        <ShareMatchModal
          match={match}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </>
  );
}
