'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  Save,
  Send,
  ArrowLeft,
  RotateCcw,
  Users,
  Plus,
  Layers,
  History,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Edit3,
  RefreshCw,
  Trophy,
  Swords,
  Sparkles,
  Move,
  ArrowRightLeft,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  Participant,
  Match,
  KnockoutDraftPayload,
  DraftRoundNode,
  DraftMatchNode,
  BracketValidationResult,
  KnockoutBracketLog,
} from '@/types/database';
import {
  saveKnockoutDraft,
  validateKnockoutDraft,
  publishKnockoutDraft,
  fetchBracketAuditLogs,
} from '@/services/bracketCustomizerService';
import { MatchEditorModal } from './MatchEditorModal';
import { RoundManagerModal } from './RoundManagerModal';
import { SafetyValidationModal } from './SafetyValidationModal';
import { AuditLogDrawer } from './AuditLogDrawer';

interface AdminKnockoutCustomizerProps {
  tournamentId: string;
  tournamentName: string;
  initialPayload: KnockoutDraftPayload;
  allParticipants: Participant[];
  liveMatches: Match[];
}

export default function AdminKnockoutCustomizer({
  tournamentId,
  tournamentName,
  initialPayload,
  allParticipants,
  liveMatches,
}: AdminKnockoutCustomizerProps) {
  const [draft, setDraft] = useState<KnockoutDraftPayload>(initialPayload);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Swap Mode State
  const [isSwapMode, setIsSwapMode] = useState(false);
  const [selectedSwapSlot, setSelectedSwapSlot] = useState<{
    roundId: string;
    matchId: string;
    slot: 'participant_a' | 'participant_b';
    participantId: string | null;
  } | null>(null);

  // Drag & Drop State
  const [draggedParticipantId, setDraggedParticipantId] = useState<string | null>(null);

  // Modals & Drawers
  const [editingMatch, setEditingMatch] = useState<{ match: DraftMatchNode; roundName: string } | null>(null);
  const [isRoundManagerOpen, setIsRoundManagerOpen] = useState(false);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState<BracketValidationResult | null>(null);
  const [isAuditLogOpen, setIsAuditLogOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<KnockoutBracketLog[]>([]);

  const participantMap = useMemo(
    () => new Map<string, Participant>(allParticipants.map((p) => [p.id, p])),
    [allParticipants]
  );

  // Calculate Unassigned Participants
  const assignedParticipantIds = useMemo(() => {
    const ids = new Set<string>();
    draft.rounds.forEach((r) =>
      r.matches.forEach((m) => {
        if (m.participant_a) ids.add(m.participant_a);
        if (m.participant_b) ids.add(m.participant_b);
      })
    );
    return ids;
  }, [draft]);

  const unassignedParticipants = useMemo(
    () => allParticipants.filter((p) => !assignedParticipantIds.has(p.id)),
    [allParticipants, assignedParticipantIds]
  );

  const updateDraftState = (newRounds: DraftRoundNode[]) => {
    setDraft((prev) => ({
      ...prev,
      rounds: newRounds,
      updatedAt: new Date().toISOString(),
    }));
    setHasUnsavedChanges(true);
  };

  // 1. Swap Logic
  const executeSwap = useCallback(
    (
      source: { roundId: string; matchId: string; slot: 'participant_a' | 'participant_b' },
      target: { roundId: string; matchId: string; slot: 'participant_a' | 'participant_b' }
    ) => {
      const newRounds = draft.rounds.map((round) => {
        return {
          ...round,
          matches: round.matches.map((match) => {
            let pA = match.participant_a;
            let pB = match.participant_b;

            if (round.id === source.roundId && match.id === source.matchId) {
              const targetVal = draft.rounds
                .find((r) => r.id === target.roundId)
                ?.matches.find((m) => m.id === target.matchId)?.[target.slot] || null;

              if (source.slot === 'participant_a') pA = targetVal;
              if (source.slot === 'participant_b') pB = targetVal;
            }

            if (round.id === target.roundId && match.id === target.matchId) {
              const sourceVal = draft.rounds
                .find((r) => r.id === source.roundId)
                ?.matches.find((m) => m.id === source.matchId)?.[source.slot] || null;

              if (target.slot === 'participant_a') pA = sourceVal;
              if (target.slot === 'participant_b') pB = sourceVal;
            }

            return { ...match, participant_a: pA, participant_b: pB };
          }),
        };
      });

      updateDraftState(newRounds);
      setSelectedSwapSlot(null);
      setMessage({ text: 'Players swapped successfully.', type: 'success' });
    },
    [draft]
  );

  // Slot Click Handler (Handles Swap Mode & Direct Selection)
  const handleSlotClick = (
    roundId: string,
    matchId: string,
    slot: 'participant_a' | 'participant_b',
    currentParticipantId: string | null
  ) => {
    if (isSwapMode) {
      if (!selectedSwapSlot) {
        setSelectedSwapSlot({ roundId, matchId, slot, participantId: currentParticipantId });
        setMessage({ text: 'Select second slot to swap with.', type: 'success' });
      } else {
        if (selectedSwapSlot.matchId === matchId && selectedSwapSlot.slot === slot) {
          setSelectedSwapSlot(null);
        } else {
          executeSwap(selectedSwapSlot, { roundId, matchId, slot });
        }
      }
    }
  };

  // Direct Slot Assignment from Drawer
  const handleAssignParticipantToSlot = (
    participantId: string,
    roundId: string,
    matchId: string,
    slot: 'participant_a' | 'participant_b'
  ) => {
    const newRounds = draft.rounds.map((r) => {
      if (r.id !== roundId) return r;
      return {
        ...r,
        matches: r.matches.map((m) => {
          if (m.id !== matchId) return m;
          return {
            ...m,
            [slot]: participantId,
          };
        }),
      };
    });

    updateDraftState(newRounds);
  };

  // Clear Slot
  const handleClearSlot = (
    roundId: string,
    matchId: string,
    slot: 'participant_a' | 'participant_b'
  ) => {
    const newRounds = draft.rounds.map((r) => {
      if (r.id !== roundId) return r;
      return {
        ...r,
        matches: r.matches.map((m) => {
          if (m.id !== matchId) return m;
          return {
            ...m,
            [slot]: null,
          };
        }),
      };
    });

    updateDraftState(newRounds);
  };

  // Save Draft Action
  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    setMessage(null);
    try {
      await saveKnockoutDraft(tournamentId, draft);
      setHasUnsavedChanges(false);
      setMessage({ text: 'Draft configuration saved successfully.', type: 'success' });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Failed to save draft',
        type: 'error',
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Open Publish Modal & Pre-validate
  const handleOpenPublishModal = () => {
    const res = validateKnockoutDraft(draft, liveMatches);
    setValidationResult(res);
    setIsValidationModalOpen(true);
  };

  // Confirm Publish Action
  const handleConfirmPublish = async () => {
    setIsPublishing(true);
    try {
      await publishKnockoutDraft(tournamentId, draft);
      setHasUnsavedChanges(false);
      setIsValidationModalOpen(false);
      setMessage({ text: '🎉 Knockout bracket published live successfully!', type: 'success' });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Failed to publish bracket',
        type: 'error',
      });
    } finally {
      setIsPublishing(false);
    }
  };

  // Round Management Actions
  const handleAddRound = (roundName: string) => {
    const maxRoundNum = draft.rounds.length > 0 ? Math.max(...draft.rounds.map((r) => r.round_number)) : 0;
    const newRoundId = `temp_round_${Date.now()}`;
    const newRound: DraftRoundNode = {
      id: newRoundId,
      tournament_id: tournamentId,
      round_number: maxRoundNum + 1,
      name: roundName,
      matches: [
        {
          id: `temp_match_${Date.now()}_1`,
          round_id: newRoundId,
          match_position: 1,
          participant_a: null,
          participant_b: null,
          score_a: 0,
          score_b: 0,
          status: 'pending',
          winner_id: null,
          next_match_id: null,
          winner_slot: null,
          notes: null,
        },
      ],
    };

    updateDraftState([...draft.rounds, newRound]);
  };

  const handleRenameRound = (roundId: string, newName: string) => {
    const newRounds = draft.rounds.map((r) => (r.id === roundId ? { ...r, name: newName } : r));
    updateDraftState(newRounds);
  };

  const handleDeleteRound = (roundId: string) => {
    const newRounds = draft.rounds.filter((r) => r.id !== roundId);
    updateDraftState(newRounds);
  };

  const handleAddMatchToRound = (roundId: string) => {
    const newRounds = draft.rounds.map((r) => {
      if (r.id !== roundId) return r;
      const maxPos = r.matches.length > 0 ? Math.max(...r.matches.map((m) => m.match_position)) : 0;
      const newMatch: DraftMatchNode = {
        id: `temp_match_${Date.now()}_${maxPos + 1}`,
        round_id: roundId,
        match_position: maxPos + 1,
        participant_a: null,
        participant_b: null,
        score_a: 0,
        score_b: 0,
        status: 'pending',
        winner_id: null,
        next_match_id: null,
        winner_slot: null,
        notes: null,
      };
      return { ...r, matches: [...r.matches, newMatch] };
    });

    updateDraftState(newRounds);
  };

  const handleDeleteMatch = (roundId: string, matchId: string) => {
    const newRounds = draft.rounds.map((r) => {
      if (r.id !== roundId) return r;
      return { ...r, matches: r.matches.filter((m) => m.id !== matchId) };
    });
    updateDraftState(newRounds);
  };

  // Open Audit Drawer
  const handleOpenAuditDrawer = async () => {
    const logs = await fetchBracketAuditLogs(tournamentId);
    setAuditLogs(logs);
    setIsAuditLogOpen(true);
  };

  const allDraftMatches = useMemo(() => draft.rounds.flatMap((r) => r.matches), [draft]);

  return (
    <div className="space-y-6">
      {/* 1. TOP TOOLBAR & CONTROLS */}
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="bg-[#0B3323] text-emerald-400 font-black text-[10px] uppercase">
                ADMIN KNOCKOUT CUSTOMIZER
              </Badge>
              {hasUnsavedChanges && (
                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] font-bold">
                  Unsaved Draft Changes
                </Badge>
              )}
            </div>
            <h2 className="text-xl font-black text-[#0B3323] tracking-tight mt-1">{tournamentName}</h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Swap Mode Toggle */}
            <Button
              variant={isSwapMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setIsSwapMode(!isSwapMode);
                setSelectedSwapSlot(null);
              }}
              className={cn(
                'rounded-xl text-xs font-black gap-1.5 transition-all',
                isSwapMode
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-md ring-2 ring-amber-300'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-100'
              )}
            >
              <ArrowRightLeft className="h-4 w-4" />
              <span>{isSwapMode ? '⇄ Swap Mode Active' : '⇄ Enable Swap Mode'}</span>
            </Button>

            {/* Manage Rounds */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRoundManagerOpen(true)}
              className="rounded-xl text-xs font-bold text-[#0B3323] border-slate-200 hover:bg-slate-50 gap-1.5"
            >
              <Layers className="h-4 w-4 text-emerald-600" />
              <span>Manage Rounds</span>
            </Button>

            {/* Audit Log */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenAuditDrawer}
              className="rounded-xl text-xs font-bold text-slate-600 border-slate-200 hover:bg-slate-50 gap-1.5"
            >
              <History className="h-4 w-4 text-slate-500" />
              <span>Audit Log</span>
            </Button>

            {/* Save Draft */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              disabled={isSavingDraft}
              className="rounded-xl text-xs font-black text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 gap-1.5"
            >
              <Save className="h-4 w-4" />
              <span>{isSavingDraft ? 'Saving...' : 'Save Draft'}</span>
            </Button>

            {/* Publish Button */}
            <Button
              size="sm"
              onClick={handleOpenPublishModal}
              className="rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
            >
              <Send className="h-4 w-4" />
              <span>Publish Changes</span>
            </Button>
          </div>
        </div>

        {/* Banner Alert Messages */}
        {message && (
          <div
            className={cn(
              'p-3 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 border',
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-rose-50 text-rose-900 border-rose-200'
            )}
          >
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
            <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* 2. MAIN CUSTOMIZER CANVAS & UNASSIGNED PLAYERS */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* UNASSIGNED PARTICIPANTS SIDEBAR */}
        <Card className="p-4 rounded-3xl border border-slate-200 bg-white shadow-xs space-y-4 lg:col-span-1 h-fit">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-black text-[#0B3323] uppercase tracking-wider flex items-center gap-1.5">
              <Users className="h-4 w-4 text-emerald-600" />
              <span>Participants ({allParticipants.length})</span>
            </h3>
            <Badge variant="outline" className="text-[10px] font-bold bg-slate-50">
              {unassignedParticipants.length} Unassigned
            </Badge>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto no-scrollbar pr-1">
            {allParticipants.map((p) => {
              const isAssigned = assignedParticipantIds.has(p.id);
              return (
                <div
                  key={`p-item-${p.id}`}
                  draggable
                  onDragStart={() => setDraggedParticipantId(p.id)}
                  onDragEnd={() => setDraggedParticipantId(null)}
                  className={cn(
                    'p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all cursor-grab active:cursor-grabbing',
                    isAssigned
                      ? 'bg-slate-50 border-slate-200 opacity-60'
                      : 'bg-white border-slate-200 hover:border-emerald-400 hover:shadow-2xs'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Move className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    {p.seed_number && (
                      <span className="text-[9px] font-black text-emerald-800 bg-emerald-100 px-1 py-0.2 rounded shrink-0">
                        #{p.seed_number}
                      </span>
                    )}
                    <span className="font-bold text-[#0B3323] truncate">{p.username}</span>
                  </div>

                  {isAssigned ? (
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Assigned</span>
                  ) : (
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                      Drag to Slot
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* BRACKET ROUNDS CANVAS */}
        <div className="lg:col-span-3 overflow-x-auto no-scrollbar rounded-3xl border border-slate-200 bg-[#F4F8F5] p-6 shadow-xs">
          <div className="flex gap-8 items-start min-w-max">
            {draft.rounds.map((round) => (
              <div key={round.id} className="flex flex-col gap-4 w-72 shrink-0">
                {/* Round Header */}
                <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                  <span className="text-xs font-black text-[#0B3323] uppercase tracking-wider">
                    {round.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAddMatchToRound(round.id)}
                      className="h-6 px-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50"
                    >
                      <Plus className="h-3 w-3 mr-0.5" /> Match
                    </Button>
                  </div>
                </div>

                {/* Match Cards Stack */}
                <div className="flex flex-col gap-4">
                  {round.matches.map((m) => {
                    const playerA = m.participant_a ? participantMap.get(m.participant_a) : null;
                    const playerB = m.participant_b ? participantMap.get(m.participant_b) : null;

                    const isSwapSourceA =
                      selectedSwapSlot?.matchId === m.id && selectedSwapSlot?.slot === 'participant_a';
                    const isSwapSourceB =
                      selectedSwapSlot?.matchId === m.id && selectedSwapSlot?.slot === 'participant_b';

                    return (
                      <Card
                        key={m.id}
                        className="p-3 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-3 relative group"
                      >
                        {/* Match Header Bar */}
                        <div className="flex items-center justify-between text-[10px] font-extrabold text-[#0B3323] uppercase tracking-wider border-b border-slate-100 pb-2">
                          <span className="flex items-center gap-1 font-mono">
                            <Swords className="h-3 w-3 text-slate-400" />
                            <span>MATCH #{m.match_position}</span>
                          </span>

                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[9px] font-bold capitalize">
                              {m.status}
                            </Badge>

                            <button
                              onClick={() => setEditingMatch({ match: m, roundName: round.name })}
                              className="text-slate-400 hover:text-emerald-700 p-1"
                              title="Edit Match Details"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>

                            {round.matches.length > 1 && (
                              <button
                                onClick={() => handleDeleteMatch(round.id, m.id)}
                                className="text-slate-300 hover:text-rose-600 p-1"
                                title="Delete Match"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* SLOT A Drop Zone */}
                        <div
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggedParticipantId) {
                              handleAssignParticipantToSlot(draggedParticipantId, round.id, m.id, 'participant_a');
                            }
                          }}
                          onClick={() => handleSlotClick(round.id, m.id, 'participant_a', m.participant_a)}
                          className={cn(
                            'p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all cursor-pointer',
                            isSwapSourceA
                              ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400/50'
                              : isSwapMode
                              ? 'hover:bg-amber-50 hover:border-amber-300'
                              : playerA
                              ? 'bg-white border-slate-200 hover:border-emerald-300'
                              : 'bg-slate-50 border-dashed border-slate-200 hover:border-emerald-400'
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {playerA?.seed_number && (
                              <span className="text-[9px] font-black text-emerald-800 bg-emerald-100 px-1 py-0.2 rounded">
                                #{playerA.seed_number}
                              </span>
                            )}
                            <span className={cn('text-xs font-bold truncate', playerA ? 'text-[#0B3323]' : 'text-slate-400 italic text-[11px]')}>
                              {playerA ? playerA.username : 'Slot A (Empty / TBD)'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {m.winner_id === m.participant_a && m.participant_a && (
                              <Badge className="bg-emerald-600 text-white text-[8px] font-black px-1 py-0 border-0 uppercase">
                                WIN
                              </Badge>
                            )}
                            <span
                              className={cn(
                                'h-6 w-6 rounded-lg flex items-center justify-center text-xs font-black tabular-nums border shadow-2xs',
                                m.winner_id === m.participant_a && m.participant_a
                                  ? 'bg-emerald-600 text-white border-emerald-500'
                                  : 'bg-slate-100 text-slate-800 border-slate-200'
                              )}
                            >
                              {m.score_a ?? 0}
                            </span>
                            {playerA && !isSwapMode && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleClearSlot(round.id, m.id, 'participant_a');
                                }}
                                className="text-slate-300 hover:text-rose-600 p-0.5"
                                title="Clear Slot"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* SLOT B Drop Zone */}
                        <div
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggedParticipantId) {
                              handleAssignParticipantToSlot(draggedParticipantId, round.id, m.id, 'participant_b');
                            }
                          }}
                          onClick={() => handleSlotClick(round.id, m.id, 'participant_b', m.participant_b)}
                          className={cn(
                            'p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all cursor-pointer',
                            isSwapSourceB
                              ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400/50'
                              : isSwapMode
                              ? 'hover:bg-amber-50 hover:border-amber-300'
                              : playerB
                              ? 'bg-white border-slate-200 hover:border-emerald-300'
                              : 'bg-slate-50 border-dashed border-slate-200 hover:border-emerald-400'
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {playerB?.seed_number && (
                              <span className="text-[9px] font-black text-emerald-800 bg-emerald-100 px-1 py-0.2 rounded">
                                #{playerB.seed_number}
                              </span>
                            )}
                            <span className={cn('text-xs font-bold truncate', playerB ? 'text-[#0B3323]' : 'text-slate-400 italic text-[11px]')}>
                              {playerB ? playerB.username : 'Slot B (Empty / TBD)'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {m.winner_id === m.participant_b && m.participant_b && (
                              <Badge className="bg-emerald-600 text-white text-[8px] font-black px-1 py-0 border-0 uppercase">
                                WIN
                              </Badge>
                            )}
                            <span
                              className={cn(
                                'h-6 w-6 rounded-lg flex items-center justify-center text-xs font-black tabular-nums border shadow-2xs',
                                m.winner_id === m.participant_b && m.participant_b
                                  ? 'bg-emerald-600 text-white border-emerald-500'
                                  : 'bg-slate-100 text-slate-800 border-slate-200'
                              )}
                            >
                              {m.score_b ?? 0}
                            </span>
                            {playerB && !isSwapMode && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleClearSlot(round.id, m.id, 'participant_b');
                                }}
                                className="text-slate-300 hover:text-rose-600 p-0.5"
                                title="Clear Slot"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Match Routing Footer */}
                        {m.next_match_id && (
                          <div className="text-[9px] font-mono text-slate-400 flex items-center gap-1 pt-1 border-t border-slate-100">
                            <span>Winner ➔ Match #{allDraftMatches.find((x) => x.id === m.next_match_id)?.match_position || '?'}</span>
                            {m.winner_slot && <span className="uppercase">({m.winner_slot.replace('participant_', 'Slot ')})</span>}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. MODALS & DRAWERS */}
      {editingMatch && (
        <MatchEditorModal
          isOpen={Boolean(editingMatch)}
          onClose={() => setEditingMatch(null)}
          onSave={(updatedMatch) => {
            const newRounds = draft.rounds.map((r) => ({
              ...r,
              matches: r.matches.map((m) => (m.id === updatedMatch.id ? updatedMatch : m)),
            }));
            updateDraftState(newRounds);
          }}
          match={editingMatch.match}
          allParticipants={allParticipants}
          allMatches={allDraftMatches}
          roundName={editingMatch.roundName}
        />
      )}

      {isRoundManagerOpen && (
        <RoundManagerModal
          isOpen={isRoundManagerOpen}
          onClose={() => setIsRoundManagerOpen(false)}
          rounds={draft.rounds}
          onAddRound={handleAddRound}
          onRenameRound={handleRenameRound}
          onDeleteRound={handleDeleteRound}
          onAddMatchToRound={handleAddMatchToRound}
        />
      )}

      {isValidationModalOpen && (
        <SafetyValidationModal
          isOpen={isValidationModalOpen}
          onClose={() => setIsValidationModalOpen(false)}
          onConfirmPublish={handleConfirmPublish}
          validationResult={validationResult}
          isPublishing={isPublishing}
        />
      )}

      {isAuditLogOpen && (
        <AuditLogDrawer
          isOpen={isAuditLogOpen}
          onClose={() => setIsAuditLogOpen(false)}
          logs={auditLogs}
        />
      )}
    </div>
  );
}
