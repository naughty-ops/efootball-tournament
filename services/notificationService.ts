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

interface NotificationCacheEntry<T> {
  data: T;
  timestamp: number;
}
const notifCache = new Map<string, NotificationCacheEntry<PlayerNotificationItem[]>>();
const unreadCountCache = new Map<string, NotificationCacheEntry<number>>();
const NOTIF_CACHE_TTL_MS = 30 * 1000;

export function invalidateNotificationCache(userId?: string) {
  if (userId) {
    notifCache.delete(userId);
    unreadCountCache.delete(userId);
  } else {
    notifCache.clear();
    unreadCountCache.clear();
  }
}

export async function getPlayerNotifications(
  supabase: any,
  userId: string,
  limit = 50
): Promise<PlayerNotificationItem[]> {
  const cached = notifCache.get(userId);
  if (cached && Date.now() - cached.timestamp < NOTIF_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    let res = await supabase
      .from('player_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (res?.error) {
      try {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const admin = createAdminClient();
        res = await admin
          .from('player_notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);
      } catch {
        // non-blocking
      }
    }

    const data = res?.data || [];
    const result: PlayerNotificationItem[] = data.map((n: any) => ({
      id: n.id,
      userId: n.user_id,
      title: n.title || 'Notification',
      message: n.message || '',
      type: n.type || 'announcements',
      actionUrl: n.action_url || null,
      isRead: Boolean(n.is_read),
      createdAt: n.created_at || new Date().toISOString(),
    }));
    notifCache.set(userId, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.warn('getPlayerNotifications catch:', err);
    return [];
  }
}

export async function getUnreadNotificationCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const cached = unreadCountCache.get(userId);
  if (cached && Date.now() - cached.timestamp < NOTIF_CACHE_TTL_MS) {
    return cached.data;
  }

  const { count, error } = await supabase
    .from('player_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error || typeof count !== 'number') return 0;
  unreadCountCache.set(userId, { data: count, timestamp: Date.now() });
  return count;
}
