'use client';

import React, { useState } from 'react';
import { MessageCircle, AlertCircle, ShieldAlert, CheckCircle2, ExternalLink, X, Swords } from 'lucide-react';
import type { PlayerMatchItem } from '@/services/playerDashboardService';
import { buildWhatsAppMatchUrl } from '@/lib/utils/whatsapp';

interface OpponentWhatsAppButtonProps {
  match: PlayerMatchItem;
  yourName: string;
  className?: string;
  showIcon?: boolean;
}

export default function OpponentWhatsAppButton({
  match,
  yourName,
  className = '',
  showIcon = true,
}: OpponentWhatsAppButtonProps) {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: 'missing' | 'unverified';
  }>({
    isOpen: false,
    type: 'missing',
  });

  const opponentName = match.opponentDisplayName || match.opponentUsername || 'Opponent';
  const matchIdentifier = match.matchPosition
    ? `Match #${match.matchPosition}`
    : match.liveRoomName
    ? `Match #${match.liveRoomName}`
    : `Match #${match.id.substring(0, 8).toUpperCase()}`;

  const hasWhatsappNumber = Boolean(match.opponentWhatsappNumber && match.opponentWhatsappNumber.trim().length > 0);
  const isWhatsappVerified = Boolean(match.opponentWhatsappVerified);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 1. Missing WhatsApp number
    if (!hasWhatsappNumber) {
      setModalState({ isOpen: true, type: 'missing' });
      return;
    }

    // 2. WhatsApp number present but unverified
    if (!isWhatsappVerified) {
      setModalState({ isOpen: true, type: 'unverified' });
      return;
    }

    // 3. Valid and verified WhatsApp number: open WhatsApp with prefilled message
    const url = buildWhatsAppMatchUrl(match.opponentWhatsappNumber!, {
      opponentName,
      yourName,
      tournamentName: match.tournamentName,
      matchIdentifier,
      scheduledTime: match.scheduledTime,
    });

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const closeModal = () => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={
          isWhatsappVerified
            ? `Click to chat with ${opponentName} on WhatsApp`
            : `Click to view contact information for ${opponentName}`
        }
        className={`group inline-flex items-center justify-end gap-1.5 max-w-full text-right transition-all duration-150 rounded-lg py-1 px-1.5 -mr-1.5 hover:bg-white/10 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] cursor-pointer ${className}`}
      >
        <div className="min-w-0 flex flex-col items-end">
          <div className="flex items-center gap-1.5 max-w-full">
            <span className="text-sm font-bold text-white group-hover:text-[#25D366] group-hover:underline underline-offset-2 truncate transition-colors duration-150">
              {opponentName}
            </span>
            {showIcon && (
              <span
                className={`inline-flex items-center justify-center h-4 w-4 rounded-full transition-transform duration-150 group-hover:scale-110 shrink-0 ${
                  isWhatsappVerified
                    ? 'bg-[#25D366]/20 text-[#25D366]'
                    : hasWhatsappNumber
                    ? 'bg-[#FFB800]/20 text-[#FFB800]'
                    : 'bg-white/10 text-white/50 group-hover:text-[#25D366]'
                }`}
                aria-hidden="true"
              >
                <MessageCircle className="h-2.5 w-2.5 fill-current" />
              </span>
            )}
          </div>
          <span className="text-[10px] text-[#D9DCFF]/60 group-hover:text-[#25D366]/90 transition-colors">
            {isWhatsappVerified ? 'Chat on WhatsApp' : 'WhatsApp info'}
          </span>
        </div>
      </button>

      {/* Friendly Accessible Contact Feedback Modal */}
      {modalState.isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[#060818]/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={closeModal}
          />

          {/* Modal Container */}
          <div className="relative w-full max-w-md bg-[#0F1426] border border-white/20 rounded-3xl p-6 sm:p-7 shadow-2xl z-10 space-y-5 animate-in zoom-in-95 duration-200 text-white">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${
                    modalState.type === 'missing'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-blue-500/20 text-blue-400'
                  }`}
                >
                  {modalState.type === 'missing' ? (
                    <AlertCircle className="h-6 w-6" />
                  ) : (
                    <ShieldAlert className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <h3 id="contact-modal-title" className="text-base font-black text-white font-display">
                    {modalState.type === 'missing'
                      ? 'WhatsApp Contact Unavailable'
                      : 'WhatsApp Number Unverified'}
                  </h3>
                  <p className="text-xs text-[#D9DCFF]/70">Match opponent communication</p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Explanation Message */}
            <div className="text-xs text-[#D9DCFF]/90 space-y-2 leading-relaxed">
              {modalState.type === 'missing' ? (
                <p>
                  <strong className="text-white font-bold">{opponentName}</strong> has not added a
                  WhatsApp contact number to their registered profile yet.
                </p>
              ) : (
                <p>
                  <strong className="text-white font-bold">{opponentName}</strong> has listed a WhatsApp
                  number, but it is currently pending admin verification. To protect player safety and
                  prevent spam, direct WhatsApp links are only available once verified.
                </p>
              )}
              <p>
                Please coordinate your match schedule inside the official tournament room or alert the
                tournament tournament admins.
              </p>
            </div>

            {/* Match Context Details Box */}
            <div className="p-3.5 rounded-2xl bg-[#182038] border border-white/10 text-xs space-y-2 text-white/80">
              <div className="flex items-center justify-between">
                <span className="text-[#D9DCFF]/60 font-medium">Tournament:</span>
                <span className="font-bold text-white truncate max-w-[200px]">
                  {match.tournamentName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#D9DCFF]/60 font-medium">Match:</span>
                <span className="font-bold text-[#FFFF00]">{matchIdentifier}</span>
              </div>
              {match.liveRoomName && (
                <div className="flex items-center justify-between">
                  <span className="text-[#D9DCFF]/60 font-medium">Assigned Live Room:</span>
                  <span className="font-mono font-bold text-[#25D366]">{match.liveRoomName}</span>
                </div>
              )}
              {match.scheduledTime && (
                <div className="flex items-center justify-between">
                  <span className="text-[#D9DCFF]/60 font-medium">Scheduled Time:</span>
                  <span className="font-bold text-white">
                    {new Date(match.scheduledTime).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </span>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
