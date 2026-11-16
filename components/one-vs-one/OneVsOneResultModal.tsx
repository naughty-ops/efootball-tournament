'use client';

import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, X, Loader2, AlertCircle, Clock, CheckCircle2, Upload, Image as ImageIcon, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitMatchResultAction } from '@/app/actions/oneVsOneActions';
import type { OneVsOneMatchDetail } from '@/types/oneVsOne';

interface OneVsOneResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: OneVsOneMatchDetail;
  currentUserId: string;
  onSubmitted: () => void;
}

export default function OneVsOneResultModal({
  isOpen,
  onClose,
  match,
  currentUserId,
  onSubmitted,
}: OneVsOneResultModalProps) {
  const [myScore, setMyScore] = useState<string>('');
  const [oppScore, setOppScore] = useState<string>('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const opponent = match.opponent;
  const isP1 = match.userPosition === 1;

  const parsedMyScore = parseInt(myScore, 10);
  const parsedOppScore = parseInt(oppScore, 10);
  const hasValidScores =
    !isNaN(parsedMyScore) &&
    parsedMyScore >= 0 &&
    !isNaN(parsedOppScore) &&
    parsedOppScore >= 0;

  // Auto-determine outcome preview
  let outcomePreview: { text: string; color: string } | null = null;
  if (hasValidScores) {
    if (parsedMyScore > parsedOppScore) {
      outcomePreview = { text: 'You will be recorded as Winner', color: 'text-[#00E676] bg-[#00E676]/10 border-[#00E676]/30' };
    } else if (parsedOppScore > parsedMyScore) {
      outcomePreview = {
        text: `${opponent?.profile?.display_name || 'Opponent'} will be recorded as Winner`,
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      };
    } else {
      outcomePreview = { text: 'Match will be recorded as a Draw', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' };
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Image size cannot exceed 10MB.');
      return;
    }

    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
    setErrorMsg(null);
  };

  const handleClearFile = () => {
    setScreenshotFile(null);
    if (screenshotPreview) {
      URL.revokeObjectURL(screenshotPreview);
      setScreenshotPreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasValidScores) {
      setErrorMsg('Please enter valid non-negative scores.');
      return;
    }

    if (!screenshotFile) {
      setErrorMsg('Final match screenshot proof is required from both players.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const p1Score = isP1 ? parsedMyScore : parsedOppScore;
    const p2Score = isP1 ? parsedOppScore : parsedMyScore;

    // Derive claimed winner automatically
    let claimedWinnerId = '';
    if (parsedMyScore > parsedOppScore) {
      claimedWinnerId = currentUserId;
    } else if (parsedOppScore > parsedMyScore) {
      claimedWinnerId = opponent?.user_id || '';
    }

    const formData = new FormData();
    formData.append('matchId', match.id);
    formData.append('p1Score', String(p1Score));
    formData.append('p2Score', String(p2Score));
    if (claimedWinnerId) {
      formData.append('claimedWinnerId', claimedWinnerId);
    }
    formData.append('screenshot', screenshotFile);

    const res = await submitMatchResultAction(formData);
    setIsSubmitting(false);

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to submit score.');
      return;
    }

    onSubmitted();
  };

  const content = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={isSubmitting ? undefined : onClose} />

      <div className="relative w-full max-w-lg bg-gradient-to-b from-[#0A0A70] to-[#070748] border border-blue-400/25 rounded-3xl shadow-2xl p-5 sm:p-7 z-10 text-white space-y-4 max-h-[92vh] overflow-y-auto no-scrollbar animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute right-4 top-4 p-1.5 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-[#FF168B]/15 border border-[#FF168B]/30 flex items-center justify-center text-[#FF168B] shadow-[0_0_15px_rgba(255,22,139,0.25)] shrink-0">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FF168B]/20 text-[#FF168B] border border-[#FF168B]/30">
                1v1 Result
              </span>
            </div>
            <h3 className="text-lg font-black font-display uppercase tracking-wider text-white">
              Submit Match Score & Screenshot
            </h3>
            <p className="text-xs text-white/60">
              Match Code: <span className="font-mono text-[#FFFF00] font-bold">{match.match_code}</span>
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-400 font-bold">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Head to Head Score Comparison - Exact Tournament Style */}
          <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-[#07073B] border border-blue-400/20">
            {/* You */}
            <div className="space-y-2 text-center">
              <span className="text-[10px] font-bold text-[#00E676] uppercase tracking-wider block">
                You ({isP1 ? 'Player 1' : 'Player 2'})
              </span>
              <span className="text-xs font-black text-white block truncate">
                {match.players.find((p) => p.user_id === currentUserId)?.profile?.display_name || 'You'}
              </span>
              <Input
                type="number"
                min="0"
                max="99"
                value={myScore}
                onChange={(e) => setMyScore(e.target.value)}
                placeholder="0"
                className="bg-blue-950/50 border-blue-400/30 text-center text-3xl font-black font-display text-[#FFFF00] rounded-xl h-14 focus:border-[#FFFF00] focus:ring-1 focus:ring-[#FFFF00]"
                required
                disabled={isSubmitting}
                autoFocus
              />
            </div>

            {/* Opponent */}
            <div className="space-y-2 text-center">
              <span className="text-[10px] font-bold text-[#FF168B] uppercase tracking-wider block">
                Opponent ({isP1 ? 'Player 2' : 'Player 1'})
              </span>
              <span className="text-xs font-black text-white block truncate">
                {opponent?.profile?.display_name || 'Opponent'}
              </span>
              <Input
                type="number"
                min="0"
                max="99"
                value={oppScore}
                onChange={(e) => setOppScore(e.target.value)}
                placeholder="0"
                className="bg-blue-950/50 border-blue-400/30 text-center text-3xl font-black font-display text-white rounded-xl h-14 focus:border-[#FFFF00] focus:ring-1 focus:ring-[#FFFF00]"
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Outcome Preview Badge */}
          {outcomePreview && (
            <div
              className={`p-2.5 rounded-xl border text-xs font-bold text-center flex items-center justify-center gap-1.5 ${outcomePreview.color}`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>{outcomePreview.text}</span>
            </div>
          )}

          {/* Mandatory Screenshot Proof Upload */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase text-white/90 flex items-center gap-1.5">
                <ImageIcon className="h-4 w-4 text-[#FFFF00]" />
                <span>Final Match Screenshot</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF168B]/20 text-[#FF168B] border border-[#FF168B]/40 font-black">
                  Required
                </span>
              </label>
              <span className="text-[11px] text-white/50">PNG, JPG or WEBP (Max 10MB)</span>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />

            {!screenshotPreview ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-blue-400/30 hover:border-[#FFFF00]/60 rounded-2xl p-5 text-center cursor-pointer bg-white/5 hover:bg-white/10 transition-all flex flex-col items-center justify-center gap-2 group"
              >
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 group-hover:bg-[#FFFF00]/10 border border-blue-400/30 group-hover:border-[#FFFF00]/40 flex items-center justify-center text-blue-300 group-hover:text-[#FFFF00] transition-colors">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white group-hover:text-[#FFFF00] transition-colors">
                    Click to upload your end-match screenshot
                  </p>
                  <p className="text-[11px] text-white/50 mt-0.5">
                    Clear image of the final whistle score & match summary
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden border border-blue-400/30 bg-[#07073B] p-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshotPreview}
                    alt="Proof Preview"
                    className="h-14 w-20 object-cover rounded-xl border border-white/20 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{screenshotFile?.name}</p>
                    <p className="text-[10px] text-[#00E676] font-semibold flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="h-3 w-3" /> Ready to submit
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearFile}
                  disabled={isSubmitting}
                  className="p-2 rounded-xl text-white/60 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                  title="Remove screenshot"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Verification Rules */}
          <div className="p-3.5 rounded-2xl bg-blue-950/40 border border-blue-400/25 text-blue-200 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-[#FFFF00]">
              <Clock className="w-4 h-4 shrink-0 text-[#FFFF00]" />
              <span>Score Verification & Screenshot Policy:</span>
            </div>
            <ul className="list-disc pl-4 space-y-1 text-[11px] text-blue-200/90 leading-relaxed">
              <li>
                <strong className="text-white">Both players are required to submit screenshot proof</strong> of the final match score screen.
              </li>
              <li>Your opponent must also upload their screenshot when confirming this result.</li>
              <li>Once both screenshots and scores align, the match completes and wallet payout settles instantly.</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-full text-xs font-black uppercase tracking-wider text-white/70 hover:text-white hover:bg-white/10 h-10 px-4"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !hasValidScores || !screenshotFile}
              className="rounded-full text-xs font-black uppercase tracking-wider bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] h-10 px-6 shadow-lg shadow-[#FFFF00]/25 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-4 w-4 animate-spin text-[#08088F]" /> Submitting...
                </span>
              ) : (
                'Confirm & Submit Result'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
}
