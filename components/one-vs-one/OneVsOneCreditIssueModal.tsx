'use client';

import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X, Upload, Loader2, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reportOneVsOneCreditIssueAction } from '@/app/actions/oneVsOneActions';
import type { OneVsOneMatchDetail } from '@/types/oneVsOne';

interface OneVsOneCreditIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: OneVsOneMatchDetail;
  currentUserId: string;
  onSubmitted?: (ticketNumber: string) => void;
}

export default function OneVsOneCreditIssueModal({
  isOpen,
  onClose,
  match,
  currentUserId,
  onSubmitted,
}: OneVsOneCreditIssueModalProps) {
  const [issueCategory, setIssueCategory] = useState<string>('missing_wallet_credit');
  const [description, setDescription] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdTicketNumber, setCreatedTicketNumber] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const expectedPayout = match.card?.advertised_payout ?? 0;
  const settlementRef = match.settlement?.settlement_ref || 'Pending Settlement';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || description.trim().length < 10) {
      setErrorMsg('Please describe your credit issue in detail (minimum 10 characters).');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('matchId', match.id);
    formData.append('expectedPayout', String(expectedPayout));
    if (match.settlement?.settlement_ref) {
      formData.append('settlementRef', match.settlement.settlement_ref);
    }
    formData.append('issueCategory', issueCategory);
    formData.append('description', description.trim());
    if (file) {
      formData.append('evidence', file);
    }

    const res = await reportOneVsOneCreditIssueAction(formData);
    setIsSubmitting(false);

    if (!res.success || !res.data) {
      setErrorMsg(res.error || 'Failed to submit credit ticket.');
      return;
    }

    setCreatedTicketNumber(res.data.ticketNumber);
    if (onSubmitted) {
      onSubmitted(res.data.ticketNumber);
    }
  };

  const content = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={isSubmitting ? undefined : onClose} />

      <div className="relative w-full max-w-lg bg-gradient-to-b from-[#0A0A70] to-[#070748] border border-blue-400/25 rounded-3xl shadow-2xl p-6 sm:p-7 z-10 text-white space-y-5 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute right-4 top-4 p-1.5 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)] shrink-0">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FF168B]/20 text-[#FF168B] border border-[#FF168B]/30 inline-block mb-1">
              Wallet Support Desk
            </span>
            <h3 className="text-lg font-black font-display uppercase tracking-wider text-white">
              Report Wallet Credit Issue
            </h3>
            <p className="text-xs text-blue-200/70">
              Match Code: <span className="font-mono text-[#FFFF00] font-bold">{match.match_code}</span>
            </p>
          </div>
        </div>

        {createdTicketNumber ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-[#00E676]/15 border border-[#00E676]/30 flex items-center justify-center mx-auto text-[#00E676] shadow-[0_0_20px_rgba(0,230,118,0.3)]">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-base font-black uppercase text-white font-display">
                Credit Recovery Ticket Logged
              </h4>
              <p className="text-xs text-blue-200/80 mt-1">
                Ticket Reference:{' '}
                <span className="font-mono font-bold text-[#00E676] bg-[#00E676]/10 px-2.5 py-1 rounded border border-[#00E676]/20">
                  {createdTicketNumber}
                </span>
              </p>
            </div>
            <p className="text-xs text-blue-200/70 max-w-xs mx-auto leading-relaxed">
              Our financial administration desk has been alerted. You can review updates and responses directly inside your Support Tickets dashboard.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <Button
                onClick={onClose}
                className="rounded-full text-xs font-black uppercase tracking-wider bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] h-10 px-6 cursor-pointer shadow-lg shadow-[#FFFF00]/25"
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Auto-populated Match & Settlement Metadata */}
            <div className="p-3.5 rounded-2xl bg-[#07073B] border border-blue-400/20 space-y-2 text-xs">
              <span className="text-[10px] font-bold text-blue-200/70 uppercase tracking-wider block">
                Match & Settlement Summary (Authoritative)
              </span>
              <div className="grid grid-cols-2 gap-2 text-blue-100/90">
                <div>
                  <span className="text-[10px] text-blue-300/60 block">Match Code</span>
                  <span className="font-mono font-bold text-[#FFFF00]">{match.match_code}</span>
                </div>
                <div>
                  <span className="text-[10px] text-blue-300/60 block">Expected Payout</span>
                  <span className="font-mono font-bold text-[#00E676]">₹{expectedPayout}</span>
                </div>
                <div>
                  <span className="text-[10px] text-blue-300/60 block">Settlement Ref</span>
                  <span className="font-mono text-blue-200/80 truncate block">{settlementRef}</span>
                </div>
                <div>
                  <span className="text-[10px] text-blue-300/60 block">Settlement Status</span>
                  <span className="font-bold uppercase text-[#FFFF00]">
                    {match.settlement?.status || 'Unsettled'}
                  </span>
                </div>
              </div>
            </div>

            {/* Issue Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-blue-200/80 block">
                Issue Category <span className="text-[#FF168B]">*</span>
              </label>
              <select
                value={issueCategory}
                onChange={(e) => setIssueCategory(e.target.value)}
                className="w-full bg-[#07073B] border border-blue-400/25 text-white rounded-xl px-3.5 py-2.5 text-xs font-bold focus:border-[#FFFF00] focus:ring-1 focus:ring-[#FFFF00]"
              >
                <option value="missing_wallet_credit">Missing Wallet Credit (Not Credited)</option>
                <option value="incorrect_credit_amount">Incorrect Credit Amount</option>
                <option value="settlement_delay">Settlement Processing Delayed</option>
                <option value="other_credit_issue">Other Financial / Credit Inquiry</option>
              </select>
            </div>

            {/* Detailed Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-blue-200/80 block">
                Description of the Issue <span className="text-[#FF168B]">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain what happened (e.g. 'I won the match and score was confirmed, but payout has not appeared in my balance...')"
                className="w-full bg-[#07073B] border border-blue-400/25 text-white rounded-xl p-3 text-xs leading-relaxed focus:border-[#FFFF00] focus:ring-1 focus:ring-[#FFFF00] resize-none"
              />
            </div>

            {/* Evidence Screenshot (Optional) */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-blue-200/80 block">
                Supporting Screenshot Evidence (Optional)
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
                className={`border-2 border-dashed rounded-2xl p-3.5 text-center cursor-pointer transition-colors ${
                  file
                    ? 'border-[#00E676]/60 bg-[#00E676]/10'
                    : 'border-blue-400/25 hover:border-[#FFFF00]/50 bg-blue-950/40'
                }`}
              >
                <Upload className={`h-4 w-4 mx-auto mb-1 ${file ? 'text-[#00E676]' : 'text-blue-300/60'}`} />
                <span className="text-xs font-bold text-white block">
                  {file ? file.name : 'Click to attach screenshot'}
                </span>
                <span className="text-[10px] text-blue-200/60 block mt-0.5">JPG, PNG or WEBP (Max 5MB)</span>
              </div>
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
                  'Submit Credit Ticket'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
}
