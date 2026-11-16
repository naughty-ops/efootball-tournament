import { createClient } from '@/lib/supabase/client';
import type { LiveViewerSession, Database } from '@/types/database';

export interface HeartbeatViewerResult {
  success: boolean;
  viewer_count: number;
  status: 'watching' | 'joining' | 'reconnecting' | 'inactive' | 'left';
  expires_at?: string;
  error?: string;
}

export interface LeaveViewerResult {
  success: boolean;
  viewer_count: number;
  status: string;
}

/**
 * Generates or retrieves a persistent client/device session identity.
 * Shared across browser tabs via localStorage so opening multiple tabs
 * under the same device doesn't inflate guest viewer counts.
 */
export function getPersistentViewerSessionId(): string {
  if (typeof window === 'undefined') {
    return 'ssr_viewer_session';
  }

  const STORAGE_KEY = 'efootball_viewer_device_id';
  try {
    let devId = localStorage.getItem(STORAGE_KEY);
    if (!devId) {
      devId = `dev_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
      localStorage.setItem(STORAGE_KEY, devId);
    }
    return devId;
  } catch {
    // Fallback for private browsing mode
    return `sess_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
  }
}

/**
 * Detect client device classification
 */
export function getViewerDeviceType(): string {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  const ua = navigator.userAgent.toLowerCase();
  if (w < 768 || /iphone|android|mobile/.test(ua)) {
    return 'mobile';
  } else if (w < 1024 || /ipad|tablet/.test(ua)) {
    return 'tablet';
  }
  return 'desktop';
}

/**
 * Sends authoritative heartbeat to database to register or keep alive viewer presence.
 * Deduplicates by auth user_id or device session_id on conflict.
 */
export async function recordMatchViewerHeartbeat(
  matchId: string,
  sessionId: string,
  deviceType?: string
): Promise<HeartbeatViewerResult> {
  const supabase = createClient();
  const devType = deviceType || getViewerDeviceType();

  try {
    const { data, error } = await (supabase as any).rpc('record_match_viewer_heartbeat', {
      p_match_id: matchId,
      p_session_id: sessionId,
      p_device_type: devType,
    });

    if (error) {
      console.warn('[recordMatchViewerHeartbeat] RPC error:', error.message);
      return { success: false, viewer_count: 1, status: 'watching', error: error.message };
    }

    const res = data as HeartbeatViewerResult;
    return {
      success: true,
      viewer_count: typeof res?.viewer_count === 'number' ? res.viewer_count : 1,
      status: res?.status || 'watching',
      expires_at: res?.expires_at,
    };
  } catch (err: any) {
    console.warn('[recordMatchViewerHeartbeat] Unexpected error:', err);
    return { success: false, viewer_count: 1, status: 'watching', error: err?.message };
  }
}

/**
 * Registers explicit viewer departure and recalculates active count.
 */
export async function leaveMatchViewer(
  matchId: string,
  sessionId: string
): Promise<LeaveViewerResult> {
  const supabase = createClient();

  try {
    const { data, error } = await (supabase as any).rpc('leave_match_viewer', {
      p_match_id: matchId,
      p_session_id: sessionId,
    });

    if (error) {
      console.warn('[leaveMatchViewer] RPC error:', error.message);
      return { success: false, viewer_count: 0, status: 'left' };
    }

    const res = data as LeaveViewerResult;
    return {
      success: true,
      viewer_count: typeof res?.viewer_count === 'number' ? res.viewer_count : 0,
      status: 'left',
    };
  } catch (err) {
    console.warn('[leaveMatchViewer] Unexpected error:', err);
    return { success: false, viewer_count: 0, status: 'left' };
  }
}

/**
 * Fast authoritative query for single match active viewer count.
 */
export async function getActiveMatchViewersCount(matchId: string): Promise<number> {
  const supabase = createClient();

  try {
    const { data, error } = await (supabase as any).rpc('get_active_match_viewers_count', {
      p_match_id: matchId,
    });

    if (error || typeof data !== 'number') {
      return 0;
    }

    return data;
  } catch {
    return 0;
  }
}

/**
 * Fast authoritative query for all live matches active viewer counts (single query, 0 N+1).
 */
export async function getAllLiveMatchesViewerCounts(): Promise<Record<string, number>> {
  const supabase = createClient();

  try {
    const { data, error } = await (supabase as any).rpc('get_all_live_matches_viewer_counts');

    if (error || !Array.isArray(data)) {
      return {};
    }

    const map: Record<string, number> = {};
    for (const row of data as { match_id: string; viewer_count: number }[]) {
      if (row.match_id) {
        map[row.match_id] = row.viewer_count;
      }
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Legacy compatibility functions for historical session analytics
 */
export async function startViewerSession(
  matchId: string,
  sessionId: string,
  deviceType: string = 'desktop'
): Promise<string> {
  // Delegate to authoritative heartbeat
  void recordMatchViewerHeartbeat(matchId, sessionId, deviceType);
  return sessionId;
}

export async function closeViewerSession(
  sessionId: string,
  durationSeconds: number
): Promise<void> {
  // Optional duration tracking for historical logging
  const supabase = createClient();
  const now = new Date().toISOString();

  try {
    await (supabase.from('live_viewer_sessions') as any)
      .update({
        left_at: now,
        duration_seconds: Math.max(1, Math.round(durationSeconds)),
      })
      .eq('session_id', sessionId);
  } catch {
    // Non-fatal
  }
}
