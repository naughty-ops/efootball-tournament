import { createClient } from '@/lib/supabase/client';
import type { Match, MatchPrediction, PredictionAggregateStats } from '@/types/database';

type UnknownQuery = {
  select: (columns: string, options?: unknown) => UnknownQuery;
  eq: (column: string, value: unknown) => UnknownQuery;
  in: (column: string, values: unknown[]) => UnknownQuery;
  order: (column: string, options?: { ascending?: boolean }) => UnknownQuery;
  single: () => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  insert: (payload: unknown) => UnknownQuery;
  upsert: (payload: unknown, options?: unknown) => UnknownQuery;
  update: (payload: unknown) => UnknownQuery;
  then: Promise<{ data: unknown; error: { code?: string; message?: string } | null }>['then'];
};

function formatSupabaseError(error: unknown): string {
  if (!error) return 'Unknown database error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;
    const msg = (errObj.message || errObj.details || errObj.hint || errObj.code) as string | undefined;
    if (msg) return String(msg);
  }
  return 'Database error';
}

/**
 * Submit or update a user prediction with server-side validation & lock checks
 */
export async function submitOrUpdatePrediction(
  matchId: string,
  predictedPlayerId: string
): Promise<MatchPrediction> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('You must be signed in to submit a match prediction.');
  }

  // 1. Authoritative Match Check
  const { data: matchData, error: matchError } = await (
    supabase.from('matches') as unknown as UnknownQuery
  )
    .select('*')
    .eq('id', matchId)
    .single();

  if (matchError || !matchData) {
    throw new Error('Match not found.');
  }

  const match = matchData as Match;

  // Server-side lock checks: Predictions are locked if match is completed, walkover, or cancelled
  if (
    match.status === 'completed' ||
    match.status === 'walkover' ||
    match.status === 'cancelled'
  ) {
    throw new Error('Predictions are locked for this match.');
  }

  // 2. Existing Prediction & Lock Check
  const { data: existingPred } = await (
    supabase.from('match_predictions') as unknown as UnknownQuery
  )
    .select('*')
    .eq('match_id', matchId)
    .eq('user_id', user.id)
    .single();

  const predObj = existingPred as MatchPrediction | null;
  if (predObj && predObj.locked_at) {
    throw new Error('Your prediction has been locked and cannot be changed.');
  }

  // 3. Upsert Prediction Record
  const now = new Date().toISOString();
  const payload = {
    match_id: matchId,
    user_id: user.id,
    predicted_player_id: predictedPlayerId,
    predicted_at: now,
    result: 'pending',
    updated_at: now,
  };

  const { data: savedData, error: saveError } = await (
    supabase.from('match_predictions') as unknown as UnknownQuery
  )
    .upsert(payload, { onConflict: 'match_id,user_id' })
    .select('*')
    .single();

  if (saveError) {
    console.error('Prediction save error:', saveError);
    throw new Error(`Failed to submit prediction: ${formatSupabaseError(saveError)}`);
  }

  return savedData as MatchPrediction;
}

/**
 * Fetch prediction of current authenticated user for a match
 */
export async function getUserPrediction(matchId: string): Promise<MatchPrediction | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  try {
    const { data, error } = await (
      supabase.from('match_predictions') as unknown as UnknownQuery
    )
      .select('*')
      .eq('match_id', matchId)
      .eq('user_id', user.id)
      .single();

    if (!error && data) {
      return data as MatchPrediction;
    }
  } catch {
    // Return null if none found
  }

  return null;
}

/**
 * Retrieve public aggregate prediction statistics for a match without exposing usernames
 */
export async function getMatchPredictionStats(
  matchId: string,
  participantAId?: string | null,
  participantBId?: string | null
): Promise<PredictionAggregateStats> {
  const supabase = createClient();

  try {
    const { data: predictionsData } = await (
      supabase.from('match_predictions') as unknown as UnknownQuery
    )
      .select('*')
      .eq('match_id', matchId);

    const predictions = (predictionsData || []) as MatchPrediction[];
    const totalPredictions = predictions.length;

    let playerACount = 0;
    let playerBCount = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let voidCount = 0;

    for (const p of predictions) {
      if (participantAId && p.predicted_player_id === participantAId) {
        playerACount++;
      } else if (participantBId && p.predicted_player_id === participantBId) {
        playerBCount++;
      }

      if (p.result === 'correct') correctCount++;
      if (p.result === 'wrong') wrongCount++;
      if (p.result === 'void') voidCount++;
    }

    const playerAPercent =
      totalPredictions > 0 ? Math.round((playerACount / totalPredictions) * 100) : 0;
    const playerBPercent =
      totalPredictions > 0 ? Math.round((playerBCount / totalPredictions) * 100) : 0;

    // Check lock state from match status
    const { data: matchData } = await (
      supabase.from('matches') as unknown as UnknownQuery
    )
      .select('*')
      .eq('id', matchId)
      .single();

    const matchObj = matchData as Match | null;
    const isLocked =
      Boolean(matchObj) &&
      (matchObj?.status === 'completed' ||
        matchObj?.status === 'walkover' ||
        matchObj?.status === 'cancelled');

    return {
      totalPredictions,
      playerACount,
      playerBCount,
      playerAPercent,
      playerBPercent,
      correctCount,
      wrongCount,
      voidCount,
      isLocked,
    };
  } catch (err) {
    console.error('Error fetching prediction stats:', err);
    return {
      totalPredictions: 0,
      playerACount: 0,
      playerBCount: 0,
      playerAPercent: 0,
      playerBPercent: 0,
      correctCount: 0,
      wrongCount: 0,
      voidCount: 0,
      isLocked: false,
    };
  }
}

/**
 * Idempotent Settlement: Evaluates all predictions when a match completes or cancels
 */
export async function settleMatchPredictions(matchId: string): Promise<void> {
  const supabase = createClient();
  const now = new Date().toISOString();

  // 1. Read Authoritative Match Record
  const { data: matchData } = await (
    supabase.from('matches') as unknown as UnknownQuery
  )
    .select('*')
    .eq('id', matchId)
    .single();

  const match = matchData as Match | null;
  if (!match) return;

  const { data: predsData } = await (
    supabase.from('match_predictions') as unknown as UnknownQuery
  )
    .select('*')
    .eq('match_id', matchId);

  const predictions = (predsData || []) as MatchPrediction[];
  if (predictions.length === 0) return;

  // 2. Evaluate according to match status
  if (match.status === 'completed') {
    if (match.winner_id) {
      for (const p of predictions) {
        const newResult = p.predicted_player_id === match.winner_id ? 'correct' : 'wrong';
        await (supabase.from('match_predictions') as unknown as UnknownQuery)
          .update({ result: newResult, locked_at: now, updated_at: now })
          .eq('id', p.id);
      }
    } else {
      // Draw or no winner -> void
      for (const p of predictions) {
        await (supabase.from('match_predictions') as unknown as UnknownQuery)
          .update({ result: 'void', locked_at: now, updated_at: now })
          .eq('id', p.id);
      }
    }
  } else if (match.status === 'walkover' || match.status === 'cancelled') {
    // Void predictions for walkover/cancelled
    for (const p of predictions) {
      await (supabase.from('match_predictions') as unknown as UnknownQuery)
        .update({ result: 'void', locked_at: now, updated_at: now })
        .eq('id', p.id);
    }
  }
}
