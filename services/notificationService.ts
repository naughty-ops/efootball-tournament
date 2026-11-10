import type { SupabaseClient } from '@supabase/supabase-js';

export interface PlayerNotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'financial' | 'matches' | 'tournaments' | 'support' | 'announcements' | string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export async function getPlayerNotifications(
  supabase: SupabaseClient,
  userId: string,
  limit = 50
): Promise<PlayerNotificationItem[]> {
  const { data, error } = await supabase
    .from('player_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((n: any) => ({
    id: n.id,
    userId: n.user_id,
    title: n.title,
    message: n.message,
    type: n.type || 'announcements',
    actionUrl: n.action_url,
    isRead: Boolean(n.is_read),
    createdAt: n.created_at,
  }));
}

export async function getUnreadNotificationCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('player_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error || typeof count !== 'number') return 0;
  return count;
}
