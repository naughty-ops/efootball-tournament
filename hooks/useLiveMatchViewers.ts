'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  recordMatchViewerHeartbeat,
  leaveMatchViewer,
  getActiveMatchViewersCount,
  getPersistentViewerSessionId,
  getViewerDeviceType,
} from '@/services/viewerSessionService';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type ViewerPresenceStatus = 'joining' | 'watching' | 'reconnecting' | 'inactive' | 'left';

export interface UseLiveMatchViewersResult {
  viewerCount: number;
  status: ViewerPresenceStatus;
  isInitialLoading: boolean;
}

const HEARTBEAT_INTERVAL_MS = 20_000; // 20s heartbeat for 35s server expiration

export function useLiveMatchViewers(matchId: string): UseLiveMatchViewersResult {
  const [viewerCount, setViewerCount] = useState<number>(0);
  const [status, setStatus] = useState<ViewerPresenceStatus>('joining');
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);

  const sessionIdRef = useRef<string>('');
  const presenceKeyRef = useRef<string>('');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Authoritative heartbeat dispatch
  const sendHeartbeat = useCallback(async () => {
    if (!matchId || !sessionIdRef.current || !isMountedRef.current) return;

    try {
      const res = await recordMatchViewerHeartbeat(matchId, sessionIdRef.current);
      if (isMountedRef.current && res.success) {
        // Reconcile count: take the authoritative database count if higher or matching
        setViewerCount((prev) => (res.viewer_count > 0 ? res.viewer_count : Math.max(1, prev)));
        setStatus('watching');
      }
    } catch (err) {
      console.warn('[useLiveMatchViewers] Heartbeat error:', err);
    }
  }, [matchId]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!matchId) return;

    const supabase = createClient();
    const sessionId = getPersistentViewerSessionId();
    sessionIdRef.current = sessionId;

    let presenceKey = sessionId;
    presenceKeyRef.current = presenceKey;

    let isDisposed = false;

    async function initViewerPresence() {
      // 1. Determine user identity for deduplication
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          presenceKey = user.id;
          presenceKeyRef.current = user.id;
        }
      } catch {
        // Fallback to sessionId
      }

      if (isDisposed) return;

      // 2. Fetch authoritative initial count from database
      try {
        const initialCount = await getActiveMatchViewersCount(matchId);
        if (!isDisposed) {
          setViewerCount(Math.max(1, initialCount));
        }
      } catch {
        if (!isDisposed) setViewerCount(1);
      } finally {
        if (!isDisposed) setIsInitialLoading(false);
      }

      // 3. Connect Supabase Realtime Presence Channel
      const channelTopic = `match_presence_${matchId}`;
      const channel = supabase.channel(channelTopic, {
        config: {
          presence: {
            key: presenceKey,
          },
        },
      });
      channelRef.current = channel;

      // Calculate unique viewers from Phoenix Presence state
      const updatePresenceCount = () => {
        if (isDisposed || !channel) return;
        const state = channel.presenceState();
        // Object.keys(state) automatically deduplicates tabs by presenceKey
        const uniqueKeysCount = Object.keys(state).length;
        if (uniqueKeysCount > 0) {
          setViewerCount(uniqueKeysCount);
        }
      };

      channel
        .on('presence', { event: 'sync' }, () => {
          updatePresenceCount();
        })
        .on('presence', { event: 'join' }, () => {
          updatePresenceCount();
        })
        .on('presence', { event: 'leave' }, () => {
          updatePresenceCount();
        })
        .subscribe(async (subStatus) => {
          if (subStatus === 'SUBSCRIBED') {
            setStatus('watching');
            // Track presence in the room
            await channel.track({
              user_id: presenceKey !== sessionId ? presenceKey : null,
              session_id: sessionId,
              online_at: new Date().toISOString(),
              device_type: getViewerDeviceType(),
            });

            // Send initial DB heartbeat
            await sendHeartbeat();
          } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
            setStatus('reconnecting');
          } else if (subStatus === 'CLOSED') {
            setStatus('left');
          }
        });

      // 4. Start periodic 20s heartbeat to keep database expiration alive
      heartbeatTimerRef.current = setInterval(() => {
        void sendHeartbeat();
      }, HEARTBEAT_INTERVAL_MS);
    }

    void initViewerPresence();

    // 5. Lifecycle event handlers: visibilitychange & pagehide
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setStatus('watching');
        void sendHeartbeat();
      } else {
        setStatus('inactive');
      }
    };

    const handleDeparture = () => {
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
      }
      if (sessionIdRef.current && matchId) {
        // Explicitly register departure in database
        void leaveMatchViewer(matchId, sessionIdRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleDeparture);
    window.addEventListener('beforeunload', handleDeparture);

    return () => {
      isDisposed = true;
      isMountedRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleDeparture);
      window.removeEventListener('beforeunload', handleDeparture);

      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }

      handleDeparture();
    };
  }, [matchId, sendHeartbeat]);

  return {
    viewerCount,
    status,
    isInitialLoading,
  };
}
