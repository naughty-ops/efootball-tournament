import { createClient } from '@/lib/supabase/client';

export type MemberPresenceStatus = 'alive' | 'idle' | 'offline';

export interface MemberPresenceItem {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  efootball_id: string;
  status: MemberPresenceStatus;
  current_activity: string;
  last_seen_at: string;
  last_active_at: string;
}

export interface AdminMemberPresenceItem {
  user_id: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  efootball_id: string;
  efootball_id_verified: boolean;
  whatsapp_number: string | null;
  status: MemberPresenceStatus;
  current_activity: string;
  tab_count: number;
  last_seen_at: string;
  last_heartbeat_at: string;
  last_active_at: string;
  created_at: string;
}

export interface MemberPresenceCounts {
  total_alive: number;
  total_idle: number;
  total_offline: number;
  total_members: number;
}

export async function recordMemberHeartbeat(
  sessionId: string,
  status: MemberPresenceStatus = 'alive',
  activity: string = 'In Arena Lobby'
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    const { data, error } = await (supabase as any).rpc('record_member_heartbeat', {
      p_session_id: sessionId,
      p_status: status,
      p_activity: activity,
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to send presence heartbeat' };
  }
}

export async function leaveMemberPresence(
  sessionId?: string,
  forceOffline: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    const { error } = await (supabase as any).rpc('leave_member_presence', {
      p_session_id: sessionId || null,
      p_force_offline: forceOffline,
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to leave presence' };
  }
}

export async function getAliveMembersDirectory(): Promise<{
  success: boolean;
  members: MemberPresenceItem[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await (supabase as any).rpc('get_alive_members_directory');

    if (error) {
      return { success: false, members: [], error: error.message };
    }
    return { success: true, members: (data as MemberPresenceItem[]) || [] };
  } catch (err: any) {
    return { success: false, members: [], error: err?.message || 'Failed to load directory' };
  }
}

export async function getAdminAliveMembersDirectory(supabaseOverride?: any): Promise<{
  success: boolean;
  members: AdminMemberPresenceItem[];
  error?: string;
}> {
  try {
    const supabase = supabaseOverride || createClient();
    const { data, error } = await (supabase as any).rpc('get_admin_alive_members_directory');

    if (error) {
      return { success: false, members: [], error: error.message };
    }
    return { success: true, members: (data as AdminMemberPresenceItem[]) || [] };
  } catch (err: any) {
    return { success: false, members: [], error: err?.message || 'Failed to load admin directory' };
  }
}

export async function getAliveMembersCounts(supabaseOverride?: any): Promise<{
  success: boolean;
  counts: MemberPresenceCounts;
  error?: string;
}> {
  try {
    const supabase = supabaseOverride || createClient();
    const { data, error } = await (supabase as any).rpc('get_alive_members_counts');

    if (error) {
      return {
        success: false,
        counts: { total_alive: 0, total_idle: 0, total_offline: 0, total_members: 0 },
        error: error.message,
      };
    }
    return { success: true, counts: data as MemberPresenceCounts };
  } catch (err: any) {
    return {
      success: false,
      counts: { total_alive: 0, total_idle: 0, total_offline: 0, total_members: 0 },
      error: err?.message || 'Failed to load counts',
    };
  }
}
