'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface UseRealtimeOneVsOneOptions {
  matchId?: string | null;
  userId?: string | null;
  onUpdate: () => void;
}

/**
 * Realtime hook for 1 VS 1 Arena.
 * Listens for match state updates, room submissions, and opponent readiness.
 * Cleans up subscriptions automatically on unmount to prevent memory leaks and channel exhaustion.
 */
export function useRealtimeOneVsOneMatch({
  matchId,
  userId,
  onUpdate,
}: UseRealtimeOneVsOneOptions) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!matchId) return;

    const supabase = createClient();
    const channelTopic = `1v1:match:${matchId}`;

    const channel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'one_vs_one_matches',
          filter: `id=eq.${matchId}`,
        },
        () => {
          onUpdateRef.current();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'one_vs_one_match_players',
          filter: `match_id=eq.${matchId}`,
        },
        () => {
          onUpdateRef.current();
        }
      )
      .subscribe();

    // Heartbeat fallback: ensures updates are captured even if realtime socket reconnects
    const pollInterval = setInterval(() => {
      onUpdateRef.current();
    }, 3000);

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [matchId, userId]);
}
