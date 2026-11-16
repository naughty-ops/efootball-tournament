'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, X, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { saveEligibilityAcknowledgementAction } from '@/app/actions/oneVsOneActions';

interface OneVsOneEligibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}

export default function OneVsOneEligibilityModal({
  isOpen,
  onClose,
  onConfirmed,
}: OneVsOneEligibilityModalProps) {
  const [ageChecked, setAgeChecked] = useState(false);
  const [rulesChecked, setRulesChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!ageChecked || !rulesChecked) {
      setErrorMsg('Please confirm both acknowledgements to proceed.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await saveEligibilityAcknowledgementAction('v1.0', 'IN');
    setIsSubmitting(false);

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to record acknowledgement.');
      return;
    }

    onConfirmed();
  };

  const content = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={isSubmitting ? undefined : onClose} />

      <div className="relative w-full max-w-lg bg-gradient-to-b from-[#0A0A70] to-[#070748] border border-blue-400/25 rounded-3xl shadow-2xl p-6 sm:p-7 z-10 text-white space-y-6 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-[#FF168B]/15 border border-[#FF168B]/30 flex items-center justify-center text-[#FF168B] shadow-[0_0_15px_rgba(255,22,139,0.25)] shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FF168B]/20 text-[#FF168B] border border-[#FF168B]/30 inline-block mb-1">
                Competitive Clearance
              </span>
              <h3 className="text-lg font-black font-display uppercase tracking-wider text-white">
                Confirm Age & Eligibility
              </h3>
              <p className="text-xs text-blue-200/70 mt-0.5">
                Official 1 VS 1 Competitive Arena Participation
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

        {/* Notice Box */}
        <div className="p-4 rounded-2xl bg-[#07073B] border border-blue-400/20 text-xs text-blue-100/80 space-y-2">
          <p className="font-medium text-white/90 leading-relaxed">
            Matches in the 1 VS 1 Arena involve competitive eFootball gameplay and fair-play standards.
            You must satisfy the applicable legal minimum age requirements in your jurisdiction to participate.
          </p>
          <p className="text-[11px] text-[#00E676] font-bold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00E676]" />
            Entry fees and prize settlement are tracked atomically via your secure wallet ledger.
          </p>
        </div>

        {/* Checkboxes */}
        <div className="space-y-3.5">
          <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-blue-950/40 border border-blue-400/20 hover:border-blue-400/40 transition-colors cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ageChecked}
              onChange={(e) => setAgeChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-blue-400/40 text-[#00E676] focus:ring-[#00E676] accent-[#00E676] cursor-pointer"
            />
            <span className="text-xs font-bold text-white/95 leading-tight">
              I confirm that I meet the applicable minimum legal age and jurisdiction requirements.
            </span>
          </label>

          <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-blue-950/40 border border-blue-400/20 hover:border-blue-400/40 transition-colors cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rulesChecked}
              onChange={(e) => setRulesChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-blue-400/40 text-[#00E676] focus:ring-[#00E676] accent-[#00E676] cursor-pointer"
            />
            <span className="text-xs font-bold text-white/95 leading-tight">
              I agree to abide by the fair-play match rules, room guidelines, and platform policies.
            </span>
          </label>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-400 font-bold">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Footer Actions */}
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
            type="button"
            onClick={handleConfirm}
            disabled={!ageChecked || !rulesChecked || isSubmitting}
            className="rounded-full text-xs font-black uppercase tracking-wider bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] h-10 px-6 shadow-lg shadow-[#FFFF00]/25 disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2 text-[#08088F]" />
                <span>Recording...</span>
              </>
            ) : (
              <span>Confirm & Enter Arena</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
}
