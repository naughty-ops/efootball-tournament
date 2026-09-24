import { createClient } from '@/lib/supabase/client';
import type { LiveViewerSession } from '@/types/database';

type UnknownQuery = {
  select: (columns: string) => UnknownQuery;
  eq: (column: string, value: unknown) => UnknownQuery;
  single: () => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  insert: (payload: unknown) => UnknownQuery;
  update: (payload: unknown) => UnknownQuery;
  then: Promise<{ data: unknown; error: { code?: string; message?: string } | null }>['then'];
};

/**
 * Record viewer session start upon entering live match page
 */
export async function startViewerSession(
  matchId: string,
  sessionId: string,
  deviceType: string = 'desktop'
): Promise<string> {
  const supabase = createClient();
  const now = new Date().toISOString();

  let userId: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) userId = user.id;
  } catch {
    // Non-fatal if unauthenticated
  }

  try {
    await (supabase.from('live_viewer_sessions') as unknown as UnknownQuery).insert({
      match_id: matchId,
      user_id: userId,
      session_id: sessionId,
      device_type: deviceType,
      joined_at: now,
      created_at: now,
    });
  } catch (err) {
    console.warn('Start viewer session insert warning:', err);
  }

  return sessionId;
}

/**
 * Record viewer session departure and duration
 */
export async function closeViewerSession(
  sessionId: string,
  durationSeconds: number
): Promise<void> {
  const supabase = createClient();
  const now = new Date().toISOString();

  try {
    await (supabase.from('live_viewer_sessions') as unknown as UnknownQuery)
      .update({
        left_at: now,
        duration_seconds: Math.max(1, Math.round(durationSeconds)),
      })
      .eq('session_id', sessionId);
  } catch (err) {
    console.warn('Close viewer session update warning:', err);
  }
}
