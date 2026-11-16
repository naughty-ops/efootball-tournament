'use client';

import React, { useState, useEffect } from 'react';
import {
  Loader2,
  Radio,
  XCircle,
  Swords,
  ShieldCheck,
  Trophy,
  Sparkles,
  Copy,
  Check,
  Clock,
  Share2,
  ExternalLink,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { OneVsOneMatchDetail } from '@/types/oneVsOne';
import { cancelWaitingMatchAction } from '@/app/actions/oneVsOneActions';
import ShareMatchModal from './ShareMatchModal';

interface OneVsOneWaitingQueueProps {
  match: OneVsOneMatchDetail;
  onCancelled: () => void;
}

export default function OneVsOneWaitingQueue({
  match,
  onCancelled,
}: OneVsOneWaitingQueueProps) {
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
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

  const copyMatchCode = () => {
    navigator.clipboard.writeText(match.match_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyMatchLink = () => {
    const url = `${window.location.origin}/dashboard/matches?mode=1v1&joinMatch=${encodeURIComponent(match.match_code)}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleWhatsAppShare = () => {
    const url = `${window.location.origin}/dashboard/matches?mode=1v1&joinMatch=${encodeURIComponent(match.match_code)}`;
    const tierName = match.card?.name || '1v1 Arena';
    const entry = match.card?.entry_amount || 0;
    const payout = match.card?.advertised_payout || 0;
    const text = `⚽ *eFootball 1 VS 1 Challenge!*\nJoin my match duel!\n🏆 *Tier:* ${tierName} (Entry: ₹${entry}, Prize: ₹${payout})\n🔑 *Code:* ${match.match_code}\n👉 *Click to join:*\n${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    setCancelError(null);

    const res = await cancelWaitingMatchAction(match.id);
    setIsCancelling(false);

    if (!res.success) {
      setCancelError(res.error || 'Failed to cancel match.');
      return;
    }

    onCancelled();
  };

  return (
    <Card className="rounded-[32px] bg-gradient-to-b from-[#0A0A70] to-[#070748] border border-white/15 p-6 sm:p-10 shadow-2xl text-white max-w-2xl mx-auto text-center space-y-7 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#FF168B]/15 rounded-full blur-3xl pointer-events-none" />

      {/* Radar Pulse Icon */}
      <div className="relative mx-auto w-28 h-28 flex items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-[#FF168B]/15 animate-ping opacity-60" />
        <span className="absolute inset-3 rounded-full bg-[#FF168B]/25 animate-pulse" />
        <span className="absolute inset-6 rounded-full border border-[#FF168B]/40" />
        <div className="relative h-16 w-16 rounded-full bg-[#080838] border-2 border-[#FF168B] flex items-center justify-center text-[#FF168B] shadow-[0_0_25px_rgba(255,22,139,0.5)]">
          <Radio className="h-8 w-8 animate-pulse text-[#FF168B]" />
        </div>
      </div>

      {/* Status Details */}
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#FF168B] bg-[#FF168B]/15 border border-[#FF168B]/35 px-4 py-1 rounded-full shadow-sm shadow-pink-500/20 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#FF168B] inline-block animate-ping" />
            <span>Looking for Opponent</span>
          </span>
          <span className="text-[10px] font-mono font-bold text-white/70 bg-white/10 px-3 py-1 rounded-full flex items-center gap-1">
            <Clock className="h-3 w-3 text-[#FFFF00]" />
            <span>{formatElapsed(elapsed)}</span>
          </span>
        </div>

        <h3 className="text-2xl sm:text-3xl font-black font-display uppercase tracking-wider text-white pt-1">
          Matchmaking in Progress
        </h3>
        <p className="text-xs sm:text-sm text-white/75 max-w-md mx-auto leading-relaxed">
          Waiting for another player to enter the <span className="text-[#FFFF00] font-black">{match.card?.name || '1v1'}</span> tier.
          Pairing occurs automatically.
        </p>
      </div>

      {/* Match Details Pill */}
      <div className="grid grid-cols-2 gap-3 max-w-md mx-auto p-4 rounded-2xl bg-white/5 border border-white/10 text-left">
        <div className="space-y-0.5">
          <span className="text-[10px] font-bold text-white/50 uppercase block">Match Code</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-black text-[#FFFF00]">{match.match_code}</span>
            <button
              onClick={copyMatchCode}
              className="text-white/50 hover:text-white transition-colors cursor-pointer"
              title="Copy code"
            >
              {copiedCode ? <Check className="h-3 w-3 text-[#00E676]" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        </div>
        <div className="space-y-0.5">
          <span className="text-[10px] font-bold text-white/50 uppercase block">Target Payout</span>
          <span className="text-base font-black font-display text-[#00E676]">
            ₹{match.card?.advertised_payout ? match.card.advertised_payout.toFixed(0) : '0'}
          </span>
        </div>
      </div>

      {/* Share Match Link Section */}
      <div className="max-w-md mx-auto p-4 rounded-2xl bg-[#08088F] border border-white/20 text-center space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
            <Share2 className="h-3.5 w-3.5 text-[#FFFF00]" />
            <span>Invite an Opponent</span>
          </span>
          <span className="text-[10px] text-[#00E676] font-bold">Direct Match Link</span>
        </div>
        <p className="text-[11px] text-white/70 text-left">
          Share your direct match link to challenge a friend or rival in WhatsApp/Telegram.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={copyMatchLink}
            className="rounded-xl bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs uppercase tracking-wider h-10 gap-1.5 cursor-pointer shadow-md"
          >
            {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
          </Button>

          <Button
            onClick={handleWhatsAppShare}
            className="rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-black text-xs uppercase tracking-wider h-10 gap-1.5 cursor-pointer shadow-md"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>WhatsApp</span>
          </Button>
        </div>
      </div>

      {/* Escrow Reassurance */}
      <div className="max-w-md mx-auto p-3 rounded-xl bg-[#00E676]/10 border border-[#00E676]/25 text-[11px] text-[#00E676] flex items-center gap-2 text-left">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span>Entry fee is protected in escrow. 100% instant refund if queue is cancelled.</span>
      </div>

      {cancelError && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-400 font-bold max-w-md mx-auto">
          {cancelError}
        </div>
      )}

      {/* Cancel Action */}
      <div className="pt-1">
        <Button
          onClick={handleCancel}
          disabled={isCancelling}
          variant="outline"
          className="rounded-full text-xs font-black uppercase tracking-wider border-white/20 text-white/80 hover:bg-red-500/15 hover:border-red-500/40 hover:text-red-400 h-11 px-7 gap-2 transition-all cursor-pointer"
        >
          {isCancelling ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-white" />
              <span>Refunding & Cancelling...</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4" />
              <span>Cancel Matchmaking (Instant Refund)</span>
            </>
          )}
        </Button>
      </div>

      {showShareModal && (
        <ShareMatchModal match={match} onClose={() => setShowShareModal(false)} />
      )}
    </Card>
  );
}
