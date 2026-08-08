'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Swords,
  Trophy,
  Clock,
  Radio,
  AlertCircle,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Save,
  Check,
} from 'lucide-react';
import {
  getMatchDetails,
  submitMatchResult,
  editMatchResult,
  updateMatchStatus,
  updateLiveScore,
  MatchDetailsOverview,
} from '@/services/matchService';
import { formatDate } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MatchResultModal } from '@/components/admin/MatchResultModal';

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function MatchDetailsPage({
  params,
}: {
  params: Promise<{ id: string; matchId: string }>;
}) {
  const { id: tournamentId, matchId } = use(params);

  const [details, setDetails] = useState<MatchDetailsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Status Action Loading
  const [statusLoading, setStatusLoading] = useState(false);

  // Live Score State & Auto-Save
  const [scoreA, setScoreA] = useState<number>(0);
  const [scoreB, setScoreB] = useState<number>(0);
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>('idle');

  // Result Mode State
  const [resultType, setResultType] = useState<'normal' | 'walkover' | 'disqualification'>('normal');
  const [walkoverWinnerId, setWalkoverWinnerId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Complete Confirmation Modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Completed Mode Toggle
  const [isEditMode, setIsEditMode] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await getMatchDetails(matchId, tournamentId);
      setDetails(data);
      setScoreA(data.match.score_a || 0);
      setScoreB(data.match.score_b || 0);
      setResultType(data.match.status === 'walkover' ? 'walkover' : 'normal');
      setWalkoverWinnerId(data.match.winner_id || '');
      setNotes(data.match.notes || '');
      setErrorMessage(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load match details.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, [matchId, tournamentId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await loadData();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  // Live Score Auto-Save Effect (Debounced ~400ms when match is LIVE)
  useEffect(() => {
    if (!details || details.match.status !== 'live' || resultType !== 'normal') {
      return;
    }

    // Skip if values match what is already saved in details
    if (scoreA === details.match.score_a && scoreB === details.match.score_b) {
      return;
    }

    if (scoreA < 0 || scoreB < 0 || isNaN(scoreA) || isNaN(scoreB)) {
      return;
    }

    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const updated = await updateLiveScore(matchId, tournamentId, scoreA, scoreB);
        setDetails(updated);
        setSaveStatus('saved');
        setErrorMessage(null);
      } catch (err: unknown) {
        setSaveStatus('error');
        const msg = err instanceof Error ? err.message : 'Unable to save score';
        setErrorMessage(`Auto-save failed: ${msg}`);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [scoreA, scoreB, details, resultType, matchId, tournamentId]);

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#0B3323]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-xs font-semibold">Loading Match Details...</span>
        </div>
      </div>
    );
  }

  if (errorMessage && !details) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold text-[#0B3323]">{errorMessage || 'Match Not Found'}</h2>
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/tournaments/${tournamentId}/matches`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Matches
          </Link>
        </Button>
      </div>
    );
  }

  if (!details) return null;

  const { match, round } = details;
  const playerA = match.participantAUser;
  const playerB = match.participantBUser;
  const winner = match.winnerUser;

  const isCompleted = match.status === 'completed' || match.status === 'walkover';
  const isLive = match.status === 'live';
  const isPending = match.status === 'pending';
  const isGroupMatch = Boolean(match.group_id);
  const isReadyToPlay = Boolean(playerA && playerB);

  // Toggle Start Match (Pending -> Live)
  const handleStartMatch = async () => {
    setStatusLoading(true);
    setErrorMessage(null);
    try {
      const updated = await updateMatchStatus(matchId, tournamentId, 'live');
      setDetails(updated);
      setSaveStatus('saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start match';
      setErrorMessage(msg);
    } finally {
      setStatusLoading(false);
    }
  };

  // Toggle Set Pending (Live -> Pending)
  const handleSetPending = async () => {
    setStatusLoading(true);
    setErrorMessage(null);
    try {
      const updated = await updateMatchStatus(matchId, tournamentId, 'pending');
      setDetails(updated);
      setSaveStatus('idle');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset match status';
      setErrorMessage(msg);
    } finally {
      setStatusLoading(false);
    }
  };

  // Open Completion Modal with validation
  const handleOpenCompleteModal = () => {
    setErrorMessage(null);

    if (resultType === 'normal') {
      if (scoreA < 0 || scoreB < 0 || isNaN(scoreA) || isNaN(scoreB)) {
        setErrorMessage('Please enter valid non-negative score numbers.');
        return;
      }
      if (!isGroupMatch && scoreA === scoreB) {
        setErrorMessage('Knockout matches require a winner. Scores cannot be equal.');
        return;
      }
    } else if (!walkoverWinnerId) {
      setErrorMessage('Please select an advancing winner for walkover/disqualification.');
      return;
    }

    setIsConfirmModalOpen(true);
  };

  // Complete Match Action (Live/Edit -> Completed)
  const handleConfirmComplete = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const inputData = {
      score_a: scoreA,
      score_b: scoreB,
      result_type: resultType,
      walkover_winner_id: walkoverWinnerId || null,
      notes: notes.trim(),
    };

    try {
      let updated: MatchDetailsOverview;
      if (isCompleted) {
        updated = await editMatchResult(matchId, tournamentId, inputData);
      } else {
        updated = await submitMatchResult(matchId, tournamentId, inputData);
      }
      setDetails(updated);
      setSuccessMessage('Match completed! Final result saved and winner advanced.');
      setIsConfirmModalOpen(false);
      setIsEditMode(false);
      setSaveStatus('idle');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to complete match.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine winner name for modal preview
  let modalWinnerName = 'TBD';
  if (resultType === 'normal') {
    if (scoreA > scoreB && playerA) modalWinnerName = playerA.username;
    else if (scoreB > scoreA && playerB) modalWinnerName = playerB.username;
    else if (scoreA === scoreB && isGroupMatch) modalWinnerName = 'Draw (1 Point Each)';
  } else if (walkoverWinnerId) {
    if (walkoverWinnerId === playerA?.id) modalWinnerName = playerA.username;
    if (walkoverWinnerId === playerB?.id) modalWinnerName = playerB.username;
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto pb-12">
      {/* Back Link & Header */}
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary -ml-2 mb-1">
          <Link href={`/admin/tournaments/${tournamentId}/matches`}>
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Matches</span>
          </Link>
        </Button>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
              Match #{match.match_position} Details
            </h1>
            <p className="text-xs text-muted-foreground">
              Round: <span className="font-bold text-[#0B3323]">{round.name}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant={
                isLive
                  ? 'destructive'
                  : isCompleted
                  ? 'default'
                  : 'secondary'
              }
              className="capitalize font-bold text-xs py-1 px-3"
            >
              {isLive && <Radio className="h-3.5 w-3.5 mr-1 animate-pulse" />}
              {match.status}
            </Badge>

            {isPending && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartMatch}
                disabled={statusLoading || !isReadyToPlay}
                className="rounded-xl text-xs font-bold text-rose-700 border-rose-300 hover:bg-rose-50 gap-1.5"
              >
                <Radio className="h-3.5 w-3.5" />
                Start Match
              </Button>
            )}

            {isLive && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSetPending}
                disabled={statusLoading}
                className="rounded-xl text-xs font-semibold"
              >
                Set Pending
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Success & Error Banners */}
      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="h-4.5 w-4.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Match Overview Card */}
      <Card className="border-border bg-[#F4F8F5] shadow-xs p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h3 className="text-base font-extrabold text-[#0B3323] flex items-center gap-2">
            <Swords className="h-4 w-4 text-primary" />
            <span>Fixtures & Contestants</span>
          </h3>
          {match.scheduled_time && (
            <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDate(match.scheduled_time)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Participant A */}
          <div className="p-4 rounded-2xl bg-white border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Slot A</span>
              {playerA?.seed_number && (
                <Badge variant="efootball" className="font-mono text-xs">#{playerA.seed_number}</Badge>
              )}
            </div>
            <p className="text-base font-extrabold text-[#0B3323] truncate">
              {playerA ? playerA.username : 'Waiting for opponent...'}
            </p>
            {playerA?.real_name && (
              <p className="text-xs text-muted-foreground">{playerA.real_name}</p>
            )}
          </div>

          {/* Participant B */}
          <div className="p-4 rounded-2xl bg-white border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Slot B</span>
              {playerB?.seed_number && (
                <Badge variant="efootball" className="font-mono text-xs">#{playerB.seed_number}</Badge>
              )}
            </div>
            <p className="text-base font-extrabold text-[#0B3323] truncate">
              {playerB ? playerB.username : 'Waiting for opponent...'}
            </p>
            {playerB?.real_name && (
              <p className="text-xs text-muted-foreground">{playerB.real_name}</p>
            )}
          </div>
        </div>

        {/* Current Winner Display if completed */}
        {isCompleted && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between font-bold">
            <div className="flex items-center gap-2">
              <Trophy className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
              <span>
                Final Result: {playerA?.username} {match.score_a} — {match.score_b} {playerB?.username}
                {winner ? ` (Winner: ${winner.username})` : ' (Draw)'}
              </span>
            </div>
            <Badge variant="default" className="bg-emerald-600 text-white text-[10px]">
              Completed ✓
            </Badge>
          </div>
        )}
      </Card>

      {/* Downstream Editing Warning if completed */}
      {isCompleted && isEditMode && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs font-semibold flex items-start gap-2.5">
          <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong className="block font-bold">High-Risk Operation: Editing Completed Match Result</strong>
            <span>
              Changing the score or winner of a completed match will automatically recalculate downstream bracket advancement into the next round, provided the next-round match has not completed yet.
            </span>
          </div>
        </div>
      )}

      {/* Main Score Control Panel */}
      <Card className="border-border bg-white shadow-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">
              {isLive
                ? 'Live Score Management'
                : isCompleted
                ? 'Official Match Result'
                : 'Match Score Controls'}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {isLive
                ? 'Scores auto-save automatically. Tap "Complete Match" to finalize official result.'
                : isCompleted
                ? 'This match is completed and read-only.'
                : 'Start match to begin live score updates.'}
            </CardDescription>
          </div>

          {/* Live Auto-Save Status Badge */}
          {isLive && resultType === 'normal' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F4F8F5] border border-border text-xs font-bold">
              {saveStatus === 'saving' && (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                  <span className="text-amber-700">Saving...</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Saved ✓</span>
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-destructive">Unable to save</span>
                </>
              )}
              {saveStatus === 'idle' && (
                <>
                  <Save className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Ready</span>
                </>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-6">
          {!isReadyToPlay ? (
            <div className="p-4 rounded-2xl bg-secondary/40 border border-border text-xs text-muted-foreground text-center font-medium">
              Waiting for previous round matches to complete. Score entry will become available once both players advance to this fixture.
            </div>
          ) : isCompleted && !isEditMode ? (
            /* Completed Read-Only State */
            <div className="space-y-6">
              <div className="flex items-center justify-center gap-6 py-6 bg-[#F4F8F5] rounded-2xl border border-border">
                <div className="text-center">
                  <p className="text-xs font-bold text-muted-foreground mb-1">{playerA?.username}</p>
                  <p className="text-4xl font-black text-[#0B3323]">{match.score_a}</p>
                </div>
                <span className="text-2xl font-black text-muted-foreground/40">—</span>
                <div className="text-center">
                  <p className="text-xs font-bold text-muted-foreground mb-1">{playerB?.username}</p>
                  <p className="text-4xl font-black text-[#0B3323]">{match.score_b}</p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditMode(true)}
                  className="rounded-xl text-xs font-bold"
                >
                  Edit Result
                </Button>
              </div>
            </div>
          ) : (
            /* Active Live / Edit Form */
            <div className="space-y-6">
              {/* Result Mode Tabs */}
              <div className="flex items-center gap-2 bg-[#F4F8F5] p-1.5 rounded-2xl border border-border">
                <button
                  type="button"
                  onClick={() => setResultType('normal')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    resultType === 'normal'
                      ? 'bg-white text-[#0B3323] shadow-xs'
                      : 'text-muted-foreground hover:text-[#0B3323]'
                  }`}
                >
                  Normal Match
                </button>
                <button
                  type="button"
                  onClick={() => setResultType('walkover')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    resultType === 'walkover'
                      ? 'bg-white text-[#0B3323] shadow-xs'
                      : 'text-muted-foreground hover:text-[#0B3323]'
                  }`}
                >
                  Walkover
                </button>
                <button
                  type="button"
                  onClick={() => setResultType('disqualification')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    resultType === 'disqualification'
                      ? 'bg-white text-[#0B3323] shadow-xs'
                      : 'text-muted-foreground hover:text-[#0B3323]'
                  }`}
                >
                  Disqualification
                </button>
              </div>

              {/* Mode A: Live / Normal Scores */}
              {resultType === 'normal' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-[#0B3323] block mb-1.5 truncate">
                        {playerA?.username} Score
                      </label>
                      <Input
                        type="number"
                        min={0}
                        value={scoreA}
                        onChange={(e) => setScoreA(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="text-2xl font-mono font-black text-center h-14"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[#0B3323] block mb-1.5 truncate text-right">
                        {playerB?.username} Score
                      </label>
                      <Input
                        type="number"
                        min={0}
                        value={scoreB}
                        onChange={(e) => setScoreB(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="text-2xl font-mono font-black text-center h-14"
                      />
                    </div>
                  </div>

                  {/* Draw Indicator / Warning */}
                  {scoreA === scoreB && (
                    isGroupMatch ? (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs font-semibold flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-amber-600 shrink-0" />
                        <span>Group Match Draw — Both contestants will receive 1 point when completed.</span>
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>Knockout matches require a winner. Resolve tie score before completing.</span>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Mode B/C: Walkover / Disqualification Selector */}
              {(resultType === 'walkover' || resultType === 'disqualification') && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#0B3323] block">
                    Select Advancing Winner
                  </label>
                  <select
                    value={walkoverWinnerId}
                    onChange={(e) => setWalkoverWinnerId(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-border bg-white text-xs font-semibold text-[#0B3323]"
                  >
                    <option value="">-- Select Winner --</option>
                    {playerA && <option value={playerA.id}>{playerA.username} (Slot A)</option>}
                    {playerB && <option value={playerB.id}>{playerB.username} (Slot B)</option>}
                  </select>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-[#0B3323] block mb-1">
                  Administrative Match Notes (Private)
                </label>
                <Input
                  placeholder="e.g. Disconnection reason, technical issue, penalty decision..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-border flex items-center justify-between flex-wrap gap-3">
                {isEditMode ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditMode(false);
                      loadData();
                    }}
                    className="rounded-xl text-xs"
                  >
                    Cancel Edit
                  </Button>
                ) : isPending ? (
                  <Button
                    type="button"
                    onClick={handleStartMatch}
                    disabled={statusLoading}
                    className="font-bold rounded-xl px-6 gap-2 bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    <Radio className="h-4 w-4" />
                    <span>Start Match</span>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground italic">
                    Score changes auto-save instantly.
                  </span>
                )}

                {(isLive || isEditMode) && (
                  <Button
                    type="button"
                    onClick={handleOpenCompleteModal}
                    disabled={!isGroupMatch && resultType === 'normal' && scoreA === scoreB}
                    className="font-bold rounded-xl px-6 gap-2 bg-primary text-white shadow-md"
                  >
                    <Trophy className="h-4 w-4" />
                    <span>Complete Match</span>
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Complete Match Confirmation Modal */}
      <MatchResultModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleConfirmComplete}
        match={match}
        scoreA={scoreA}
        scoreB={scoreB}
        winnerName={modalWinnerName}
        resultType={resultType}
        isLoading={isSubmitting}
      />
    </div>
  );
}
