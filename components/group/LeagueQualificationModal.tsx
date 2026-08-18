'use client';

import React, { useState } from 'react';
import { Trophy, CheckCircle2, Lock, Unlock, AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { BaseModal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { GroupStandingRow } from '@/lib/group/groupEngine';
import { createClient } from '@/lib/supabase/client';

interface LeagueQualificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournamentId: string;
  standings: GroupStandingRow[];
  currentQualifiersCount: number;
  isLocked: boolean;
  onSaved: () => void;
}

export function LeagueQualificationModal({
  isOpen,
  onClose,
  tournamentId,
  standings,
  currentQualifiersCount,
  isLocked,
  onSaved,
}: LeagueQualificationModalProps) {
  const [qualifiersCount, setQualifiersCount] = useState<number>(currentQualifiersCount || 8);
  const [manualOverrides, setManualOverrides] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<'configure' | 'confirm'>('configure');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute qualification status for each participant
  const currentSelections = standings.map((row, idx) => {
    const pId = row.participant.id;
    const isAutoQualified = idx < qualifiersCount;
    const isQualified = manualOverrides[pId] !== undefined ? manualOverrides[pId] : isAutoQualified;
    return {
      row,
      rank: idx + 1,
      isQualified,
    };
  });

  const qualifiedList = currentSelections.filter((item) => item.isQualified);
  const nonQualifiedList = currentSelections.filter((item) => !item.isQualified);

  const handleToggleParticipant = (pId: string, currentVal: boolean) => {
    if (isLocked) return;
    setManualOverrides((prev) => ({
      ...prev,
      [pId]: !currentVal,
    }));
  };

  const handleAutoSelect = () => {
    setManualOverrides({});
  };

  const handleSaveAndLock = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      // Update qualifiers_per_group and lock qualification status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (supabase.from('tournaments') as any)
        .update({
          qualifiers_per_group: qualifiersCount,
          is_group_stage_finalized: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tournamentId);

      if (updateErr) throw new Error(updateErr.message || 'Failed to update qualification status.');

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save qualification status.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      // Unlock qualification status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (supabase.from('tournaments') as any)
        .update({
          is_group_stage_finalized: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tournamentId);

      if (updateErr) throw new Error(updateErr.message || 'Failed to unlock qualification status.');

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to unlock qualification status.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="League Qualification Admin Controls"
      description="Configure league qualification cutoffs, auto-select top ranks, or manually set qualifiers. Locking qualification marks final ranks without creating any knockout bracket."
    >
      <div className="space-y-4 pt-2">
        {error && (
          <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === 'configure' ? (
          <>
            {/* Top Config Controls */}
            <div className="p-4 rounded-xl border border-border bg-[#F4F8F5] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <label className="text-xs font-extrabold text-[#0B3323] block mb-1">
                    Qualification Cutoff (Top N Players)
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={standings.length}
                      value={qualifiersCount}
                      onChange={(e) => {
                        setQualifiersCount(Math.max(1, Number(e.target.value)));
                        setManualOverrides({});
                      }}
                      disabled={isLocked}
                      className="w-28 h-8 text-xs font-black bg-white"
                    />
                    <div className="flex gap-1">
                      {[4, 6, 8, 16].map((num) => (
                        <Button
                          key={num}
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setQualifiersCount(num);
                            setManualOverrides({});
                          }}
                          disabled={isLocked || num > standings.length}
                          className={`h-8 px-2 text-[11px] font-bold ${
                            qualifiersCount === num ? 'bg-primary text-white border-primary' : 'bg-white'
                          }`}
                        >
                          Top {num}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAutoSelect}
                    disabled={isLocked}
                    className="h-8 text-xs font-bold gap-1 border-emerald-600 text-emerald-800 bg-emerald-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-emerald-700" />
                    <span>Auto-Select Top {qualifiersCount}</span>
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                <span className="font-semibold text-muted-foreground">
                  Selected Qualifiers: <strong className="text-emerald-700 font-bold">{qualifiedList.length}</strong> / {standings.length} Players
                </span>
                {isLocked ? (
                  <Badge className="bg-emerald-600 text-white font-bold gap-1">
                    <Lock className="h-3 w-3" /> Qualification Locked
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-700 border-amber-300 font-bold gap-1">
                    <Unlock className="h-3 w-3" /> Unlocked (Draft)
                  </Badge>
                )}
              </div>
            </div>

            {/* Standings Table with Toggle Controls */}
            <div className="border border-border rounded-xl overflow-hidden bg-white max-h-72 overflow-y-auto no-scrollbar">
              <table className="w-full text-xs">
                <thead className="bg-[#F4F8F5] sticky top-0 border-b border-border">
                  <tr>
                    <th className="text-left p-2.5 font-bold text-[#0B3323]">Rank</th>
                    <th className="text-left p-2.5 font-bold text-[#0B3323]">Player</th>
                    <th className="p-2.5 text-center text-muted-foreground">P</th>
                    <th className="p-2.5 text-center text-primary font-bold">PTS</th>
                    <th className="p-2.5 text-center text-muted-foreground">GD</th>
                    <th className="p-2.5 text-center font-bold text-[#0B3323]">Qualification Status</th>
                  </tr>
                </thead>
                <tbody>
                  {currentSelections.map(({ row, rank, isQualified }) => (
                    <tr
                      key={row.participant.id}
                      className={`border-b border-border/40 transition-colors ${
                        isQualified ? 'bg-emerald-50/50 font-semibold' : 'hover:bg-[#F4F8F5]'
                      }`}
                    >
                      <td className="p-2.5 text-center font-black text-[#0B3323] w-12">
                        {rank === 1 ? '🏆 1' : rank}
                      </td>
                      <td className="p-2.5 font-bold text-[#0B3323]">{row.participant.username}</td>
                      <td className="p-2.5 text-center text-muted-foreground">{row.played}</td>
                      <td className="p-2.5 text-center font-black text-[#0B3323]">{row.points}</td>
                      <td className="p-2.5 text-center font-bold">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                      <td className="p-2.5 text-center">
                        <Button
                          type="button"
                          size="sm"
                          variant={isQualified ? 'default' : 'outline'}
                          onClick={() => handleToggleParticipant(row.participant.id, isQualified)}
                          disabled={isLocked}
                          className={`h-7 px-3 text-[10px] font-bold rounded-lg ${
                            isQualified ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'text-slate-500'
                          }`}
                        >
                          {isQualified ? '🟢 Qualified' : '⚪ Non-Qualified'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={onClose} className="font-bold text-xs">
                Close
              </Button>

              {isLocked ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleUnlock}
                  disabled={loading}
                  className="font-bold text-xs border-amber-600 text-amber-800 bg-amber-50 hover:bg-amber-100 gap-1.5"
                >
                  <Unlock className="h-3.5 w-3.5" />
                  <span>Unlock Qualification Status</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setStep('confirm')}
                  disabled={loading || qualifiedList.length === 0}
                  className="font-bold text-xs bg-primary text-white gap-1.5 shadow-sm"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Review & Lock Qualification</span>
                </Button>
              )}
            </div>
          </>
        ) : (
          /* Confirmation Screen */
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-50 text-amber-950 space-y-2">
              <h4 className="text-xs font-black uppercase flex items-center gap-1.5 text-amber-900">
                <Trophy className="h-4 w-4 text-amber-600" />
                <span>Confirm Final League Qualification Status</span>
              </h4>
              <p className="text-xs text-amber-900/90 leading-relaxed">
                Please review the finalized qualification summary. Once confirmed, qualification status will be locked. <strong>No playoff bracket or knockout matches will be created.</strong>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl border border-emerald-300 bg-emerald-50/60 space-y-1.5">
                <span className="font-extrabold text-emerald-900 block uppercase tracking-wider text-[10px]">
                  Qualified Players ({qualifiedList.length})
                </span>
                <ul className="space-y-1 max-h-36 overflow-y-auto font-semibold text-emerald-950 text-[11px]">
                  {qualifiedList.map(({ row, rank }) => (
                    <li key={row.participant.id} className="flex items-center justify-between border-b border-emerald-200/50 pb-0.5">
                      <span>#{rank} {row.participant.username}</span>
                      <span className="font-mono font-bold text-[#0B3323]">{row.points} pts</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
                <span className="font-extrabold text-slate-700 block uppercase tracking-wider text-[10px]">
                  Non-Qualified Players ({nonQualifiedList.length})
                </span>
                <ul className="space-y-1 max-h-36 overflow-y-auto text-slate-600 text-[11px]">
                  {nonQualifiedList.map(({ row, rank }) => (
                    <li key={row.participant.id} className="flex items-center justify-between border-b border-slate-200/50 pb-0.5">
                      <span>#{rank} {row.participant.username}</span>
                      <span className="font-mono font-semibold">{row.points} pts</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep('configure')}
                disabled={loading}
                className="font-bold text-xs"
              >
                Back to Edit
              </Button>

              <Button
                size="sm"
                onClick={handleSaveAndLock}
                disabled={loading}
                className="font-bold text-xs bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5 shadow-sm"
              >
                {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                <span>Confirm & Lock Qualification Status</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
}
