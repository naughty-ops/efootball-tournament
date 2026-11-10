'use client';

import React, { useState } from 'react';
import { AlertCircle, X, ShieldAlert, CheckCircle2, Loader2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MediaUploadZone from '@/components/media/MediaUploadZone';
import { submitMatchDisputeAction } from '@/app/actions/matchSchedulingActions';

interface ReportMatchIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  tournamentId: string;
  reporterParticipantId: string;
  opponentParticipantId?: string | null;
  opponentName: string;
  allowScreenshot?: boolean;
  onSuccess?: () => void;
}

const ISSUE_REASONS = [
  { value: 'opponent_no_show', label: 'Opponent did not show up / uncontactable' },
  { value: 'connection_failure', label: 'Connection failure / Network disconnect' },
  { value: 'refusing_to_play', label: 'Opponent refusing to play / toxic behavior' },
  { value: 'match_not_completed', label: 'Match interrupted before completion' },
  { value: 'incorrect_walkover', label: 'Dispute over false walkover claim' },
  { value: 'other', label: 'Other match issue' },
] as const;

export default function ReportMatchIssueModal({
  isOpen,
  onClose,
  matchId,
  tournamentId,
  reporterParticipantId,
  opponentParticipantId,
  opponentName,
  allowScreenshot = false,
  onSuccess,
}: ReportMatchIssueModalProps) {
  const [reason, setReason] = useState<string>('opponent_no_show');
  const [details, setDetails] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await submitMatchDisputeAction({
      matchId,
      tournamentId,
      reporterParticipantId,
      opponentParticipantId: opponentParticipantId || null,
      reason: reason as any,
      details: details.trim() || undefined,
      evidenceUrl: evidenceUrl.trim() || undefined,
    });

    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to submit match report');
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      onSuccess?.();
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-[#0B0E17] border border-slate-800 p-6 shadow-2xl">
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute right-4 top-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Report Match Issue</h3>
            <p className="text-xs text-slate-400">Vs {opponentName}</p>
          </div>
        </div>

        {success ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="font-semibold text-white">Ticket Submitted</h4>
            <p className="text-xs text-slate-400">
              Our admin review desk has received your report and the match has been flagged for investigation.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Issue Category
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl bg-slate-900 border border-slate-700/80 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {ISSUE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Explanation & Details
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Describe what occurred with as much detail as possible..."
                rows={3}
                disabled={loading}
                className="w-full rounded-xl bg-slate-900 border border-slate-700/80 p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Screenshot proof is strictly required/allowed only after match has started or when explicitly permitted */}
            {allowScreenshot && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Screenshot / Proof Evidence (Required for Disputes)
                </label>
                <MediaUploadZone
                  category="dispute_evidence"
                  entityId={matchId}
                  initialUrl={evidenceUrl}
                  onUploadSuccess={(url) => setEvidenceUrl(url)}
                  onRemove={() => setEvidenceUrl('')}
                  label="Upload screenshot proof"
                  helperText="Upload JPEG, PNG, or WebP screenshot (max 2MB). Uploaded screenshots are stored securely in Cloudinary."
                  aspectRatio="banner"
                />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={loading}
                className="flex-1 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold"
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                  </span>
                ) : (
                  'File Dispute'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
