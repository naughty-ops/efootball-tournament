'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  Radio,
  AlertCircle,
  Loader2,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  getAllAdminMatches,
  startMatch,
  updateLiveScore,
  submitMatchResult,
  MatchWithDetails,
} from '@/services/matchService';
import { formatDate } from '@/lib/utils';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScoreEntryModal } from '@/components/match/ScoreEntryModal';
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches';

export default function SingleMatchCenterPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = use(params);

  const [matchData, setMatchData] = useState<MatchWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Score Modal
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    try {
      const all = await getAllAdminMatches();
      const found = all.find((m) => m.id === matchId);
      if (found) {
        setMatchData(found);
        setError(null);
      } else {
        setError('Match not found.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load match details.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const all = await getAllAdminMatches();
        const found = all.find((m) => m.id === matchId);
        if (isMounted) {
          if (found) {
            setMatchData(found);
            setError(null);
          } else {
            setError('Match not found.');
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to load match details.';
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
  }, [matchId]);

  // Realtime subscription
  useRealtimeMatches(loadData);

  const handleStart = async () => {
    if (!matchData) return;
    setActionLoading(true);
    try {
      await startMatch(matchData.id, matchData.tournamentId);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start match';
      alert(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateLiveScore = async (scoreA: number, scoreB: number) => {
    if (!matchData) return;
    try {
      await updateLiveScore(matchData.id, matchData.tournamentId, scoreA, scoreB);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update live score';
      console.error(msg);
      throw err;
    }
  };

  const handleCompleteMatch = async (scoreA: number, scoreB: number) => {
    if (!matchData) return;
    setActionLoading(true);
    try {
      await submitMatchResult(matchData.id, matchData.tournamentId, {
        score_a: scoreA,
        score_b: scoreB,
        result_type: 'normal',
      });
      setIsScoreModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to complete match';
      alert(msg);
    } finally {
      setActionLoading(false);
    }
  };

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

  if (error || !matchData) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold text-[#0B3323]">{error || 'Match Not Found'}</h2>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/matches">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Match Center
          </Link>
        </Button>
      </div>
    );
  }

  const isCompleted = matchData.status === 'completed' || matchData.status === 'walkover';
  const isLive = matchData.status === 'live';
  const isScheduled = matchData.status === 'pending';
  const isLocked = Boolean(matchData.group_id && matchData.isGroupStageFinalized);

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary -ml-2 mb-1">
            <Link href="/admin/matches">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Match Center</span>
            </Link>
          </Button>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
              {matchData.stageType} — Match {String(matchData.match_position).padStart(2, '0')}
            </h1>
            <Badge variant={isLive ? 'default' : isCompleted ? 'outline' : 'secondary'} className="capitalize py-1 px-3">
              {isLive ? 'LIVE NOW' : matchData.status}
            </Badge>
          </div>
        </div>

        {!isLocked && (
          <div className="flex items-center gap-2">
            {isScheduled && (
              <Button onClick={handleStart} disabled={actionLoading} className="font-bold bg-emerald-700 hover:bg-emerald-800 text-white">
                <Radio className="h-4 w-4 mr-2 animate-pulse" />
                Start Match Live
              </Button>
            )}

            {(isLive || isCompleted || (isScheduled && matchData.participantAUser && matchData.participantBUser)) && (
              <Button onClick={() => setIsScoreModalOpen(true)} className="font-bold bg-primary text-white">
                <Zap className="h-4 w-4 mr-2" />
                {isLive ? 'Update Live Score' : isCompleted ? 'Edit Score Result' : 'Enter Score'}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Main Match Card */}
      <Card className="bg-white border-border shadow-md">
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
            <span>Tournament: {matchData.tournamentName}</span>
            <span>Round: {matchData.roundName}</span>
          </div>
        </CardHeader>
        <CardContent className="p-8 space-y-6">
          {/* Score Board Display */}
          <div className="grid grid-cols-5 items-center gap-4 text-center">
            {/* Participant A */}
            <div className="col-span-2 space-y-2">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-secondary text-primary flex items-center justify-center font-black text-xl">
                {matchData.participantAUser?.username?.slice(0, 2).toUpperCase() || 'P1'}
              </div>
              <h2 className="text-lg font-black text-[#0B3323]">
                {matchData.participantAUser?.username || 'TBD'}
              </h2>
              {matchData.winner_id === matchData.participant_a && (
                <Badge variant="efootball" className="gap-1 font-mono mx-auto">
                  <Trophy className="h-3 w-3" /> Winner
                </Badge>
              )}
            </div>

            {/* Score */}
            <div className="col-span-1 py-4 px-3 rounded-2xl bg-gradient-to-b from-[#F4F8F5] to-secondary/30 border border-border shadow-inner font-mono font-black text-4xl text-[#0B3323]">
              {isScheduled ? (
                <span className="text-lg text-muted-foreground font-normal">VS</span>
              ) : (
                <span>
                  {matchData.score_a} - {matchData.score_b}
                </span>
              )}
            </div>

            {/* Participant B */}
            <div className="col-span-2 space-y-2">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-secondary text-primary flex items-center justify-center font-black text-xl">
                {matchData.participantBUser?.username?.slice(0, 2).toUpperCase() || 'P2'}
              </div>
              <h2 className="text-lg font-black text-[#0B3323]">
                {matchData.participantBUser?.username || 'TBD'}
              </h2>
              {matchData.winner_id === matchData.participant_b && (
                <Badge variant="efootball" className="gap-1 font-mono mx-auto">
                  <Trophy className="h-3 w-3" /> Winner
                </Badge>
              )}
            </div>
          </div>

          {/* Schedule & Notes */}
          <div className="pt-4 border-t border-border/50 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 rounded-xl bg-[#F4F8F5] border border-border/50 space-y-1">
              <span className="font-bold text-muted-foreground uppercase block">Scheduled Date / Time</span>
              <div className="flex items-center gap-1.5 text-[#0B3323] font-semibold">
                <Clock className="h-4 w-4 text-primary" />
                <span>{matchData.scheduled_time ? formatDate(matchData.scheduled_time) : 'Not Scheduled'}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#F4F8F5] border border-border/50 space-y-1">
              <span className="font-bold text-muted-foreground uppercase block">Match Notes</span>
              <p className="text-[#0B3323] italic">
                {matchData.notes || 'No administrative notes added for this fixture.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Score Modal */}
      {isScoreModalOpen && matchData && (
        <ScoreEntryModal
          isOpen={isScoreModalOpen}
          onClose={() => setIsScoreModalOpen(false)}
          onUpdateLiveScore={handleUpdateLiveScore}
          onCompleteMatch={handleCompleteMatch}
          participantA={matchData.participantAUser?.username || 'Player A'}
          participantB={matchData.participantBUser?.username || 'Player B'}
          currentScoreA={matchData.score_a}
          currentScoreB={matchData.score_b}
          isLive={isLive}
          isGroupMatch={Boolean(matchData.group_id)}
          isLoading={actionLoading}
        />
      )}
    </div>
  );
}
