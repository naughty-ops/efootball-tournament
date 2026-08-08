'use client';

import { useEffect, useRef, useState } from 'react';
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
 * Production-hardened custom hook to subscribe to Postgres Realtime changes on `public.matches` and `public.tournaments`.
 * Uses useRef for the onUpdate callback to prevent re-subscription loops when parent components re-render.
 * Ensures ALL .on() listeners are attached strictly BEFORE .subscribe() is called.
 */
export function useRealtimeMatches(
  onUpdate: (payload?: RealtimePayload) => void,
  tournamentId?: string,
  matchId?: string
) {
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>('connecting');

  // Keep reference to latest onUpdate callback without triggering effect re-runs
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;
    let hasConnectedOnce = false;
    let channel: RealtimeChannel | null = null;

    try {
      // Unique topic name per subscription instance to avoid topic collision in Supabase JS client
      const instanceId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const topicName = matchId
        ? `matches-realtime-m-${matchId}-${instanceId}`
        : tournamentId
        ? `matches-realtime-t-${tournamentId}-${instanceId}`
        : `matches-realtime-all-${instanceId}`;

      const matchFilter = matchId ? `id=eq.${matchId}` : undefined;
      const tournamentFilter = tournamentId ? `id=eq.${tournamentId}` : undefined;

      if (process.env.NODE_ENV === 'development') {
        console.log(`[Realtime matches] Registering channel topic: ${topicName}`);
      }

      // Single fluid chain: create channel -> attach ALL .on() listeners -> call .subscribe()
      channel = supabase
        .channel(topicName)
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
              console.log('[Realtime match payload]', payload);
            }
            if (isMounted && onUpdateRef.current) {
              try {
                onUpdateRef.current(payload as unknown as RealtimePayload);
              } catch (err) {
                console.warn('[Realtime match callback warning]', err);
              }
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
              console.log('[Realtime tournament payload]', payload);
            }
            if (isMounted && onUpdateRef.current) {
              try {
                onUpdateRef.current(payload as unknown as RealtimePayload);
              } catch (err) {
                console.warn('[Realtime tournament callback warning]', err);
              }
            }
          }
        )
        .subscribe((status, err) => {
          if (!isMounted) return;

          if (process.env.NODE_ENV === 'development') {
            console.log(`[Realtime matches status]: ${topicName} -> ${status}`, err || '');
          }

          if (status === 'SUBSCRIBED') {
            if (hasConnectedOnce && onUpdateRef.current) {
              // Reconnection recovery: revalidate data upon re-subscribing
              try {
                onUpdateRef.current();
              } catch { /* silent */ }
            }
            hasConnectedOnce = true;
            setConnectionStatus('connected');
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (err) {
              console.warn('[Realtime matches channel warning]', err);
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
          // Use the exact same supabase client instance for channel removal
          supabase.removeChannel(channel);
        } catch (cleanupErr) {
          console.warn('[Realtime matches cleanup warning]', cleanupErr);
        }
      }
    };
  }, [tournamentId, matchId]); // Deliberately omit onUpdate: managed via onUpdateRef!

  return { connectionStatus };
}
