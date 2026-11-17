'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type RealtimeConnectionState =
  | 'CONNECTED'
  | 'CONNECTING'
  | 'DISCONNECTED'
  | 'RECONNECTING'
  | 'RECOVERED';

export interface UseRealtimeOneVsOneOptions {
  matchId?: string | null;
  userId?: string | null;
  onUpdate: () => void | Promise<void>;
  onConnectionChange?: (state: RealtimeConnectionState) => void;
}

/**
 * High-performance, resilient Realtime hook for 1 VS 1 Arena.
 * Listens for match state updates, room submissions, opponent readiness, results, and disputes.
 * 
 * Replaces aggressive 3s polling with:
 * 1. Event-driven Supabase WebSocket updates across all relevant 1v1 tables.
 * 2. Exponential backoff reconnection with jitter (2s -> 4s -> 8s -> 15s max).
 * 3. Graceful tab visibility & online/offline handling.
 * 4. Low-frequency fallback synchronization (15s) STRICTLY active ONLY during disconnection.
 *    Fallback is immediately terminated when Realtime is healthy.
 */
export function useRealtimeOneVsOneMatch({
  matchId,
  userId,
  onUpdate,
  onConnectionChange,
}: UseRealtimeOneVsOneOptions) {
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('CONNECTING');

  const onUpdateRef = useRef(onUpdate);
  const onConnectionChangeRef = useRef(onConnectionChange);
  const connectionStateRef = useRef<RealtimeConnectionState>('CONNECTING');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Sync latest callbacks
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);

  const updateConnectionState = useCallback((newState: RealtimeConnectionState) => {
    connectionStateRef.current = newState;
    if (isMountedRef.current) {
      setConnectionState(newState);
      onConnectionChangeRef.current?.(newState);
    }
  }, []);

  // Debounced update dispatcher: collapses multiple Postgres table events in the same transaction
  const dispatchUpdate = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        onUpdateRef.current?.();
      }
    }, 60);
  }, []);

  // Low-frequency fallback: runs ONLY while disconnected/reconnecting to prevent user stall
  const startFallbackSync = useCallback(() => {
    if (fallbackIntervalRef.current) return;
    fallbackIntervalRef.current = setInterval(() => {
      if (isMountedRef.current && matchId) {
        dispatchUpdate();
      }
    }, 15000); // 15s low-frequency fallback during disconnection only
  }, [matchId, dispatchUpdate]);

  const stopFallbackSync = useCallback(() => {
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    if (!matchId) {
      updateConnectionState('DISCONNECTED');
      stopFallbackSync();
      return;
    }

    const supabase = createClient();

    const cleanupCurrentChannel = () => {
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch (err) {
          console.warn('[useRealtimeOneVsOneMatch] Error removing channel:', err);
        }
        channelRef.current = null;
      }
    };

    const subscribeToChannel = () => {
      cleanupCurrentChannel();

      updateConnectionState(retryCountRef.current > 0 ? 'RECONNECTING' : 'CONNECTING');

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
            dispatchUpdate();
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
            dispatchUpdate();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'one_vs_one_results',
            filter: `match_id=eq.${matchId}`,
          },
          () => {
            dispatchUpdate();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'one_vs_one_disputes',
            filter: `match_id=eq.${matchId}`,
          },
          () => {
            dispatchUpdate();
          }
        );

      channel.subscribe((status, err) => {
        if (!isMountedRef.current) return;

        if (status === 'SUBSCRIBED') {
          const wasReconnecting =
            connectionStateRef.current === 'RECONNECTING' ||
            connectionStateRef.current === 'DISCONNECTED';

          retryCountRef.current = 0;
          if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
          }

          // Realtime is healthy! Terminate any fallback polling immediately
          stopFallbackSync();

          if (wasReconnecting) {
            updateConnectionState('RECOVERED');
            // Transition smoothly to CONNECTED after notifying recovery
            setTimeout(() => {
              if (isMountedRef.current) {
                updateConnectionState('CONNECTED');
              }
            }, 500);
            // Fetch authoritative update to catch up on any missed events while disconnected
            dispatchUpdate();
          } else {
            updateConnectionState('CONNECTED');
          }
        } else if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn(`[useRealtimeOneVsOneMatch] Channel status: ${status}`, err);
          updateConnectionState('DISCONNECTED');
          startFallbackSync();
          scheduleReconnect();
        }
      });

      channelRef.current = channel;
    };

    const scheduleReconnect = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }

      updateConnectionState('RECONNECTING');

      // Exponential backoff with random jitter: min 2s, max 15s
      const baseDelay = Math.min(2000 * Math.pow(1.5, retryCountRef.current), 15000);
      const jitter = Math.floor(Math.random() * 800);
      const delay = baseDelay + jitter;
      retryCountRef.current += 1;

      retryTimerRef.current = setTimeout(() => {
        if (isMountedRef.current && matchId) {
          subscribeToChannel();
        }
      }, delay);
    };

    // Network switching handlers
    const handleOnline = () => {
      if (connectionStateRef.current !== 'CONNECTED') {
        retryCountRef.current = 0;
        subscribeToChannel();
      }
    };

    const handleOffline = () => {
      updateConnectionState('DISCONNECTED');
      startFallbackSync();
    };

    // Browser tab suspension/wake handling
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (connectionStateRef.current !== 'CONNECTED') {
          subscribeToChannel();
        } else {
          // Socket is connected, but tab was suspended: dispatch one resync to reconcile state
          dispatchUpdate();
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // Initial subscription
    subscribeToChannel();

    return () => {
      isMountedRef.current = false;
      stopFallbackSync();

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }

      cleanupCurrentChannel();
    };
  }, [matchId, userId, updateConnectionState, dispatchUpdate, startFallbackSync, stopFallbackSync]);

  return { connectionState };
}
