'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  FileImage,
  UploadCloud,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import MediaUploadZone from '@/components/media/MediaUploadZone';
import { submitMatchScreenshotProofAction } from '@/app/actions/matchSchedulingActions';

interface UploadMatchEvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  tournamentId: string;
  participantId: string;
  existingScreenshotUrl?: string | null;
  onSuccess: () => void;
}

export default function UploadMatchEvidenceModal({
  isOpen,
  onClose,
  matchId,
  tournamentId,
  participantId,
  existingScreenshotUrl,
  onSuccess,
}: UploadMatchEvidenceModalProps) {
  const [screenshotUrl, setScreenshotUrl] = useState<string>(existingScreenshotUrl || '');
  const [screenshotPublicId, setScreenshotPublicId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!screenshotUrl.trim()) {
      setError('Please upload a screenshot of your match result screen.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await submitMatchScreenshotProofAction({
      matchId,
      tournamentId,
      participantId,
      screenshotUrl: screenshotUrl.trim(),
      screenshotPublicId: screenshotPublicId || undefined,
    });

    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to submit screenshot proof.');
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      onSuccess();
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-[#0B0B7A] border border-white/20 p-6 shadow-2xl space-y-4">
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute right-4 top-4 p-1.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black uppercase tracking-wider text-white font-display">
              Upload Screenshot Proof
            </h3>
            <p className="text-xs text-white/60">Disputed match evidence submission</p>
          </div>
        </div>

        {success ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-white">Screenshot Evidence Received</h4>
            <p className="text-xs text-white/70 max-w-xs mx-auto">
              Your screenshot proof has been uploaded to Cloudinary and registered with the Admin Match Desk.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
              <span className="font-bold block">Why is proof required?</span>
              <p className="text-[11px] text-amber-200/80">
                You and your opponent submitted conflicting scores. To resolve this dispute, both players must upload their end-match screen evidence.
              </p>
              <p className="text-[10px] text-amber-300/70 pt-0.5">
                • Max file size: 2 MB (strictly rejected if exceeded).
                <br />• Auto-compressed to ≤ 500 KB. Scores must remain clear and readable.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-white uppercase tracking-wider">
                End-Match Result Screenshot *
              </label>
              <MediaUploadZone
                category="dispute_evidence"
                entityId={matchId}
                initialUrl={screenshotUrl}
                aspectRatio="banner"
                onUploadSuccess={(url, publicId) => {
                  setScreenshotUrl(url);
                  setScreenshotPublicId(publicId);
                  setError(null);
                }}
                onRemove={() => {
                  setScreenshotUrl('');
                  setScreenshotPublicId(null);
                }}
                label="Upload Match Screenshot"
                helperText="JPEG, PNG, or WebP. Max 2 MB. Automatically compressed to ≤ 500 KB and stored in Cloudinary."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={loading}
                className="border-white/20 bg-[#0A0A7A] text-white hover:bg-white/10 text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !screenshotUrl}
                className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-xl px-5"
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting...
                  </span>
                ) : (
                  'Submit Evidence'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
