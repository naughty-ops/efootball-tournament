'use client';

import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X, Upload, Loader2, AlertCircle, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { disputeMatchResultAction } from '@/app/actions/oneVsOneActions';

interface OneVsOneDisputeModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  onDisputed: () => void;
}

export default function OneVsOneDisputeModal({
  isOpen,
  onClose,
  matchId,
  onDisputed,
}: OneVsOneDisputeModalProps) {
  const [reason, setReason] = useState('Wrong Score Marked by Opponent');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setErrorMsg('Please describe the correct score or issue.');
      return;
    }

    if (reason === 'Wrong Score Marked by Opponent' && !file) {
      setErrorMsg('Please attach your end-match screenshot proof so admins can verify the real score.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('matchId', matchId);
    formData.append('reason', reason);
    formData.append('description', description.trim());
    if (file) {
      formData.append('evidence', file);
    }

    const res = await disputeMatchResultAction(formData);
    setIsSubmitting(false);

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to file dispute.');
      return;
    }

    onDisputed();
  };

  const content = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={isSubmitting ? undefined : onClose} />

      <div className="relative w-full max-w-lg bg-gradient-to-b from-[#0A0A70] to-[#070748] border border-blue-400/25 rounded-3xl shadow-2xl p-6 sm:p-7 z-10 text-white space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-[#FF168B]/15 border border-[#FF168B]/30 flex items-center justify-center text-[#FF168B] shadow-[0_0_15px_rgba(255,22,139,0.25)] shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FF168B]/20 text-[#FF168B] border border-[#FF168B]/30 inline-block mb-1">
                Dispute Review Desk
              </span>
              <h3 className="text-lg font-black font-display uppercase tracking-wider text-white">
                Report Wrong Marking
              </h3>
              <p className="text-xs text-blue-200/70 mt-0.5">
                Admin review desk • Screenshot evidence submission
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Why is proof required banner - matching tournament style */}
        <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-300" />
            <span>Screenshot Proof Required for Wrong Marking:</span>
          </div>
          <p className="text-[11px] text-amber-200/90 leading-relaxed">
            Since you are reporting an incorrect score marking, platform administrators require your end-match screenshot to verify the real score and award the victory.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase text-blue-200/80 block">Dispute Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-[#07073B] border border-blue-400/25 text-white rounded-xl px-3.5 py-2.5 text-xs font-bold focus:border-[#FFFF00] focus:ring-1 focus:ring-[#FFFF00]"
            >
              <option value="Wrong Score Marked by Opponent">Wrong Score Marked by Opponent</option>
              <option value="Opponent Disconnected / Forfeit">Opponent Disconnected / Forfeit</option>
              <option value="Opponent No-Show / Inactive">Opponent No-Show / Inactive</option>
              <option value="Fair-Play Rule Violation">Fair-Play Rule Violation</option>
              <option value="Other Issue">Other Issue</option>
            </select>
          </div>

          {/* Evidence Upload */}
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase text-blue-200/80 block">
              End-Match Result Screenshot Proof <span className="text-[#FF168B]">*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-colors ${
                file
                  ? 'border-[#00E676]/60 bg-[#00E676]/10'
                  : 'border-blue-400/30 hover:border-[#FF168B]/50 bg-blue-950/40'
              }`}
            >
              <Upload className={`h-5 w-5 mx-auto mb-1 ${file ? 'text-[#00E676]' : 'text-blue-300/60'}`} />
              <span className="text-xs font-bold text-white block">
                {file ? file.name : 'Click to select screenshot proof'}
              </span>
              <span className="text-[10px] text-blue-200/60 block mt-0.5">
                JPEG, PNG or WebP (Max 5MB)
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase text-blue-200/80 block">
              Explanation & Real Score <span className="text-[#FF168B]">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="State the actual final score (e.g. 'Actual score was 3 - 1 in my favor') and details..."
              className="w-full bg-[#07073B] border border-blue-400/25 text-white rounded-xl p-3 text-xs leading-relaxed focus:border-[#FFFF00] focus:ring-1 focus:ring-[#FFFF00] resize-none"
            />
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-400 font-bold">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

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
              disabled={isSubmitting || !description.trim()}
              className="rounded-full text-xs font-black uppercase tracking-wider bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] h-10 px-6 shadow-lg shadow-[#FFFF00]/25 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-4 w-4 animate-spin text-[#08088F]" /> Submitting...
                </span>
              ) : (
                'Submit Dispute & Proof'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
}
