'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface RealtimePayload {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  old: Record<string, any>;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
}

/**
 * Custom hook to subscribe to Postgres Realtime changes on `public.matches` and `public.tournaments`.
 * Passes realtime payload to onUpdate callback so components can update React state instantly.
 */
export function useRealtimeMatches(
  onUpdate: (payload?: RealtimePayload) => void,
  tournamentId?: string,
  matchId?: string
) {
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>('connecting');

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;
    let hasConnectedOnce = false;

    const channelName = matchId
      ? `public:matches:match:${matchId}`
      : tournamentId
      ? `public:matches:tournament:${tournamentId}`
      : 'public:matches:all';

    // Note: matches table does NOT have tournament_id column directly.
    // If matchId is specified, we filter by id=eq.matchId.
    // Otherwise we subscribe to public.matches table events without invalid column filters.
    const matchFilter = matchId ? `id=eq.${matchId}` : undefined;
    const tournamentFilter = tournamentId ? `id=eq.${tournamentId}` : undefined;

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Realtime] Initializing subscription channel: ${channelName}`);
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: matchFilter,
        },
        (payload) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('[Realtime Match Event Received]', payload);
          }
          if (isMounted) {
            onUpdate(payload as unknown as RealtimePayload);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournaments',
          filter: tournamentFilter,
        },
        (payload) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('[Realtime Tournament Event Received]', payload);
          }
          if (isMounted) {
            onUpdate(payload as unknown as RealtimePayload);
          }
        }
      )
      .subscribe((status) => {
        if (!isMounted) return;

        if (process.env.NODE_ENV === 'development') {
          console.log(`[Realtime Channel Status]: ${channelName} -> ${status}`);
        }

        if (status === 'SUBSCRIBED') {
          if (hasConnectedOnce) {
            // Reconnection recovery: revalidate data upon re-subscribing
            onUpdate();
          }
          hasConnectedOnce = true;
          setConnectionStatus('connected');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionStatus(hasConnectedOnce ? 'reconnecting' : 'disconnected');
        }
      });

    return () => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Realtime] Removing channel subscription: ${channelName}`);
      }
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [onUpdate, tournamentId, matchId]);

  return { connectionStatus };
}
