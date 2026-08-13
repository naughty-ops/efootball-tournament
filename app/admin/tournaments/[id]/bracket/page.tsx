'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  GitBranch,
  RotateCcw,
  RefreshCw,
  Zap,
  Users,
  Layers,
  Award,
  AlertCircle,
  Loader2,
  Edit2,
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  getTournamentBracket,
  generateKnockoutBracket,
  resetBracket,
  BracketOverview,
  FullMatchData,
} from '@/services/bracketService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmModal } from '@/components/ui/modal';
import { updateLiveScore, submitMatchResult, editMatchResult } from '@/services/matchService';
import { WinnerCelebrationOverlay } from '@/components/tournament/WinnerCelebrationOverlay';
import SymmetricalKnockoutBracket from '@/components/tournament/SymmetricalKnockoutBracket';
import dynamic from 'next/dynamic';

const ManualSlotOverrideModal = dynamic(
  () => import('@/components/admin/ManualSlotOverrideModal').then((mod) => mod.ManualSlotOverrideModal),
  { ssr: false }
);

const ScoreEntryModal = dynamic(
  () => import('@/components/match/ScoreEntryModal').then((mod) => mod.ScoreEntryModal),
  { ssr: false }
);

export default function AdminBracketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = use(params);

  const [overview, setOverview] = useState<BracketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active round tab for mobile view
  const [activeMobileRoundIdx, setActiveMobileRoundIdx] = useState(0);

  // Modals
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // Score Entry Modal State
  const [activeScoreMatch, setActiveScoreMatch] = useState<FullMatchData | null>(null);

  // Manual Slot Override State
  const [editingMatch, setEditingMatch] = useState<FullMatchData | null>(null);
  const [editingSlot, setEditingSlot] = useState<'participant_a' | 'participant_b' | null>(null);

  const fetchBracketData = useCallback(async () => {
    try {
      const data = await getTournamentBracket(tournamentId);
      setOverview(data);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load bracket data.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const data = await getTournamentBracket(tournamentId);
        if (isMounted) {
          setOverview(data);
          setError(null);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to load bracket data.';
          setError(msg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [tournamentId]);

  // Winner Celebration State
  const [showCelebration, setShowCelebration] = useState(false);

  const handleUpdateLiveScore = async (scoreA: number, scoreB: number) => {
    if (!activeScoreMatch) return;
    try {
      await updateLiveScore(activeScoreMatch.id, tournamentId, scoreA, scoreB);
      fetchBracketData();
    } catch (err: unknown) {
      console.error(err);
      throw err;
    }
  };

  const handleCompleteMatch = async (scoreA: number, scoreB: number) => {
    if (!activeScoreMatch) return;
    setActionLoading(true);
    const isFinalMatch = !activeScoreMatch.next_match_id && !activeScoreMatch.group_id;

    try {
      const isCompleted = activeScoreMatch.status === 'completed' || activeScoreMatch.status === 'walkover';
      if (isCompleted) {
        await editMatchResult(activeScoreMatch.id, tournamentId, {
          score_a: scoreA,
          score_b: scoreB,
          result_type: 'normal',
        });
      } else {
        await submitMatchResult(activeScoreMatch.id, tournamentId, {
          score_a: scoreA,
          score_b: scoreB,
          result_type: 'normal',
        });
      }
      setActiveScoreMatch(null);
      await fetchBracketData();

      if (isFinalMatch) {
        setShowCelebration(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save score result';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerate = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await generateKnockoutBracket(tournamentId);
      await fetchBracketData();
      setIsRegenerateModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bracket generation failed.';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReset = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await resetBracket(tournamentId);
      await fetchBracketData();
      setIsResetModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reset failed.';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#0B3323]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-xs font-semibold">Loading Tournament Bracket...</span>
        </div>
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold text-[#0B3323]">{error || 'Bracket Not Found'}</h2>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/tournaments">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tournaments
          </Link>
        </Button>
      </div>
    );
  }

  if (!overview) return null;

  const { tournament, participants, rounds, bracketSize, byesCount, totalRounds, status } = overview;
  const isKnockout = tournament.format === 'knockout';

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary -ml-2 mb-1">
            <Link href={`/admin/tournaments/${tournament.id}`}>
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Tournament Details</span>
            </Link>
          </Button>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
              Knockout Bracket
            </h1>
            <Badge
              variant={
                status === 'Generated'
                  ? 'efootball'
                  : status === 'In Progress'
                  ? 'secondary'
                  : status === 'Completed'
                  ? 'default'
                  : 'outline'
              }
              className="text-xs py-1 px-3 font-bold"
            >
              {status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Tournament: <span className="font-bold text-[#0B3323]">{tournament.name}</span>
          </p>
        </div>

        {/* Action Controls */}
        {isKnockout && (
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchBracketData}
              disabled={actionLoading}
              className="rounded-xl text-xs gap-1.5 font-semibold border-border"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </Button>

            {rounds.length === 0 ? (
              <Button
                onClick={handleGenerate}
                disabled={actionLoading || participants.length < 2}
                className="rounded-xl text-xs font-bold gap-2 shadow-md"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                <span>Generate Bracket</span>
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRegenerateModalOpen(true)}
                  disabled={actionLoading}
                  className="rounded-xl text-xs font-bold gap-1.5 border-primary text-primary hover:bg-primary hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Regenerate</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsResetModalOpen(true)}
                  disabled={actionLoading}
                  className="rounded-xl text-xs font-bold gap-1.5 border-destructive text-destructive hover:bg-destructive/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Format Guard Warning if not Knockout */}
      {!isKnockout && (
        <Card className="border-amber-500/30 bg-amber-500/10 p-6 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-extrabold text-sm">Knockout Bracket System Notice</h3>
              <p className="text-xs mt-1">
                This bracket system is currently available for knockout tournaments. Current tournament format: <strong className="uppercase">{tournament.format.replace('_', ' ')}</strong>.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Summary Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 bg-white border-border shadow-xs flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-primary shrink-0">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-semibold">Participants</p>
            <p className="text-lg font-extrabold text-[#0B3323]">{participants.length}</p>
          </div>
        </Card>

        <Card className="p-4 bg-white border-border shadow-xs flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-primary shrink-0">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-semibold">Bracket Size</p>
            <p className="text-lg font-extrabold text-[#0B3323]">{bracketSize}-Player</p>
          </div>
        </Card>

        <Card className="p-4 bg-white border-border shadow-xs flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-primary shrink-0">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-semibold">Byes Assigned</p>
            <p className="text-lg font-extrabold text-[#0B3323]">{byesCount} Byes</p>
          </div>
        </Card>

        <Card className="p-4 bg-white border-border shadow-xs flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-primary shrink-0">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-semibold">Total Rounds</p>
            <p className="text-lg font-extrabold text-[#0B3323]">{totalRounds} Rounds</p>
          </div>
        </Card>
      </div>

      {/* Error Message Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Bracket Content / Empty State */}
      {rounds.length === 0 ? (
        <Card className="border-dashed border-2 p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-primary mb-4">
            <GitBranch className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-[#0B3323]">Bracket Not Generated Yet</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-6">
            {participants.length < 2
              ? 'At least 2 participants are required to generate a knockout bracket. Add players first in Participant Management.'
              : `Ready to generate a ${bracketSize}-slot knockout bracket with ${byesCount} byes across ${totalRounds} rounds.`}
          </p>

          <Button
            onClick={handleGenerate}
            disabled={actionLoading || participants.length < 2 || !isKnockout}
            className="font-bold gap-2 rounded-xl"
          >
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            <span>Generate {bracketSize}-Player Bracket</span>
          </Button>
        </Card>
      ) : (
        <SymmetricalKnockoutBracket
          bracket={overview}
          isAdmin={true}
          onScoreMatch={(m) => setActiveScoreMatch(m)}
          onEditSlot={(m, slot) => {
            setEditingMatch(m);
            setEditingSlot(slot);
          }}
          onReopenCelebration={() => setShowCelebration(true)}
        />
      )}

      {/* Regenerate Confirmation Modal */}
      <ConfirmModal
        isOpen={isRegenerateModalOpen}
        onClose={() => setIsRegenerateModalOpen(false)}
        onConfirm={handleGenerate}
        title="Regenerate Bracket"
        description="Are you sure you want to regenerate the bracket? Unstarted match slots will be recalculated based on current participants and seed assignments."
        confirmText="Regenerate Bracket"
        variant="destructive"
        isLoading={actionLoading}
      />

      {/* Reset Confirmation Modal */}
      <ConfirmModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleReset}
        title="Reset Bracket"
        description="Are you sure you want to reset the bracket? All unstarted rounds and matches will be removed."
        confirmText="Reset Bracket"
        variant="destructive"
        isLoading={actionLoading}
      />

      {/* Manual Slot Override Modal */}
      <ManualSlotOverrideModal
        isOpen={Boolean(editingMatch && editingSlot)}
        onClose={() => {
          setEditingMatch(null);
          setEditingSlot(null);
        }}
        onSuccess={fetchBracketData}
        match={editingMatch}
        slotToEdit={editingSlot}
        allParticipants={participants}
      />

      {/* Quick Score Entry / Edit Modal */}
      {activeScoreMatch && (
        <ScoreEntryModal
          isOpen={Boolean(activeScoreMatch)}
          onClose={() => setActiveScoreMatch(null)}
          onUpdateLiveScore={handleUpdateLiveScore}
          onCompleteMatch={handleCompleteMatch}
          participantA={activeScoreMatch.participantAUser?.username || 'Player A'}
          participantB={activeScoreMatch.participantBUser?.username || 'Player B'}
          currentScoreA={activeScoreMatch.score_a}
          currentScoreB={activeScoreMatch.score_b}
          isLive={activeScoreMatch.status === 'live'}
          isGroupMatch={Boolean(activeScoreMatch.group_id)}
          isLoading={actionLoading}
        />
      )}

      {/* Winner Celebration Overlay */}
      {showCelebration && overview?.tournament && (
        <WinnerCelebrationOverlay
          isOpen={showCelebration}
          onClose={() => setShowCelebration(false)}
          tournamentName={overview.tournament.name}
          championName={overview.tournament.championUser?.username || 'Champion'}
          runnerUpName={overview.tournament.runnerUpUser?.username}
        />
      )}
    </div>
  );
}
