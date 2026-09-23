'use client';

import React, { useState } from 'react';
import { X, Plus, Trash2, Layers, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DraftRoundNode } from '@/types/database';

interface RoundManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  rounds: DraftRoundNode[];
  onAddRound: (roundName: string) => void;
  onRenameRound: (roundId: string, newName: string) => void;
  onDeleteRound: (roundId: string) => void;
  onAddMatchToRound: (roundId: string) => void;
}

export function RoundManagerModal({
  isOpen,
  onClose,
  rounds,
  onAddRound,
  onRenameRound,
  onDeleteRound,
  onAddMatchToRound,
}: RoundManagerModalProps) {
  const [newRoundName, setNewRoundName] = useState('');
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  if (!isOpen) return null;

  const handleAddRoundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newRoundName.trim().length === 0) return;
    onAddRound(newRoundName.trim());
    setNewRoundName('');
  };

  const startEditing = (r: DraftRoundNode) => {
    setEditingRoundId(r.id);
    setEditingName(r.name);
  };

  const saveEditing = (rId: string) => {
    if (editingName.trim().length > 0) {
      onRenameRound(rId, editingName.trim());
    }
    setEditingRoundId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />

      {/* Modal Content */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 z-10 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#0B3323]">Manage Knockout Rounds</h3>
              <p className="text-xs text-slate-500 font-semibold">Add, rename, or structure rounds & matches</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-[#0B3323] p-1.5 rounded-xl">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Existing Rounds List */}
        <div className="space-y-3 max-h-60 overflow-y-auto no-scrollbar pr-1">
          {rounds.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200"
            >
              {editingRoundId === r.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="text-xs font-bold bg-white border border-slate-300 rounded-xl px-2 py-1 flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => saveEditing(r.id)}
                    className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-[#0B3323] uppercase tracking-wider">{r.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">({r.matches.length} Matches)</span>
                </div>
              )}

              <div className="flex items-center gap-1">
                {editingRoundId !== r.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEditing(r)}
                    className="h-7 px-2 text-[10px] font-bold text-slate-600 hover:bg-slate-200"
                  >
                    Rename
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAddMatchToRound(r.id)}
                  className="h-7 px-2 text-[10px] font-bold text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                >
                  <Plus className="h-3 w-3 mr-0.5" />
                  Match
                </Button>

                {rounds.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteRound(r.id)}
                    className="h-7 px-2 text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add New Round Form */}
        <form onSubmit={handleAddRoundSubmit} className="pt-3 border-t border-slate-100 flex items-center gap-2">
          <input
            type="text"
            placeholder="New Round Name (e.g. Round of 16)"
            value={newRoundName}
            onChange={(e) => setNewRoundName(e.target.value)}
            className="flex-1 text-xs font-bold bg-white border border-slate-200 rounded-xl p-2 focus:ring-2 focus:ring-emerald-500"
          />
          <Button type="submit" className="rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
            <Plus className="h-4 w-4" />
            <span>Add Round</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
