'use client';

import React, { useState } from 'react';
import { Trophy, RefreshCw, Save, RotateCcw, AlertCircle } from 'lucide-react';
import { BaseModal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { GroupStandingRow } from '@/lib/group/groupEngine';
import { saveStandingOverride, clearStandingOverride } from '@/services/groupService';
import { parseStandingOverrides, StandingOverride } from '@/lib/group/standingOverrideEngine';

interface EditPointsTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournamentId: string;
  rulesText?: string | null;
  standings: GroupStandingRow[];
  onSaved: () => void;
}

export function EditPointsTableModal({
  isOpen,
  onClose,
  tournamentId,
  rulesText,
  standings,
  onSaved,
}: EditPointsTableModalProps) {
  const currentOverrides = parseStandingOverrides(rulesText);

  const [selectedRow, setSelectedRow] = useState<GroupStandingRow | null>(null);
  const [played, setPlayed] = useState<number>(0);
  const [wins, setWins] = useState<number>(0);
  const [draws, setDraws] = useState<number>(0);
  const [losses, setLosses] = useState<number>(0);
  const [goalsFor, setGoalsFor] = useState<number>(0);
  const [goalsAgainst, setGoalsAgainst] = useState<number>(0);
  const [goalDifference, setGoalDifference] = useState<number>(0);
  const [points, setPoints] = useState<number>(0);
  const [reason, setReason] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectRow = (row: GroupStandingRow) => {
    setSelectedRow(row);
    const existing = currentOverrides[row.participant.id];
    setPlayed(existing?.played ?? row.played);
    setWins(existing?.wins ?? row.wins);
    setDraws(existing?.draws ?? row.draws);
    setLosses(existing?.losses ?? row.losses);
    setGoalsFor(existing?.goalsFor ?? row.goalsFor);
    setGoalsAgainst(existing?.goalsAgainst ?? row.goalsAgainst);
    setGoalDifference(existing?.goalDifference ?? row.goalDifference);
    setPoints(existing?.points ?? row.points);
    setReason(existing?.reason ?? '');
    setError(null);
  };

  const handleSave = async () => {
    if (!selectedRow) return;
    setLoading(true);
    setError(null);
    try {
      const override: StandingOverride = {
        participantId: selectedRow.participant.id,
        played: Number(played),
        wins: Number(wins),
        draws: Number(draws),
        losses: Number(losses),
        goalsFor: Number(goalsFor),
        goalsAgainst: Number(goalsAgainst),
        goalDifference: Number(goalDifference),
        points: Number(points),
        reason: reason.trim() || 'Admin manual correction',
      };

      await saveStandingOverride(tournamentId, override);
      onSaved();
      setSelectedRow(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save standing correction');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (participantId: string) => {
    setLoading(true);
    setError(null);
    try {
      await clearStandingOverride(tournamentId, participantId);
      onSaved();
      if (selectedRow?.participant.id === participantId) {
        setSelectedRow(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset standing correction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Points Table / Manual Standings Override"
      description="Manually correct points, goals, or record adjustments for exceptional administrative fixes. Changes reflect immediately across User and Admin views."
    >
      <div className="space-y-4 pt-2">
        {error && (
          <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Table Selection List */}
        <div className="border border-border rounded-xl overflow-hidden bg-white">
          <div className="p-3 bg-[#F4F8F5] border-b border-border flex items-center justify-between">
            <span className="text-xs font-extrabold text-[#0B3323] uppercase tracking-wider flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-amber-500" />
              <span>Current Leaderboard Standings</span>
            </span>
            <span className="text-[10px] text-muted-foreground font-semibold">
              Click a player to edit row values
            </span>
          </div>

          <div className="max-h-56 overflow-y-auto no-scrollbar">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40 sticky top-0">
                <tr className="border-b border-border">
                  <th className="text-left p-2 font-bold text-[#0B3323]">Player</th>
                  <th className="p-2 text-center text-muted-foreground">P</th>
                  <th className="p-2 text-center text-emerald-600">W</th>
                  <th className="p-2 text-center text-amber-600">D</th>
                  <th className="p-2 text-center text-red-500">L</th>
                  <th className="p-2 text-center text-muted-foreground">GF</th>
                  <th className="p-2 text-center text-muted-foreground">GA</th>
                  <th className="p-2 text-center text-muted-foreground">GD</th>
                  <th className="p-2 text-center text-[#0B3323]">PTS</th>
                  <th className="p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row) => {
                  const hasOverride = !!currentOverrides[row.participant.id];
                  const isSelected = selectedRow?.participant.id === row.participant.id;
                  return (
                    <tr
                      key={row.participant.id}
                      onClick={() => handleSelectRow(row)}
                      className={`border-b border-border/40 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-primary/15 font-bold'
                          : hasOverride
                          ? 'bg-amber-50/80 hover:bg-amber-100/60'
                          : 'hover:bg-[#F4F8F5]'
                      }`}
                    >
                      <td className="p-2 font-semibold text-[#0B3323]">
                        {row.participant.username}
                      </td>
                      <td className="p-2 text-center">{row.played}</td>
                      <td className="p-2 text-center text-emerald-600 font-semibold">{row.wins}</td>
                      <td className="p-2 text-center text-amber-600 font-semibold">{row.draws}</td>
                      <td className="p-2 text-center text-red-500 font-semibold">{row.losses}</td>
                      <td className="p-2 text-center">{row.goalsFor}</td>
                      <td className="p-2 text-center">{row.goalsAgainst}</td>
                      <td className="p-2 text-center font-bold">{row.goalDifference}</td>
                      <td className="p-2 text-center font-black text-[#0B3323]">{row.points}</td>
                      <td className="p-2 text-center">
                        {hasOverride ? (
                          <Badge className="bg-amber-500 text-white text-[9px] font-black">
                            EDITED
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Auto</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Row Editor Form */}
        {selectedRow && (
          <div className="p-4 rounded-xl border border-primary/30 bg-[#F4F8F5] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#0B3323] uppercase">
                Editing: {selectedRow.participant.username}
              </span>
              {currentOverrides[selectedRow.participant.id] && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReset(selectedRow.participant.id)}
                  disabled={loading}
                  className="h-7 text-[10px] font-bold border-amber-600 text-amber-800 gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset to Auto-Calculation</span>
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="font-bold text-muted-foreground block mb-1">Played (P)</label>
                <Input
                  type="number"
                  value={played}
                  onChange={(e) => setPlayed(Number(e.target.value))}
                  className="h-8 text-xs font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-emerald-600 block mb-1">Wins (W)</label>
                <Input
                  type="number"
                  value={wins}
                  onChange={(e) => setWins(Number(e.target.value))}
                  className="h-8 text-xs font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-amber-600 block mb-1">Draws (D)</label>
                <Input
                  type="number"
                  value={draws}
                  onChange={(e) => setDraws(Number(e.target.value))}
                  className="h-8 text-xs font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-red-500 block mb-1">Losses (L)</label>
                <Input
                  type="number"
                  value={losses}
                  onChange={(e) => setLosses(Number(e.target.value))}
                  className="h-8 text-xs font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-muted-foreground block mb-1">Goals For (GF)</label>
                <Input
                  type="number"
                  value={goalsFor}
                  onChange={(e) => {
                    const gfVal = Number(e.target.value);
                    setGoalsFor(gfVal);
                    setGoalDifference(gfVal - goalsAgainst);
                  }}
                  className="h-8 text-xs font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-muted-foreground block mb-1">Goals Against (GA)</label>
                <Input
                  type="number"
                  value={goalsAgainst}
                  onChange={(e) => {
                    const gaVal = Number(e.target.value);
                    setGoalsAgainst(gaVal);
                    setGoalDifference(goalsFor - gaVal);
                  }}
                  className="h-8 text-xs font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-muted-foreground block mb-1">Goal Difference (GD)</label>
                <Input
                  type="number"
                  value={goalDifference}
                  onChange={(e) => setGoalDifference(Number(e.target.value))}
                  className="h-8 text-xs font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-primary block mb-1">Points (PTS)</label>
                <Input
                  type="number"
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value))}
                  className="h-8 text-xs font-black text-[#0B3323]"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-muted-foreground block mb-1 text-[11px]">
                Reason for Manual Correction (Optional)
              </label>
              <Input
                placeholder="e.g. Administrative 1pt penalty or score correction"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-8 text-xs bg-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={loading}
                className="font-bold text-xs gap-1.5 bg-primary text-white"
              >
                {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                <span>Save Correction to Single Source of Truth</span>
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose} className="font-bold text-xs">
            Close
          </Button>
        </div>
      </div>
    </BaseModal>
  );
}
