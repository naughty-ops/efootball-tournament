'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Copy,
  Check,
  Share2,
  Swords,
  Trophy,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OneVsOneMatchDetail } from '@/types/oneVsOne';

interface ShareMatchModalProps {
  match: OneVsOneMatchDetail;
  onClose: () => void;
}

export default function ShareMatchModal({ match, onClose }: ShareMatchModalProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [hasNativeShare, setHasNativeShare] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/dashboard/matches?mode=1v1&joinMatch=${encodeURIComponent(match.match_code)}`;
      setShareUrl(url);
      setHasNativeShare(typeof navigator !== 'undefined' && !!navigator.share);
    }
  }, [match.match_code]);

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(match.match_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleWhatsAppShare = () => {
    const tierName = match.card?.name || '1v1 Challenge';
    const entry = match.card?.entry_amount || 0;
    const payout = match.card?.advertised_payout || 0;
    const text = `⚽ *eFootball 1 VS 1 Challenge!*\nI challenged you to a head-to-head match on eFootball Tournament Platform!\n\n🏆 *Tier:* ${tierName}\n💰 *Entry Fee:* ₹${entry} • *Winner Takes:* ₹${payout}\n🔑 *Match Code:* ${match.match_code}\n\n👉 *Click to join the match now:*\n${shareUrl}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleTelegramShare = () => {
    const text = `⚽ eFootball 1v1 Challenge! Match Code: ${match.match_code}. Join: ${shareUrl}`;
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`;
    window.open(tgUrl, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `eFootball 1v1 Challenge - ${match.match_code}`,
          text: `Accept my 1v1 eFootball challenge! Winner takes ₹${match.card?.advertised_payout || 0}.`,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or share aborted
      }
    }
  };

  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-[28px] bg-[#1010C5] border border-white/20 p-6 sm:p-7 text-white shadow-2xl shadow-black/80 relative space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white/80 hover:text-white transition-all cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-[#FFFF00] text-[#08088F] flex items-center justify-center shadow-lg shadow-yellow-500/20 shrink-0">
            <Share2 className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#FFFF00] block">
              1 VS 1 Arena Duel
            </span>
            <h3 className="text-xl sm:text-2xl font-black font-display uppercase tracking-wider text-white">
              Share Match Link
            </h3>
          </div>
        </div>

        {/* Match Card Overview */}
        <div className="grid grid-cols-3 gap-2.5 p-3.5 rounded-2xl bg-[#08088F] border border-white/15 text-center">
          <div>
            <span className="text-[10px] uppercase font-bold text-white/60 block">Tier</span>
            <span className="text-xs sm:text-sm font-black text-[#FF168B] truncate block">
              {match.card?.name || '1v1'}
            </span>
          </div>
          <div className="border-x border-white/10">
            <span className="text-[10px] uppercase font-bold text-white/60 block">Entry Fee</span>
            <span className="text-xs sm:text-sm font-black text-white block">
              ₹{match.card?.entry_amount || 0}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-white/60 block">Prize Payout</span>
            <span className="text-xs sm:text-sm font-black text-[#00E676] block">
              ₹{match.card?.advertised_payout || 0}
            </span>
          </div>
        </div>

        {/* Direct Link Input & Copy */}
        <div className="space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-white/80 flex items-center justify-between">
            <span>Direct Match Link</span>
            <span className="text-[11px] text-[#00E676] font-bold">Anyone with link can join</span>
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-[#05054A] border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white/90 font-mono truncate select-all">
              {shareUrl || 'Generating link...'}
            </div>
            <Button
              onClick={handleCopyLink}
              className="rounded-xl bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs uppercase tracking-wider h-10 px-4 shrink-0 transition-all cursor-pointer shadow-md"
            >
              {copiedLink ? (
                <>
                  <Check className="h-4 w-4 text-[#08088F]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>Copy</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Match Code Box */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10">
          <div>
            <span className="text-[10px] uppercase font-bold text-white/50 block">Match Code</span>
            <span className="text-base font-mono font-black text-[#FFFF00] tracking-wider">
              {match.match_code}
            </span>
          </div>
          <Button
            onClick={handleCopyCode}
            variant="outline"
            size="sm"
            className="rounded-xl border-white/20 text-white hover:bg-white/10 text-xs font-bold gap-1.5 h-8 px-3"
          >
            {copiedCode ? <Check className="h-3.5 w-3.5 text-[#00E676]" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
          </Button>
        </div>

        {/* Share Buttons (WhatsApp & Telegram & Native) */}
        <div className="space-y-2">
          <span className="text-xs font-black uppercase tracking-wider text-white/70 block">
            Instant Social Share
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* WhatsApp */}
            <button
              onClick={handleWhatsAppShare}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-green-600/30 transition-all cursor-pointer"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Share to WhatsApp</span>
            </button>

            {/* Telegram or Native */}
            {hasNativeShare ? (
              <button
                onClick={handleNativeShare}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#1E1EF5] hover:bg-[#2A2AFF] text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
              >
                <Share2 className="h-4 w-4 text-[#FFFF00]" />
                <span>More Share Options</span>
              </button>
            ) : (
              <button
                onClick={handleTelegramShare}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#0088cc] hover:bg-[#0077b5] text-white font-black text-xs uppercase tracking-wider shadow-lg transition-all cursor-pointer"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Share to Telegram</span>
              </button>
            )}
          </div>
        </div>

        {/* Security Reassurance */}
        <div className="p-3 rounded-xl bg-[#00E676]/10 border border-[#00E676]/30 text-[11px] text-[#00E676] flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>Both players&apos; entry fees are safely locked in escrow until the match concludes.</span>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
}
