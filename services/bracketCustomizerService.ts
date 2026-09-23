import { createClient } from '@/lib/supabase/client';
import type {
  Match,
  Round,
  Participant,
  KnockoutDraftPayload,
  DraftRoundNode,
  DraftMatchNode,
  BracketValidationResult,
  KnockoutBracketLog,
} from '@/types/database';
import { getTournamentBracket, isKnockoutRoundName } from '@/services/bracketService';

type UnknownQuery = {
  select: (columns: string) => UnknownQuery;
  eq: (column: string, value: unknown) => UnknownQuery;
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
  return 'Database operation failed';
}

/**
 * Fetch or initialize draft bracket payload for customizer
 */
export async function fetchKnockoutDraft(tournamentId: string): Promise<KnockoutDraftPayload> {
  const supabase = createClient();

  try {
    const { data: draftRow, error } = await (
      supabase.from('knockout_bracket_drafts') as unknown as UnknownQuery
    )
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('status', 'draft')
      .order('updated_at', { ascending: false })
      .single();

    if (!error && draftRow && (draftRow as any).draft_payload) {
      return (draftRow as any).draft_payload as KnockoutDraftPayload;
    }
  } catch {
    // Fallback if table doesn't exist yet or no draft found
  }

  // Build initial draft state from live tournament rounds and matches
  const overview = await getTournamentBracket(tournamentId);
  const knockoutRounds = overview.rounds
    .filter((r) => isKnockoutRoundName(r.name))
    .sort((a, b) => a.round_number - b.round_number);

  const draftRounds: DraftRoundNode[] = knockoutRounds.map((r) => ({
    id: r.id,
    tournament_id: r.tournament_id,
    round_number: r.round_number,
    name: r.name,
    matches: r.matches.map((m) => ({
      id: m.id,
      round_id: m.round_id,
      match_position: m.match_position,
      participant_a: m.participant_a,
      participant_b: m.participant_b,
      score_a: m.score_a ?? 0,
      score_b: m.score_b ?? 0,
      status: m.status,
      winner_id: m.winner_id,
      next_match_id: m.next_match_id,
      winner_slot: m.winner_slot,
      notes: m.notes,
    })),
  }));

  return {
    rounds: draftRounds,
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

/**
 * Save current draft payload to database and log action
 */
export async function saveKnockoutDraft(
  tournamentId: string,
  payload: KnockoutDraftPayload
): Promise<void> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const updatedPayload: KnockoutDraftPayload = {
    ...payload,
    updatedAt: now,
    version: payload.version + 1,
  };

  try {
    await (supabase.from('knockout_bracket_drafts') as unknown as UnknownQuery).upsert(
      {
        tournament_id: tournamentId,
        version: updatedPayload.version,
        status: 'draft',
        draft_payload: updatedPayload,
        updated_at: now,
      },
      { onConflict: 'tournament_id,status' }
    );
  } catch (err) {
    console.warn('Draft table upsert failed, continuing in-memory:', err);
  }

  // Audit log entry
  try {
    await (supabase.from('knockout_bracket_logs') as unknown as UnknownQuery).insert({
      tournament_id: tournamentId,
      action: 'save_draft',
      details: { version: updatedPayload.version, timestamp: now },
      created_at: now,
    });
  } catch {
    // Non-blocking log insertion failure
  }
}

/**
 * Perform comprehensive pre-publish validation rules
 */
export function validateKnockoutDraft(
  payload: KnockoutDraftPayload,
  liveMatches: Match[]
): BracketValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const impactedCompletedMatches: string[] = [];

  const liveMatchMap = new Map<string, Match>(liveMatches.map((m) => [m.id, m]));
  const allDraftMatches = payload.rounds.flatMap((r) => r.matches);
  const matchIdSet = new Set(allDraftMatches.map((m) => m.id));

  // 1. Check for Duplicate Players in the same Round
  payload.rounds.forEach((round) => {
    const roundPlayers = new Set<string>();
    round.matches.forEach((m) => {
      if (m.participant_a) {
        if (roundPlayers.has(m.participant_a)) {
          errors.push(`Duplicate player assignment in "${round.name}": Player ID ${m.participant_a} appears multiple times.`);
        } else {
          roundPlayers.add(m.participant_a);
        }
      }
      if (m.participant_b) {
        if (roundPlayers.has(m.participant_b)) {
          errors.push(`Duplicate player assignment in "${round.name}": Player ID ${m.participant_b} appears multiple times.`);
        } else {
          roundPlayers.add(m.participant_b);
        }
      }
    });
  });

  // 2. Check for Self-Play in any match
  allDraftMatches.forEach((m) => {
    if (m.participant_a && m.participant_b && m.participant_a === m.participant_b) {
      errors.push(`Invalid match configuration (Match #${m.match_position}): Player cannot play against themselves.`);
    }
  });

  // 3. Circular Connection & Destination Validation
  allDraftMatches.forEach((m) => {
    if (m.next_match_id) {
      if (m.next_match_id === m.id) {
        errors.push(`Circular reference error (Match #${m.match_position}): Match cannot point to itself as next match.`);
      } else if (!matchIdSet.has(m.next_match_id)) {
        warnings.push(`Match #${m.match_position} points to next_match_id "${m.next_match_id}" which is not in the draft.`);
      }
    }
  });

  // 4. Check for Impacted Completed Matches
  allDraftMatches.forEach((dm) => {
    const lm = liveMatchMap.get(dm.id);
    if (lm && (lm.status === 'completed' || lm.status === 'walkover')) {
      const playerAChanged = lm.participant_a !== dm.participant_a;
      const playerBChanged = lm.participant_b !== dm.participant_b;
      const scoreAChanged = lm.score_a !== dm.score_a;
      const scoreBChanged = lm.score_b !== dm.score_b;
      const statusChanged = lm.status !== dm.status;

      if (playerAChanged || playerBChanged || scoreAChanged || scoreBChanged || statusChanged) {
        impactedCompletedMatches.push(
          `Match #${dm.match_position} (Status: ${lm.status}, Result: ${lm.score_a}-${lm.score_b}) will be modified.`
        );
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    impactedCompletedMatches,
  };
}

/**
 * Publish draft payload to live Supabase tables (rounds & matches)
 */
export async function publishKnockoutDraft(
  tournamentId: string,
  payload: KnockoutDraftPayload
): Promise<void> {
  const supabase = createClient();
  const now = new Date().toISOString();

  // 1. Sync / Update Rounds
  for (const r of payload.rounds) {
    const isTempId = r.id.startsWith('temp_');
    const roundPayload = {
      tournament_id: tournamentId,
      round_number: r.round_number,
      name: r.name,
    };

    let roundId = r.id;
    if (isTempId) {
      const { data, error } = await (supabase.from('rounds') as unknown as UnknownQuery)
        .insert(roundPayload)
        .select('*')
        .single();
      if (error) throw new Error(`Failed to create round "${r.name}": ${formatSupabaseError(error)}`);
      roundId = (data as Round).id;
      r.id = roundId;
    } else {
      await (supabase.from('rounds') as unknown as UnknownQuery)
        .update(roundPayload)
        .eq('id', r.id);
    }
  }

  // 2. Sync / Update Matches
  const allMatches = payload.rounds.flatMap((r) =>
    r.matches.map((m) => ({ ...m, round_id: r.id }))
  );

  for (const m of allMatches) {
    const isTempId = m.id.startsWith('temp_');
    const matchPayload = {
      round_id: m.round_id,
      match_position: m.match_position,
      participant_a: m.participant_a || null,
      participant_b: m.participant_b || null,
      score_a: m.score_a ?? 0,
      score_b: m.score_b ?? 0,
      status: m.status,
      winner_id: m.winner_id || null,
      next_match_id: m.next_match_id || null,
      winner_slot: m.winner_slot || null,
      notes: m.notes || null,
      updated_at: now,
    };

    if (isTempId) {
      await (supabase.from('matches') as unknown as UnknownQuery).insert({
        ...matchPayload,
        created_at: now,
      });
    } else {
      await (supabase.from('matches') as unknown as UnknownQuery)
        .update(matchPayload)
        .eq('id', m.id);
    }
  }

  // 3. Update Draft Status
  try {
    await (supabase.from('knockout_bracket_drafts') as unknown as UnknownQuery)
      .update({ status: 'published', published_at: now, updated_at: now })
      .eq('tournament_id', tournamentId);
  } catch {
    // Non-blocking update
  }

  // 4. Audit Log
  try {
    await (supabase.from('knockout_bracket_logs') as unknown as UnknownQuery).insert({
      tournament_id: tournamentId,
      action: 'publish_changes',
      details: {
        totalRounds: payload.rounds.length,
        totalMatches: allMatches.length,
        published_at: now,
      },
      created_at: now,
    });
  } catch {
    // Non-blocking log insertion
  }
}

/**
 * Fetch bracket customization audit logs
 */
export async function fetchBracketAuditLogs(tournamentId: string): Promise<KnockoutBracketLog[]> {
  const supabase = createClient();
  try {
    const { data, error } = await (supabase.from('knockout_bracket_logs') as unknown as UnknownQuery)
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data as KnockoutBracketLog[];
    }
  } catch {
    // Fallback if logs table not present
  }
  return [];
}
