'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { recordMemberHeartbeat, leaveMemberPresence, type MemberPresenceStatus } from '@/services/memberPresenceService';

interface UseMemberPresenceOptions {
  userId?: string | null;
  activity?: string;
  heartbeatIntervalMs?: number; // default 15000 (15s)
  idleTimeoutMs?: number; // default 120000 (2 minutes)
}

export function useMemberPresence({
  userId,
  activity = 'In Arena Lobby',
  heartbeatIntervalMs = 15000,
  idleTimeoutMs = 120000,
}: UseMemberPresenceOptions) {
  const [presenceStatus, setPresenceStatus] = useState<MemberPresenceStatus>('alive');
  const sessionIdRef = useRef<string>('');
  const lastActiveTimestampRef = useRef<number>(Date.now());
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleCheckTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize unique tab session ID
  useEffect(() => {
    if (typeof window !== 'undefined') {
      let sid = sessionStorage.getItem('efootball_member_presence_sid');
      if (!sid) {
        sid = `sess_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
        sessionStorage.setItem('efootball_member_presence_sid', sid);
      }
      sessionIdRef.current = sid;
    }
  }, []);

  const sendHeartbeat = useCallback(
    async (overrideStatus?: MemberPresenceStatus) => {
      if (!userId) return;

      const currentStatus =
        overrideStatus ||
        (document.visibilityState === 'hidden'
          ? 'idle'
          : Date.now() - lastActiveTimestampRef.current > idleTimeoutMs
          ? 'idle'
          : 'alive');

      setPresenceStatus(currentStatus);
      await recordMemberHeartbeat(sessionIdRef.current, currentStatus, activity);
    },
    [userId, activity, idleTimeoutMs]
  );

  // Reset idle timer on user activity
  const handleUserActivity = useCallback(() => {
    lastActiveTimestampRef.current = Date.now();
    if (presenceStatus === 'idle' && document.visibilityState === 'visible') {
      setPresenceStatus('alive');
      sendHeartbeat('alive');
    }
  }, [presenceStatus, sendHeartbeat]);

  useEffect(() => {
    if (!userId) return;

    // Send immediate heartbeat on mount
    sendHeartbeat('alive');

    // Recurring heartbeat interval (15 seconds)
    heartbeatTimerRef.current = setInterval(() => {
      sendHeartbeat();
    }, heartbeatIntervalMs);

    // Idle check timer (every 10 seconds)
    idleCheckTimerRef.current = setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastActiveTimestampRef.current > idleTimeoutMs &&
        presenceStatus !== 'idle'
      ) {
        setPresenceStatus('idle');
        sendHeartbeat('idle');
      }
    }, 10000);

    // Visibility change listener
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setPresenceStatus('idle');
        sendHeartbeat('idle');
      } else {
        lastActiveTimestampRef.current = Date.now();
        setPresenceStatus('alive');
        sendHeartbeat('alive');
      }
    };

    // User interaction listeners
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach((evt) => {
      window.addEventListener(evt, handleUserActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Page teardown / close (best-effort)
    const handleTeardown = () => {
      leaveMemberPresence(sessionIdRef.current, false);
    };
    window.addEventListener('pagehide', handleTeardown);
    window.addEventListener('beforeunload', handleTeardown);

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (idleCheckTimerRef.current) clearInterval(idleCheckTimerRef.current);
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, handleUserActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleTeardown);
      window.removeEventListener('beforeunload', handleTeardown);
      // Best-effort cleanup on unmount
      leaveMemberPresence(sessionIdRef.current, false);
    };
  }, [userId, activity, heartbeatIntervalMs, idleTimeoutMs, handleUserActivity, sendHeartbeat]);

  return {
    presenceStatus,
    sendHeartbeat,
  };
}
