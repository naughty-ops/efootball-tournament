'use client';

import React, { useState } from 'react';
import { X, ShieldAlert, AlertTriangle, CheckCircle2, Lock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BracketValidationResult } from '@/types/database';

interface SafetyValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmPublish: () => void;
  validationResult: BracketValidationResult | null;
  isPublishing: boolean;
}

export function SafetyValidationModal({
  isOpen,
  onClose,
  onConfirmPublish,
  validationResult,
  isPublishing,
}: SafetyValidationModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (!isOpen || !validationResult) return null;

  const { isValid, errors, warnings, impactedCompletedMatches } = validationResult;
  const hasImpactedMatches = impactedCompletedMatches.length > 0;
  const canPublish = isValid && (!hasImpactedMatches || acknowledged);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />

      {/* Modal Content */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 z-10 space-y-5 max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${
                isValid
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#0B3323]">Pre-Publish Safety Check</h3>
              <p className="text-xs text-slate-500 font-semibold">Verify bracket integrity before pushing live</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-[#0B3323] p-1.5 rounded-xl">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Blocking Errors */}
        {errors.length > 0 && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-2">
            <div className="flex items-center gap-2 text-rose-800 text-xs font-black uppercase tracking-wider">
              <ShieldAlert className="h-4 w-4" />
              <span>Blocking Safety Violations ({errors.length})</span>
            </div>
            <ul className="text-xs text-rose-700 space-y-1 font-semibold list-disc list-inside">
              {errors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 text-xs font-black uppercase tracking-wider">
              <AlertTriangle className="h-4 w-4" />
              <span>Warnings ({warnings.length})</span>
            </div>
            <ul className="text-xs text-amber-700 space-y-1 font-semibold list-disc list-inside">
              {warnings.map((warn, idx) => (
                <li key={idx}>{warn}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Impacted Completed Matches Warning */}
        {hasImpactedMatches && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
            <div className="flex items-center gap-2 text-amber-900 text-xs font-black uppercase tracking-wider">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span>⚠️ Impact on Completed Matches ({impactedCompletedMatches.length})</span>
            </div>
            <p className="text-xs text-slate-700 font-medium">
              Publishing this draft will modify match parameters for the following completed fixture(s):
            </p>
            <ul className="text-xs text-amber-900 font-bold space-y-1 list-disc list-inside bg-white/80 p-2.5 rounded-xl border border-amber-200">
              {impactedCompletedMatches.map((mText, idx) => (
                <li key={idx}>{mText}</li>
              ))}
            </ul>

            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs font-extrabold text-[#0B3323]">
                I confirm and acknowledge modifying these completed matches.
              </span>
            </label>
          </div>
        )}

        {/* Success State summary */}
        {isValid && !hasImpactedMatches && warnings.length === 0 && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
            <h4 className="text-sm font-black text-emerald-950">All Safety Checks Passed!</h4>
            <p className="text-xs text-emerald-800">
              Your draft bracket is structurally valid. Ready to publish to live tournament.
            </p>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="outline" onClick={onClose} className="rounded-xl text-xs font-bold">
            Cancel
          </Button>
          <Button
            disabled={!canPublish || isPublishing}
            onClick={onConfirmPublish}
            className="rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          >
            {isPublishing ? (
              <span>Publishing...</span>
            ) : (
              <>
                <Lock className="h-3.5 w-3.5" />
                <span>Confirm & Publish Live</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
