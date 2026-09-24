'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, CheckCircle2, XCircle, AlertCircle, Lock, RefreshCw, Vote, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Participant, MatchPrediction, PredictionAggregateStats } from '@/types/database';
import {
  submitOrUpdatePrediction,
  getUserPrediction,
  getMatchPredictionStats,
} from '@/services/predictionService';

interface LiveMatchPredictionsWidgetProps {
  matchId: string;
  participantA: Participant | null | undefined;
  participantB: Participant | null | undefined;
  isMatchCompleted: boolean;
  isMatchLive: boolean;
  matchWinnerId?: string | null;
}

function getOrCreateVisitorId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('ef_visitor_uuid');
  if (!id) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      id = crypto.randomUUID();
    } else {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    try {
      localStorage.setItem('ef_visitor_uuid', id);
    } catch {
      // Fallback if localStorage is disabled/blocked
    }
  }
  return id;
}

export function LiveMatchPredictionsWidget({
  matchId,
  participantA,
  participantB,
  isMatchCompleted,
  isMatchLive,
  matchWinnerId,
}: LiveMatchPredictionsWidgetProps) {
  const [userPred, setUserPred] = useState<MatchPrediction | null>(null);
  const [stats, setStats] = useState<PredictionAggregateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPredictionData = useCallback(async () => {
    try {
      const visitorId = getOrCreateVisitorId();
      const [uPred, pStats] = await Promise.all([
        getUserPrediction(matchId, visitorId),
        getMatchPredictionStats(matchId, participantA?.id, participantB?.id),
      ]);
      setUserPred(uPred);
      setStats(pStats);
      setError(null);
    } catch (err) {
      console.error('Error loading predictions:', err);
    } finally {
      setLoading(false);
    }
  }, [matchId, participantA?.id, participantB?.id]);

  useEffect(() => {
    fetchPredictionData();
  }, [fetchPredictionData]);

  const handlePredict = async (predictedPlayerId: string) => {
    if (submitting || isLocked) return;
    setSubmitting(true);
    setError(null);

    try {
      const visitorId = getOrCreateVisitorId();
      const updated = await submitOrUpdatePrediction(matchId, predictedPlayerId, visitorId);
      setUserPred(updated);
      await fetchPredictionData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit prediction.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const isLocked = isMatchCompleted || (stats?.isLocked ?? false);
  const playerAName = participantA?.username || 'Player A';
  const playerBName = participantB?.username || 'Player B';

  if (loading) {
    return (
      <Card className="p-4 rounded-3xl border border-slate-200 bg-white shadow-2xs animate-pulse flex items-center justify-center min-h-[120px]">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
      </Card>
    );
  }

  // Determine prediction state banner
  const resultState = userPred?.result || 'pending';
  const isSelectedA = userPred?.predicted_player_id === participantA?.id;
  const isSelectedB = userPred?.predicted_player_id === participantB?.id;

  return (
    <Card className="p-4 sm:p-5 rounded-3xl border border-slate-200 bg-white shadow-xs space-y-4 font-sans">
      {/* Widget Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Badge className="bg-[#0B3323] text-emerald-400 font-black text-[10px] uppercase px-2.5 py-0.5">
            LIVE PREDICTION
          </Badge>
          <span className="text-xs font-black text-[#0B3323]">Who will win?</span>
        </div>

        <div className="flex items-center gap-2">
          {isLocked ? (
            <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-300 text-[10px] font-bold gap-1">
              <Lock className="h-3 w-3 text-amber-600" />
              <span>Predictions Locked</span>
            </Badge>
          ) : (
            <span className="text-[10px] text-slate-500 font-extrabold font-mono">
              {stats?.totalPredictions || 0} Predictions
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Result Outcome Banners for Completed Matches */}
      {resultState === 'correct' && (
        <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-300 text-emerald-950 text-xs font-black flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>✓ Correct Prediction! Your vote was on point.</span>
        </div>
      )}

      {resultState === 'wrong' && (
        <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-300 text-rose-950 text-xs font-black flex items-center gap-2">
          <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>✕ Incorrect Prediction. Better luck next match!</span>
        </div>
      )}

      {resultState === 'void' && (
        <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-300 text-amber-950 text-xs font-black flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          <span>Prediction Voided (Match walkover or cancelled).</span>
        </div>
      )}

      {isMatchCompleted && !userPred && (
        <div className="p-3 rounded-2xl bg-slate-100 border border-slate-200 text-slate-500 text-xs font-semibold text-center">
          You didn't make a prediction for this match.
        </div>
      )}

      {/* Voting Buttons */}
      <div className="grid grid-cols-2 gap-3">
        {/* Player A Button */}
        <button
          disabled={isLocked || submitting || !participantA}
          onClick={() => participantA && handlePredict(participantA.id)}
          className={cn(
            'p-3 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 text-left relative overflow-hidden',
            isSelectedA
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-md ring-2 ring-emerald-300'
              : isLocked
              ? 'bg-slate-50 border-slate-200 opacity-80 cursor-not-allowed'
              : 'bg-white border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30'
          )}
        >
          <div className="flex items-center justify-between w-full text-xs font-black">
            <span className="truncate">{playerAName}</span>
            {isSelectedA && <CheckCircle2 className="h-4 w-4 text-white shrink-0" />}
          </div>
          <span className={cn('text-xs font-mono font-black', isSelectedA ? 'text-emerald-100' : 'text-slate-500')}>
            {stats?.playerAPercent || 0}% ({stats?.playerACount || 0})
          </span>
        </button>

        {/* Player B Button */}
        <button
          disabled={isLocked || submitting || !participantB}
          onClick={() => participantB && handlePredict(participantB.id)}
          className={cn(
            'p-3 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 text-left relative overflow-hidden',
            isSelectedB
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-md ring-2 ring-emerald-300'
              : isLocked
              ? 'bg-slate-50 border-slate-200 opacity-80 cursor-not-allowed'
              : 'bg-white border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30'
          )}
        >
          <div className="flex items-center justify-between w-full text-xs font-black">
            <span className="truncate">{playerBName}</span>
            {isSelectedB && <CheckCircle2 className="h-4 w-4 text-white shrink-0" />}
          </div>
          <span className={cn('text-xs font-mono font-black', isSelectedB ? 'text-emerald-100' : 'text-slate-500')}>
            {stats?.playerBPercent || 0}% ({stats?.playerBCount || 0})
          </span>
        </button>
      </div>

      {/* Aggregate Distribution Bar */}
      {stats && stats.totalPredictions > 0 && (
        <div className="space-y-1 pt-1">
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden flex">
            <div
              className="bg-emerald-600 h-full transition-all duration-500"
              style={{ width: `${stats.playerAPercent}%` }}
              title={`${playerAName}: ${stats.playerAPercent}%`}
            />
            <div
              className="bg-teal-700 h-full transition-all duration-500"
              style={{ width: `${stats.playerBPercent}%` }}
              title={`${playerBName}: ${stats.playerBPercent}%`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 font-mono font-bold">
            <span>{playerAName} ({stats.playerAPercent}%)</span>
            <span>{playerBName} ({stats.playerBPercent}%)</span>
          </div>
        </div>
      )}
    </Card>
  );
}
