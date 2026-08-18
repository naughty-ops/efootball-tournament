'use client';

import React, { useState } from 'react';
import { Image as ImageIcon, Check, Loader2, Link2, Sparkles, X } from 'lucide-react';
import { updateTournamentBannerImage } from '@/services/tournamentService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface EditCoverImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournamentId: string;
  tournamentName: string;
  currentBannerUrl?: string | null;
  onSuccess?: (newBannerUrl: string) => void;
}

const PRESET_BANNERS = [
  { label: 'eFootball Stadium 1', url: '/images/banner1.jpg' },
  { label: 'eFootball Stadium 2', url: '/images/banner2.jpg' },
  { label: 'eFootball Stadium 3', url: '/images/banner3.jpg' },
];

export function EditCoverImageModal({
  isOpen,
  onClose,
  tournamentId,
  tournamentName,
  currentBannerUrl,
  onSuccess,
}: EditCoverImageModalProps) {
  const [bannerUrl, setBannerUrl] = useState<string>(currentBannerUrl || '/images/banner1.jpg');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await updateTournamentBannerImage(tournamentId, bannerUrl);
      if (onSuccess) onSuccess(bannerUrl);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update cover image');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden bg-white rounded-3xl shadow-2xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-5 bg-[#F4F8F5] border-b border-border">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#0B3323]">Edit Cover Image</h3>
              <p className="text-xs text-muted-foreground truncate max-w-[240px] sm:max-w-[320px]">
                {tournamentName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Live Preview Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#0B3323]">Cover Image Preview</label>
            <div className="relative h-44 w-full rounded-2xl overflow-hidden bg-slate-950 border border-border shadow-inner">
              <img
                src={bannerUrl || '/images/banner1.jpg'}
                alt="Cover Preview"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/images/banner1.jpg';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end p-4">
                <span className="text-xs font-black text-white drop-shadow-md">
                  {tournamentName} (Live Cover Preview)
                </span>
              </div>
            </div>
          </div>

          {/* Image URL Input */}
          <div className="space-y-1.5">
            <label htmlFor="bannerUrlInput" className="text-xs font-bold text-[#0B3323] flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 text-primary" />
              <span>Image URL</span>
            </label>
            <Input
              id="bannerUrlInput"
              type="url"
              placeholder="https://example.com/banner.jpg"
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              className="text-xs font-mono h-9 bg-white"
            />
          </div>

          {/* Preset Buttons */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[11px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-500" />
              <span>Preset eFootball Covers</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PRESET_BANNERS.map((preset) => {
                const isSelected = bannerUrl === preset.url;
                return (
                  <button
                    key={preset.url}
                    type="button"
                    onClick={() => setBannerUrl(preset.url)}
                    className={`relative rounded-xl overflow-hidden border text-left text-xs font-semibold h-16 transition-all ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/40 shadow-sm'
                        : 'border-border opacity-80 hover:opacity-100 hover:border-primary/50'
                    }`}
                  >
                    <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 p-1 flex items-end justify-between">
                      <span className="text-[9px] font-bold text-white truncate drop-shadow-xs">
                        {preset.label}
                      </span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-9 px-4 text-xs font-semibold"
            >
              Cancel
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="h-9 px-5 text-xs font-bold gap-1.5 rounded-xl bg-primary text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Save Cover Image</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
