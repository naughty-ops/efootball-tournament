'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { clearPublicCache } from '@/services/publicTournamentService';

export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface RealtimePayload {
   
  new: Record<string, any>;
   
  old: Record<string, any>;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  table?: string;
  schema?: string;
  commit_timestamp?: string;
}

export interface UseRealtimeMatchesOptions {
  debounceMs?: number;
  skipGlobalIfUnrelated?: boolean;
}

interface SharedChannelEntry {
  channel: RealtimeChannel;
  refCount: number;
  status: RealtimeConnectionStatus;
  hasConnectedOnce: boolean;
  lastEventTimestamps: Map<string, number>;
  subscribers: Set<{
    callback: (payload?: RealtimePayload) => void;
    onStatusChange: (status: RealtimeConnectionStatus) => void;
  }>;
  lastEventSignatures: Set<string>;
}

// Global reference-counted channel registry to eliminate duplicate subscriptions and random topic proliferation
const sharedChannelRegistry = new Map<string, SharedChannelEntry>();

/**
 * Production-hardened custom hook to subscribe to Postgres Realtime changes on `public.matches` and `public.tournaments`.
 * Features:
 * - Canonical, deterministic topic naming (eliminates per-client topic explosion in Phoenix).
 * - Multi-subscriber reference counting (safely shares channels between components without premature unmounting).
 * - Trailing-edge debouncing (protects against thundering herd re-fetches during rapid score changes).
 * - Event deduplication and out-of-order rejection.
 * - Automatic reconnection resynchronization.
 */
export function useRealtimeMatches(
  onUpdate: (payload?: RealtimePayload) => void,
  tournamentId?: string,
  matchId?: string,
  options?: UseRealtimeMatchesOptions
) {
  const debounceMs = options?.debounceMs ?? 400;
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>('connecting');

  // Keep reference to latest onUpdate callback without triggering effect re-runs
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  // Debounced callback invoker
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingPayloadRef = useRef<RealtimePayload | undefined>(undefined);

  const triggerDebouncedUpdate = useCallback(
    (payload?: RealtimePayload) => {
      pendingPayloadRef.current = payload;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        try {
          if (onUpdateRef.current) {
            onUpdateRef.current(pendingPayloadRef.current);
          }
        } catch (err) {
          console.warn('[Realtime match callback warning]', err);
        } finally {
          debounceTimerRef.current = null;
        }
      }, debounceMs);
    },
    [debounceMs]
  );

  useEffect(() => {
    let isMounted = true;

    // Canonical, deterministic topic naming
    const canonicalTopic = matchId
      ? `rt:m:${matchId}`
      : tournamentId
      ? `rt:t:${tournamentId}`
      : `rt:all`;

    const matchFilter = matchId ? `id=eq.${matchId}` : undefined;
    const tournamentFilter = tournamentId ? `id=eq.${tournamentId}` : undefined;

    const subscriber = {
      callback: (payload?: RealtimePayload) => {
        if (!isMounted) return;
        triggerDebouncedUpdate(payload);
      },
      onStatusChange: (newStatus: RealtimeConnectionStatus) => {
        if (isMounted) {
          setConnectionStatus(newStatus);
        }
      },
    };

    let entry = sharedChannelRegistry.get(canonicalTopic);

    if (entry) {
      // Channel already exists: increment reference count and register subscriber
      entry.refCount += 1;
      entry.subscribers.add(subscriber);
      setConnectionStatus(entry.status);
    } else {
      // First subscriber for this topic: initialize Supabase channel
      const supabase = createClient();

      entry = {
        channel: null as unknown as RealtimeChannel,
        refCount: 1,
        status: 'connecting',
        hasConnectedOnce: false,
        lastEventTimestamps: new Map(),
        subscribers: new Set([subscriber]),
        lastEventSignatures: new Set(),
      };
      sharedChannelRegistry.set(canonicalTopic, entry);

      const notifySubscribers = (payload: RealtimePayload) => {
        clearPublicCache();
        const currentEntry = sharedChannelRegistry.get(canonicalTopic);
        if (!currentEntry) return;

        const newRecord = payload.new || {};

        // 1. Out-of-order event check for matches table (discards stale delayed frames)
        if (payload.table === 'matches' && newRecord.id && newRecord.updated_at) {
          const rawDate = new Date(newRecord.updated_at);
          const recordTs = rawDate.getTime();
          // Validate timestamp: only evaluate and record finite timestamps to prevent NaN poisoning
          if (Number.isFinite(recordTs) && recordTs > 0) {
            const lastTs = currentEntry.lastEventTimestamps.get(newRecord.id);
            if (lastTs && Number.isFinite(lastTs) && recordTs < lastTs) {
              // Stale event arrived out of order: discard without applying
              return;
            }
            currentEntry.lastEventTimestamps.set(newRecord.id, recordTs);
          }
        }

        // 2. Event deduplication check
        const eventSig = `${payload.eventType}:${payload.table}:${newRecord.id || ''}:${newRecord.updated_at || newRecord.created_at || ''}`;
        if (eventSig.length > 10) {
          if (currentEntry.lastEventSignatures.has(eventSig)) {
            return; // Duplicate event frame ignored
          }
          currentEntry.lastEventSignatures.add(eventSig);
          if (currentEntry.lastEventSignatures.size > 200) {
            currentEntry.lastEventSignatures.clear();
          }
        }

        currentEntry.subscribers.forEach((sub) => {
          try {
            sub.callback(payload);
          } catch (cbErr) {
            console.warn('[Realtime dispatch warning]', cbErr);
          }
        });
      };

      const notifyStatusChange = (status: RealtimeConnectionStatus) => {
        const currentEntry = sharedChannelRegistry.get(canonicalTopic);
        if (!currentEntry) return;
        currentEntry.status = status;
        currentEntry.subscribers.forEach((sub) => {
          try {
            sub.onStatusChange(status);
          } catch { /* silent */ }
        });
      };

      try {
        const channel = supabase
          .channel(canonicalTopic)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'matches',
              ...(matchFilter ? { filter: matchFilter } : {}),
            },
            (payload) => {
              notifySubscribers({
                ...payload,
                table: 'matches',
                schema: 'public',
              } as RealtimePayload);
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
              notifySubscribers({
                ...payload,
                table: 'tournaments',
                schema: 'public',
              } as RealtimePayload);
            }
          )
          .subscribe((status, err) => {
            if (process.env.NODE_ENV === 'development') {
              console.log(`[Realtime matches status]: ${canonicalTopic} -> ${status}`, err || '');
            }

            if (status === 'SUBSCRIBED') {
              const currentEntry = sharedChannelRegistry.get(canonicalTopic);
              const isReconnecting = Boolean(currentEntry?.hasConnectedOnce);
              if (currentEntry) {
                currentEntry.hasConnectedOnce = true;
              }
              notifyStatusChange('connected');

              // Reconnection recovery: if reconnecting after dropout, trigger debounced resync
              if (isReconnecting) {
                notifySubscribers({
                  eventType: '*',
                  table: 'tournaments',
                  schema: 'public',
                  new: {},
                  old: {},
                });
              }
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              if (err && process.env.NODE_ENV === 'development') {
                console.warn('[Realtime matches channel notice]', err);
              }
              notifyStatusChange('reconnecting');
            }
          });

        entry.channel = channel;
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Realtime matches subscription error]:', err);
        }
        notifyStatusChange('disconnected');
      }
    }

    return () => {
      isMounted = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      const currentEntry = sharedChannelRegistry.get(canonicalTopic);
      if (!currentEntry) return;

      currentEntry.subscribers.delete(subscriber);
      currentEntry.refCount -= 1;

      if (currentEntry.refCount <= 0) {
        // Last subscriber departed: cleanly remove channel from Supabase client
        try {
          const supabase = createClient();
          if (currentEntry.channel) {
            supabase.removeChannel(currentEntry.channel).catch(() => {});
          }
        } catch {
          // Silent cleanup
        } finally {
          sharedChannelRegistry.delete(canonicalTopic);
        }
      }
    };
  }, [tournamentId, matchId, triggerDebouncedUpdate]);

  return { connectionStatus };
}
