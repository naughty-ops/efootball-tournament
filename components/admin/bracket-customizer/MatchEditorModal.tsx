'use client';

import React, { useState, useEffect } from 'react';
import { X, Edit3, UserCheck, AlertCircle, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Participant, MatchStatus, DraftMatchNode } from '@/types/database';

interface MatchEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedMatch: DraftMatchNode) => void;
  match: DraftMatchNode | null;
  allParticipants: Participant[];
  allMatches: DraftMatchNode[];
  roundName?: string;
}

export function MatchEditorModal({
  isOpen,
  onClose,
  onSave,
  match,
  allParticipants,
  allMatches,
  roundName,
}: MatchEditorModalProps) {
  const [participantA, setParticipantA] = useState<string>('');
  const [participantB, setParticipantB] = useState<string>('');
  const [scoreA, setScoreA] = useState<number>(0);
  const [scoreB, setScoreB] = useState<number>(0);
  const [status, setStatus] = useState<MatchStatus>('pending');
  const [winnerId, setWinnerId] = useState<string>('');
  const [nextMatchId, setNextMatchId] = useState<string>('');
  const [winnerSlot, setWinnerSlot] = useState<'participant_a' | 'participant_b' | ''>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (match) {
      setParticipantA(match.participant_a || '');
      setParticipantB(match.participant_b || '');
      setScoreA(match.score_a ?? 0);
      setScoreB(match.score_b ?? 0);
      setStatus(match.status || 'pending');
      setWinnerId(match.winner_id || '');
      setNextMatchId(match.next_match_id || '');
      setWinnerSlot(match.winner_slot || '');
      setNotes(match.notes || '');
      setError(null);
    }
  }, [match]);

  if (!isOpen || !match) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (participantA && participantB && participantA === participantB) {
      setError('A participant cannot play against themselves.');
      return;
    }

    const updatedMatch: DraftMatchNode = {
      ...match,
      participant_a: participantA.trim().length > 0 ? participantA : null,
      participant_b: participantB.trim().length > 0 ? participantB : null,
      score_a: Number(scoreA) || 0,
      score_b: Number(scoreB) || 0,
      status,
      winner_id: winnerId.trim().length > 0 ? winnerId : null,
      next_match_id: nextMatchId.trim().length > 0 ? nextMatchId : null,
      winner_slot: winnerSlot === 'participant_a' || winnerSlot === 'participant_b' ? winnerSlot : null,
      notes: notes.trim().length > 0 ? notes : null,
    };

    onSave(updatedMatch);
    onClose();
  };

  const candidateNextMatches = allMatches.filter((m) => m.id !== match.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />

      {/* Modal Content */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 z-10 space-y-5 max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Edit3 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#0B3323]">Edit Match #{match.match_position}</h3>
              <p className="text-xs text-slate-500 font-semibold">{roundName || 'Knockout Round'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-[#0B3323] p-1.5 rounded-xl">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Player Selection Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <div>
              <label className="text-[11px] font-black text-[#0B3323] block mb-1">Slot A Player</label>
              <select
                value={participantA}
                onChange={(e) => setParticipantA(e.target.value)}
                className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2 focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">(Empty / TBD)</option>
                {allParticipants.map((p) => (
                  <option key={`a-${p.id}`} value={p.id}>
                    {p.username} {p.seed_number ? `(#${p.seed_number})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-black text-[#0B3323] block mb-1">Slot B Player</label>
              <select
                value={participantB}
                onChange={(e) => setParticipantB(e.target.value)}
                className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2 focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">(Empty / TBD)</option>
                {allParticipants.map((p) => (
                  <option key={`b-${p.id}`} value={p.id}>
                    {p.username} {p.seed_number ? `(#${p.seed_number})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Scores & Status Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-black text-[#0B3323] block mb-1">Score A</label>
              <input
                type="number"
                min="0"
                value={scoreA}
                onChange={(e) => setScoreA(parseInt(e.target.value) || 0)}
                className="w-full text-xs font-mono font-bold bg-white border border-slate-200 rounded-xl p-2 text-center"
              />
            </div>

            <div>
              <label className="text-[11px] font-black text-[#0B3323] block mb-1">Score B</label>
              <input
                type="number"
                min="0"
                value={scoreB}
                onChange={(e) => setScoreB(parseInt(e.target.value) || 0)}
                className="w-full text-xs font-mono font-bold bg-white border border-slate-200 rounded-xl p-2 text-center"
              />
            </div>

            <div>
              <label className="text-[11px] font-black text-[#0B3323] block mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MatchStatus)}
                className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2 capitalize"
              >
                <option value="pending">Pending</option>
                <option value="ready">Ready</option>
                <option value="scheduled">Scheduled</option>
                <option value="live">Live</option>
                <option value="completed">Completed</option>
                <option value="walkover">Walkover</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Winner Selection */}
          {(status === 'completed' || status === 'walkover' || participantA || participantB) && (
            <div>
              <label className="text-[11px] font-black text-[#0B3323] block mb-1">Winner</label>
              <select
                value={winnerId}
                onChange={(e) => setWinnerId(e.target.value)}
                className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2"
              >
                <option value="">(No Winner Selected)</option>
                {participantA && (
                  <option value={participantA}>
                    Slot A: {allParticipants.find((p) => p.id === participantA)?.username || participantA}
                  </option>
                )}
                {participantB && (
                  <option value={participantB}>
                    Slot B: {allParticipants.find((p) => p.id === participantB)?.username || participantB}
                  </option>
                )}
              </select>
            </div>
          )}

          {/* Winner Destination Routing */}
          <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-200/80 space-y-3">
            <span className="text-[11px] font-black text-emerald-950 uppercase tracking-wider block">
              Winner Next-Round Routing
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Next Match</label>
                <select
                  value={nextMatchId}
                  onChange={(e) => setNextMatchId(e.target.value)}
                  className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2"
                >
                  <option value="">(None - Final Match)</option>
                  {candidateNextMatches.map((m) => (
                    <option key={`next-${m.id}`} value={m.id}>
                      Match #{m.match_position}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Next Match Slot</label>
                <select
                  value={winnerSlot}
                  onChange={(e) => setWinnerSlot(e.target.value as 'participant_a' | 'participant_b' | '')}
                  className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2"
                >
                  <option value="">(Not Set)</option>
                  <option value="participant_a">Slot A</option>
                  <option value="participant_b">Slot B</option>
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] font-black text-[#0B3323] block mb-1">Notes / Bye Label</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. BYE (Auto-Advance)"
              className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs font-bold">
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white">
              Save Match Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
