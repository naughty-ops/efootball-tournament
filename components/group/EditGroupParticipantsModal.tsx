'use client';

import React, { useState } from 'react';
import { BaseModal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { GroupDetails } from '@/services/groupService';
import { ArrowRightLeft, MoveRight } from 'lucide-react';

interface EditGroupParticipantsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwap: (pAId: string, gAId: string, pBId: string, gBId: string) => Promise<void>;
  onMove: (pId: string, srcGId: string, tgtGId: string) => Promise<void>;
  currentGroup: GroupDetails;
  allGroups: GroupDetails[];
  isLoading?: boolean;
}

export function EditGroupParticipantsModal({
  isOpen,
  onClose,
  onSwap,
  onMove,
  currentGroup,
  allGroups,
  isLoading = false,
}: EditGroupParticipantsModalProps) {
  const [selectedParticipantA, setSelectedParticipantA] = useState<string>('');
  const [targetGroupId, setTargetGroupId] = useState<string>('');
  const [selectedParticipantB, setSelectedParticipantB] = useState<string>('');
  const [mode, setMode] = useState<'swap' | 'move'>('swap');
  const [error, setError] = useState<string | null>(null);

  const otherGroups = allGroups.filter((g) => g.group.id !== currentGroup.group.id);

  const targetGroupDetails = allGroups.find((g) => g.group.id === targetGroupId);
  const targetGroupParticipants = targetGroupDetails?.participants || [];

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedParticipantA) {
      setError('Please select a participant from this group.');
      return;
    }

    if (!targetGroupId) {
      setError('Please select a target group.');
      return;
    }

    if (mode === 'swap' && !selectedParticipantB) {
      setError('Please select a participant from the target group to swap with.');
      return;
    }

    try {
      if (mode === 'swap') {
        await onSwap(
          selectedParticipantA,
          currentGroup.group.id,
          selectedParticipantB,
          targetGroupId
        );
      } else {
        await onMove(selectedParticipantA, currentGroup.group.id, targetGroupId);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed';
      setError(msg);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Participants: ${currentGroup.group.name}`}
      description="Reassign or swap participants between tournament groups."
    >
      <form onSubmit={handleAction} className="space-y-4 pt-2">
        {error && (
          <div className="p-3 text-xs bg-destructive/10 text-destructive rounded-xl font-medium">
            {error}
          </div>
        )}

        {/* Mode Selector */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-[#F4F8F5] rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setMode('swap')}
            className={`py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              mode === 'swap' ? 'bg-white text-[#0B3323] shadow-xs' : 'text-muted-foreground'
            }`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            <span>Swap Players</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('move')}
            className={`py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              mode === 'move' ? 'bg-white text-[#0B3323] shadow-xs' : 'text-muted-foreground'
            }`}
          >
            <MoveRight className="h-3.5 w-3.5" />
            <span>Move Player</span>
          </button>
        </div>

        {/* Participant from current group */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-[#0B3323] block">
            Select Player in {currentGroup.group.name}
          </label>
          <select
            value={selectedParticipantA}
            onChange={(e) => setSelectedParticipantA(e.target.value)}
            className="w-full h-9 rounded-xl border border-border bg-white px-3 text-xs font-medium text-[#0B3323]"
            required
          >
            <option value="">-- Choose Player --</option>
            {currentGroup.participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.username} {p.real_name ? `(${p.real_name})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Target Group */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-[#0B3323] block">
            Target Group
          </label>
          <select
            value={targetGroupId}
            onChange={(e) => {
              setTargetGroupId(e.target.value);
              setSelectedParticipantB('');
            }}
            className="w-full h-9 rounded-xl border border-border bg-white px-3 text-xs font-medium text-[#0B3323]"
            required
          >
            <option value="">-- Choose Target Group --</option>
            {otherGroups.map((g) => (
              <option key={g.group.id} value={g.group.id}>
                {g.group.name} ({g.participants.length} Players)
              </option>
            ))}
          </select>
        </div>

        {/* Participant from Target Group (if mode === 'swap') */}
        {mode === 'swap' && targetGroupId && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#0B3323] block">
              Swap With Player in {targetGroupDetails?.group.name}
            </label>
            <select
              value={selectedParticipantB}
              onChange={(e) => setSelectedParticipantB(e.target.value)}
              className="w-full h-9 rounded-xl border border-border bg-white px-3 text-xs font-medium text-[#0B3323]"
              required
            >
              <option value="">-- Choose Player to Swap --</option>
              {targetGroupParticipants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.username} {p.real_name ? `(${p.real_name})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isLoading} className="font-bold bg-primary text-white">
            {isLoading ? 'Saving...' : mode === 'swap' ? 'Swap Players' : 'Move Player'}
          </Button>
        </div>
      </form>
    </BaseModal>
  );
}
