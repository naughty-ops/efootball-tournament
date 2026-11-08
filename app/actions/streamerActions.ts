'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/server';
import { RoomServiceClient } from 'livekit-server-sdk';
import { revalidatePath } from 'next/cache';
import { getCanonicalMatchRoomName, getBroadcasterIdentity } from '@/lib/livekit/matchRoom';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface StreamerUser {
  id: string;
  email: string;
  role: string;
  fullName?: string;
  efootballId?: string;
  accountStatus?: string;
}

export interface StreamerAssignment {
  id: string;
  matchId: string;
  streamerId: string;
  streamerEmail?: string;
  streamerName?: string;
  assignedBy?: string;
  createdAt: string;
}

export interface StreamerActionResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
}

/**
 * Lists all available streamers eligible for match assignment.
 * Strictly requires admin/super_admin authorization.
 */
export async function getAvailableStreamersAction(): Promise<StreamerActionResponse<StreamerUser[]>> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    // Query admin_users with elevated roles
    const { data: admins, error: adminErr } = await (supabase.from('admin_users') as any)
      .select('id, email, role')
      .in('role', ['streamer', 'admin', 'super_admin']);

    if (adminErr) {
      if ((adminErr as any).code === '42P01') {
        return { success: true, message: 'Admin table pending migration', data: [] };
      }
      return { success: false, message: adminErr.message || 'Failed to fetch streamers' };
    }

    if (!admins || admins.length === 0) {
      return { success: true, message: 'No eligible streamers found', data: [] };
    }

    const streamerIds = admins.map((a: any) => a.id);

    // Fetch matching profiles to ensure accounts are active and obtain full names
    const { data: profiles } = await (supabase.from('profiles') as any)
      .select('id, full_name, efootball_id, account_status')
      .in('id', streamerIds);

    const profileMap = new Map<string, any>();
    if (profiles) {
      for (const p of profiles) {
        profileMap.set(p.id, p);
      }
    }

    // Filter out suspended or disabled accounts
    const streamers: StreamerUser[] = admins
      .filter((a: any) => {
        const p = profileMap.get(a.id);
        return !p || (p.account_status !== 'suspended' && p.account_status !== 'disabled');
      })
      .map((a: any) => {
        const p = profileMap.get(a.id);
        return {
          id: a.id,
          email: a.email,
          role: a.role,
          fullName: p?.full_name || undefined,
          efootballId: p?.efootball_id || undefined,
          accountStatus: p?.account_status || 'active',
        };
      });

    return {
      success: true,
      message: 'Available streamers fetched successfully',
      data: streamers,
    };
  } catch (err: any) {
    console.error('getAvailableStreamersAction error:', err);
    return {
      success: false,
      message: err.message || 'Unauthorized or server error fetching streamers.',
    };
  }
}

/**
 * Lists all streamers assigned to a specific match.
 * Strictly requires admin/super_admin authorization.
 */
export async function getMatchStreamerAssignmentsAction(
  matchId: string
): Promise<StreamerActionResponse<StreamerAssignment[]>> {
  try {
    await requireAdmin();

    if (!matchId || !UUID_REGEX.test(matchId)) {
      return { success: false, message: 'Valid match ID UUID is required.' };
    }

    const supabase = await createClient();

    const { data: assignments, error } = await (supabase.from('match_streamer_assignments') as any)
      .select('id, match_id, streamer_id, assigned_by, created_at')
      .eq('match_id', matchId);

    if (error) {
      if ((error as any).code === '42P01') {
        return { success: true, message: 'Table pending migration', data: [] };
      }
      return { success: false, message: error.message || 'Failed to fetch streamer assignments' };
    }

    if (!assignments || assignments.length === 0) {
      return { success: true, message: 'No streamers assigned to this match', data: [] };
    }

    const streamerIds = assignments.map((a: any) => a.streamer_id);

    const [{ data: admins }, { data: profiles }] = await Promise.all([
      (supabase.from('admin_users') as any).select('id, email').in('id', streamerIds),
      (supabase.from('profiles') as any).select('id, full_name').in('id', streamerIds),
    ]);

    const emailMap = new Map<string, string>();
    const nameMap = new Map<string, string>();

    admins?.forEach((a: any) => emailMap.set(a.id, a.email));
    profiles?.forEach((p: any) => nameMap.set(p.id, p.full_name));

    const result: StreamerAssignment[] = assignments.map((a: any) => ({
      id: a.id,
      matchId: a.match_id,
      streamerId: a.streamer_id,
      streamerEmail: emailMap.get(a.streamer_id),
      streamerName: nameMap.get(a.streamer_id),
      assignedBy: a.assigned_by,
      createdAt: a.created_at,
    }));

    return {
      success: true,
      message: 'Assignments fetched successfully',
      data: result,
    };
  } catch (err: any) {
    console.error('getMatchStreamerAssignmentsAction error:', err);
    return {
      success: false,
      message: err.message || 'Unauthorized or server error fetching match assignments.',
    };
  }
}

/**
 * Assigns a streamer to a match.
 * Strictly requires admin/super_admin authorization.
 */
export async function assignStreamerToMatchAction(
  matchId: string,
  streamerId: string
): Promise<StreamerActionResponse> {
  try {
    const { user: adminUser } = await requireAdmin();

    if (!matchId || !UUID_REGEX.test(matchId)) {
      return { success: false, message: 'Valid match ID UUID is required.' };
    }
    if (!streamerId || !UUID_REGEX.test(streamerId)) {
      return { success: false, message: 'Valid streamer ID UUID is required.' };
    }

    const supabase = await createClient();

    // Verify match exists and is not concluded
    const { data: match, error: matchErr } = await (supabase.from('matches') as any)
      .select('id, status, tournament_id')
      .eq('id', matchId)
      .single();

    if (matchErr || !match) {
      return { success: false, message: 'Match not found.' };
    }

    if (['completed', 'walkover', 'cancelled'].includes(match.status)) {
      return {
        success: false,
        message: `Cannot assign streamer: Match has already concluded (status: ${match.status}).`,
      };
    }

    // Verify streamer has streamer or admin role
    const { data: adminRecord, error: adminErr } = await (supabase.from('admin_users') as any)
      .select('id, role')
      .eq('id', streamerId)
      .single();

    if (adminErr || !adminRecord || !['streamer', 'admin', 'super_admin'].includes(adminRecord.role)) {
      return {
        success: false,
        message: 'The selected user is not authorized as a streamer or admin.',
      };
    }

    // Insert assignment
    const { error: insertErr } = await (supabase.from('match_streamer_assignments') as any).upsert(
      {
        match_id: matchId,
        streamer_id: streamerId,
        assigned_by: adminUser.id,
      },
      { onConflict: 'match_id,streamer_id' }
    );

    if (insertErr) {
      if ((insertErr as any).code === '42P01') {
        return { success: false, message: 'match_streamer_assignments table is pending migration deployment.' };
      }
      return { success: false, message: insertErr.message || 'Failed to assign streamer to match.' };
    }

    revalidatePath(`/admin/matches/${matchId}`);
    revalidatePath(`/matches/${matchId}`);

    return {
      success: true,
      message: 'Streamer assigned to match successfully.',
    };
  } catch (err: any) {
    console.error('assignStreamerToMatchAction error:', err);
    return {
      success: false,
      message: err.message || 'Unauthorized or server error assigning streamer.',
    };
  }
}

/**
 * Removes a streamer from a match and immediately evicts their active LiveKit connection.
 * Strictly requires admin/super_admin authorization.
 */
export async function removeStreamerAssignmentAction(
  matchId: string,
  streamerId: string
): Promise<StreamerActionResponse> {
  try {
    await requireAdmin();

    if (!matchId || !UUID_REGEX.test(matchId)) {
      return { success: false, message: 'Valid match ID UUID is required.' };
    }
    if (!streamerId || !UUID_REGEX.test(streamerId)) {
      return { success: false, message: 'Valid streamer ID UUID is required.' };
    }

    const supabase = await createClient();

    // 1. Fetch match record to identify canonical room for eviction
    const { data: match, error: matchErr } = await (supabase.from('matches') as any)
      .select('id, live_room_name, tournament_id')
      .eq('id', matchId)
      .maybeSingle();

    if (matchErr || !match) {
      return { success: false, message: 'Match not found.' };
    }

    // 2. Check if assignment exists
    const { data: assignmentRecord, error: findAssignErr } = await (supabase.from('match_streamer_assignments') as any)
      .select('id')
      .eq('match_id', matchId)
      .eq('streamer_id', streamerId)
      .maybeSingle();

    if (findAssignErr && (findAssignErr as any).code !== '42P01') {
      return { success: false, message: findAssignErr.message || 'Error checking streamer assignment.' };
    }

    // 3. Delete database assignment
    const { error: deleteErr } = await (supabase.from('match_streamer_assignments') as any)
      .delete()
      .eq('match_id', matchId)
      .eq('streamer_id', streamerId);

    if (deleteErr && (deleteErr as any).code !== '42P01') {
      return { success: false, message: deleteErr.message || 'Failed to remove streamer assignment.' };
    }

    // 4. Perform immediate LiveKit participant eviction using canonical room & identity
    const roomName = getCanonicalMatchRoomName(match);
    const participantIdentity = getBroadcasterIdentity(streamerId);

    let evictionAttempted = false;
    let evicted = false;
    let evictionError: string | undefined = undefined;

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const rawUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (apiKey && apiSecret && rawUrl) {
      evictionAttempted = true;
      try {
        const host = rawUrl.replace(/^ws/, 'http');
        const roomService = new RoomServiceClient(host, apiKey, apiSecret);
        await roomService.removeParticipant(roomName, participantIdentity);
        evicted = true;
        console.log(
          `[LiveKit Eviction] Successfully evicted participant "${participantIdentity}" from room "${roomName}".`
        );
      } catch (evictErr: any) {
        const errMsg = evictErr?.message || String(evictErr);
        evictionError = errMsg;
        if (
          errMsg.toLowerCase().includes('not found') ||
          errMsg.toLowerCase().includes('no participant') ||
          errMsg.toLowerCase().includes('could not find')
        ) {
          console.info(
            `[LiveKit Eviction] Streamer was not actively connected to room "${roomName}" (${errMsg}).`
          );
        } else {
          console.warn(`[LiveKit Eviction] Eviction error for room "${roomName}":`, errMsg);
        }
      }
    } else {
      evictionError = 'LiveKit server credentials not configured';
      console.info('[LiveKit Eviction] LiveKit environment variables not set; skipped remote room eviction.');
    }

    revalidatePath(`/admin/matches/${matchId}`);
    revalidatePath(`/matches/${matchId}`);

    const message = evicted
      ? 'Streamer unassigned and broadcaster evicted from live room.'
      : evictionAttempted &&
        evictionError &&
        (evictionError.toLowerCase().includes('not found') ||
          evictionError.toLowerCase().includes('no participant'))
      ? 'Streamer assignment removed. Streamer was not actively broadcasting.'
      : evictionAttempted
      ? `Streamer assignment removed, but LiveKit room eviction returned: ${evictionError}`
      : 'Streamer assignment removed. LiveKit eviction skipped (credentials not configured).';

    return {
      success: true,
      message,
      data: {
        assignmentRemoved: true,
        evictionAttempted,
        evicted,
        evictionError,
      },
    };
  } catch (err: any) {
    console.error('removeStreamerAssignmentAction error:', err);
    return {
      success: false,
      message: err.message || 'Unauthorized or server error removing streamer assignment.',
    };
  }
}
