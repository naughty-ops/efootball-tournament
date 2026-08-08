'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface RealtimePayload {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  old: Record<string, any>;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
}

/**
 * Robust, production-hardened custom hook to subscribe to Postgres Realtime changes on `public.matches` and `public.tournaments`.
 * Defensively catches any subscription errors to prevent Next.js page crashes on Vercel deployment.
 */
export function useRealtimeMatches(
  onUpdate: (payload?: RealtimePayload) => void,
  tournamentId?: string,
  matchId?: string
) {
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>('connecting');

  useEffect(() => {
    let isMounted = true;
    let hasConnectedOnce = false;
    let channel: RealtimeChannel | null = null;

    try {
      const supabase = createClient();

      // Instance-unique channel name compatible with all Supabase Realtime client versions
      const instanceId = Math.random().toString(36).substring(2, 8);
      const channelName = matchId
        ? `matches-realtime-match-${matchId}-${instanceId}`
        : tournamentId
        ? `matches-realtime-tournament-${tournamentId}-${instanceId}`
        : `matches-realtime-all-${instanceId}`;

      const matchFilter = matchId ? `id=eq.${matchId}` : undefined;
      const tournamentFilter = tournamentId ? `id=eq.${tournamentId}` : undefined;

      if (process.env.NODE_ENV === 'development') {
        console.log(`[Realtime matches] Subscribing channel: ${channelName}`);
      }

      channel = supabase.channel(channelName);

      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'matches',
            ...(matchFilter ? { filter: matchFilter } : {}),
          },
          (payload) => {
            if (process.env.NODE_ENV === 'development') {
              console.log('[Realtime matches event]', payload);
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
            ...(tournamentFilter ? { filter: tournamentFilter } : {}),
          },
          (payload) => {
            if (process.env.NODE_ENV === 'development') {
              console.log('[Realtime tournaments event]', payload);
            }
            if (isMounted) {
              onUpdate(payload as unknown as RealtimePayload);
            }
          }
        )
        .subscribe((status, err) => {
          if (!isMounted) return;

          if (process.env.NODE_ENV === 'development') {
            console.log(`[Realtime matches] Status: ${channelName} -> ${status}`, err || '');
          }

          if (status === 'SUBSCRIBED') {
            if (hasConnectedOnce) {
              // Reconnection recovery: revalidate data upon re-subscribing
              onUpdate();
            }
            hasConnectedOnce = true;
            setConnectionStatus('connected');
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (err) {
              console.warn('[Realtime matches warning]', err);
            }
            setConnectionStatus(hasConnectedOnce ? 'reconnecting' : 'disconnected');
          }
        });
    } catch (err) {
      console.warn('[Realtime matches defensive catch] Could not initialize subscription:', err);
      setTimeout(() => {
        if (isMounted) {
          setConnectionStatus('disconnected');
        }
      }, 0);
    }

    return () => {
      isMounted = false;
      if (channel) {
        try {
          const supabase = createClient();
          supabase.removeChannel(channel);
        } catch (cleanupErr) {
          console.warn('[Realtime matches cleanup warning]', cleanupErr);
        }
      }
    };
  }, [onUpdate, tournamentId, matchId]);

  return { connectionStatus };
}
