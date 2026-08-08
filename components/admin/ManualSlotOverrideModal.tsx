'use client';

import React, { useState } from 'react';
import { X, UserCheck, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Participant } from '@/types/database';
import { overrideMatchSlot, FullMatchData } from '@/services/bracketService';

interface ManualSlotOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  match: FullMatchData | null;
  slotToEdit: 'participant_a' | 'participant_b' | null;
  allParticipants: Participant[];
}

export function ManualSlotOverrideModal({
  isOpen,
  onClose,
  onSuccess,
  match,
  slotToEdit,
  allParticipants,
}: ManualSlotOverrideModalProps) {
  const initialValue =
    match && slotToEdit
      ? (slotToEdit === 'participant_a' ? match.participant_a : match.participant_b) || ''
      : '';

  const [selectedParticipantId, setSelectedParticipantId] = useState<string>(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !match || !slotToEdit) return null;

  const currentOpponentId = slotToEdit === 'participant_a' ? match.participant_b : match.participant_a;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedParticipantId === currentOpponentId) {
      setError('A participant cannot play against themselves in the same match.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await overrideMatchSlot(
        match.id,
        slotToEdit,
        selectedParticipantId.trim().length > 0 ? selectedParticipantId : null
      );
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update bracket slot';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative w-full max-w-md bg-white rounded-3xl border border-border shadow-2xl p-6 z-10 space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0B3323]">Manual Slot Override</h3>
              <p className="text-xs text-muted-foreground">
                Match #{match.match_position} • {slotToEdit === 'participant_a' ? 'Slot A' : 'Slot B'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-[#0B3323] p-1.5 rounded-xl">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[#0B3323] block mb-1.5">
              Select Participant for {slotToEdit === 'participant_a' ? 'Slot A' : 'Slot B'}
            </label>
            <select
              value={selectedParticipantId}
              onChange={(e) => setSelectedParticipantId(e.target.value)}
              disabled={isSaving}
              className="w-full h-10 px-3 rounded-xl border border-border bg-white text-xs font-semibold text-[#0B3323] focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            >
              <option value="">-- Empty / BYE Slot --</option>
              {allParticipants.map((p) => (
                <option key={p.id} value={p.id} disabled={p.id === currentOpponentId}>
                  {p.seed_number ? `#${p.seed_number} ` : ''}
                  {p.username} {p.real_name ? `(${p.real_name})` : ''}
                  {p.id === currentOpponentId ? ' [Opponent]' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSaving} className="font-bold gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              <span>Save Slot Override</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
