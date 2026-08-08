'use client';

import React, { useState } from 'react';
import { BaseModal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { Participant, Group } from '@/types/database';
import { GroupStageOverview, createCustomGroup, deleteEmptyGroup } from '@/services/groupService';
import {
  Plus,
  Trash2,
  Shuffle,
  AlertCircle,
  Users,
} from 'lucide-react';

interface CustomGroupEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    assignments: { groupId: string; participantIds: string[] }[],
    regenerateFixtures: boolean
  ) => Promise<void>;
  overview: GroupStageOverview;
  isLoading?: boolean;
}

export function CustomGroupEditorModal({
  isOpen,
  onClose,
  onSave,
  overview,
  isLoading = false,
}: CustomGroupEditorModalProps) {
  // Initial state helper
  const getInitialState = () => {
    const gList = overview?.groups ? overview.groups.map((g) => g.group) : [];
    const map: Record<string, string[]> = {};
    const assignedSet = new Set<string>();

    if (overview?.groups) {
      for (const gDet of overview.groups) {
        const pIds = gDet.participants.map((p) => p.id);
        map[gDet.group.id] = pIds;
        pIds.forEach((id) => assignedSet.add(id));
      }
    }

    const allP = overview?.participants || [];
    const unassigned = allP.filter((p) => !assignedSet.has(p.id)).map((p) => p.id);

    return { gList, map, unassigned };
  };

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [groupMap, setGroupMap] = useState<Record<string, string[]>>(() => getInitialState().map);
  const [groupList, setGroupList] = useState<Group[]>(() => getInitialState().gList);
  const [unassignedPIds, setUnassignedPIds] = useState<string[]>(() => getInitialState().unassigned);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen && overview) {
      const { gList, map, unassigned } = getInitialState();
      setGroupList(gList);
      setGroupMap(map);
      setUnassignedPIds(unassigned);
    }
  }

  const [regenerateFixtures, setRegenerateFixtures] = useState<boolean>(true);
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [isCreatingGroup, setIsCreatingGroup] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const allParticipants = overview.participants || [];
  const participantById = new Map<string, Participant>(allParticipants.map((p) => [p.id, p]));

  // Move participant to a target group (or unassigned if targetGroupId === 'unassigned')
  const handleMovePlayer = (participantId: string, targetGroupId: string) => {
    setError(null);
    setGroupMap((prevMap) => {
      const nextMap: Record<string, string[]> = {};
      for (const [gId, pIds] of Object.entries(prevMap)) {
        nextMap[gId] = pIds.filter((id) => id !== participantId);
      }

      if (targetGroupId !== 'unassigned') {
        nextMap[targetGroupId] = [...(nextMap[targetGroupId] || []), participantId];
      }
      return nextMap;
    });

    setUnassignedPIds((prev) => {
      if (targetGroupId === 'unassigned') {
        return prev.includes(participantId) ? prev : [...prev, participantId];
      }
      return prev.filter((id) => id !== participantId);
    });
  };

  // Auto-Balance unassigned participants evenly across groups
  const handleAutoBalance = () => {
    if (groupList.length === 0) {
      setError('Create at least one group first.');
      return;
    }

    const nextMap: Record<string, string[]> = {};
    groupList.forEach((g) => (nextMap[g.id] = []));

    allParticipants.forEach((p, idx) => {
      const gIndex = idx % groupList.length;
      const targetGId = groupList[gIndex].id;
      nextMap[targetGId].push(p.id);
    });

    setGroupMap(nextMap);
    setUnassignedPIds([]);
    setError(null);
  };

  // Add new Custom Group
  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setIsCreatingGroup(true);
    setError(null);

    try {
      const newGroup = await createCustomGroup(overview.tournament.id, newGroupName.trim());
      setGroupList((prev) => [...prev, newGroup]);
      setGroupMap((prev) => ({ ...prev, [newGroup.id]: [] }));
      setNewGroupName('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create group.';
      setError(msg);
    } finally {
      setIsCreatingGroup(false);
    }
  };

  // Delete Empty Group
  const handleDeleteGroup = async (groupId: string) => {
    const pIds = groupMap[groupId] || [];
    if (pIds.length > 0) {
      setError('Move all players out of the group before deleting it.');
      return;
    }

    try {
      await deleteEmptyGroup(overview.tournament.id, groupId);
      setGroupList((prev) => prev.filter((g) => g.id !== groupId));
      setGroupMap((prev) => {
        const copy = { ...prev };
        delete copy[groupId];
        return copy;
      });
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete group.';
      setError(msg);
    }
  };

  // Save changes
  const handleSubmit = async () => {
    const payload = Object.entries(groupMap).map(([groupId, participantIds]) => ({
      groupId,
      participantIds,
    }));

    try {
      await onSave(payload, regenerateFixtures);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save group assignments.';
      setError(msg);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Custom Group Manager"
      description="Full control to assign, move, balance, and re-order participants across all groups."
    >
      <div className="space-y-4 pt-2 max-h-[80vh] overflow-y-auto pr-1">
        {error && (
          <div className="p-3 text-xs bg-destructive/10 text-destructive rounded-xl font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Toolbar Controls */}
        <div className="flex items-center justify-between flex-wrap gap-2 p-3 bg-[#F4F8F5] rounded-xl border border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAutoBalance}
            className="text-xs font-bold gap-1.5 rounded-lg border-border bg-white"
          >
            <Shuffle className="h-3.5 w-3.5 text-primary" />
            <span>Auto Balance Players</span>
          </Button>

          <form onSubmit={handleAddGroup} className="flex items-center gap-1.5">
            <Input
              type="text"
              placeholder="Group Name (e.g. Group C)"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="h-8 text-xs w-44 rounded-lg bg-white"
            />
            <Button
              type="submit"
              size="sm"
              disabled={isCreatingGroup || !newGroupName.trim()}
              className="h-8 text-xs font-bold rounded-lg bg-primary text-white"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>

        {/* Groups Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groupList.map((g) => {
            const pIds = groupMap[g.id] || [];
            return (
              <div key={g.id} className="p-3.5 bg-white rounded-xl border border-border space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-sm font-extrabold text-[#0B3323]">{g.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-bold">
                      {pIds.length} Players
                    </Badge>
                    {pIds.length === 0 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(g.id)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded-md"
                        title="Delete Empty Group"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Player List */}
                <div className="space-y-1.5 min-h-[80px]">
                  {pIds.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic text-center py-4">
                      No players assigned to this group.
                    </p>
                  ) : (
                    pIds.map((pId) => {
                      const p = participantById.get(pId);
                      return (
                        <div
                          key={pId}
                          className="flex items-center justify-between p-2 rounded-lg bg-[#F9FBF9] border border-border/60 text-xs"
                        >
                          <span className="font-bold text-[#0B3323]">
                            {p?.username || 'Unknown'} {p?.real_name ? `(${p.real_name})` : ''}
                          </span>

                          <select
                            value={g.id}
                            onChange={(e) => handleMovePlayer(pId, e.target.value)}
                            className="h-6 text-[10px] font-bold rounded-md border border-border bg-white px-1.5 text-muted-foreground"
                          >
                            <option value={g.id}>Group: {g.name}</option>
                            {groupList
                              .filter((other) => other.id !== g.id)
                              .map((other) => (
                                <option key={other.id} value={other.id}>
                                  Move to {other.name}
                                </option>
                              ))}
                            <option value="unassigned">Unassign</option>
                          </select>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Unassigned Players Pool */}
        {unassignedPIds.length > 0 && (
          <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <Users className="h-4 w-4 text-amber-600" />
                <span>Unassigned Tournament Players ({unassignedPIds.length})</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {unassignedPIds.map((pId) => {
                const p = participantById.get(pId);
                return (
                  <div
                    key={pId}
                    className="flex items-center justify-between p-2 rounded-lg bg-white border border-amber-200 text-xs"
                  >
                    <span className="font-bold text-[#0B3323]">{p?.username}</span>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) handleMovePlayer(pId, e.target.value);
                      }}
                      className="h-6 text-[10px] font-bold rounded-md border border-border bg-white px-1.5 text-primary"
                    >
                      <option value="">Assign to...</option>
                      {groupList.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Fixtures Regenerate Toggle */}
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <input
            type="checkbox"
            id="regenFixtures"
            checked={regenerateFixtures}
            onChange={(e) => setRegenerateFixtures(e.target.checked)}
            className="h-4 w-4 rounded-md text-primary accent-primary"
          />
          <label htmlFor="regenFixtures" className="text-xs font-medium text-[#0B3323] cursor-pointer">
            Auto-generate new round-robin fixtures for modified groups (unplayed matches)
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={isLoading}
            className="font-bold bg-primary text-white"
          >
            {isLoading ? 'Saving...' : 'Save Group Assignments'}
          </Button>
        </div>
      </div>
    </BaseModal>
  );
}
