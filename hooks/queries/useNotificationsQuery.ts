'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { createClient } from '@/lib/supabase/client';

/**
 * Cached unread notification count query hook.
 * Avoids redundant network round-trips on tab navigation.
 */
export function useUnreadNotificationsCount(userId?: string) {
  return useQuery<number>({
    queryKey: queryKeys.dashboard.notifications(userId || 'current'),
    queryFn: async () => {
      if (!userId) return 0;
      const supabase = createClient();
      const { count, error } = await supabase
        .from('player_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error || typeof count !== 'number') return 0;
      return count;
    },
    staleTime: 60 * 1000, // 60 seconds fresh
    gcTime: 10 * 60 * 1000,
    enabled: Boolean(userId),
    refetchOnWindowFocus: false,
  });
}
