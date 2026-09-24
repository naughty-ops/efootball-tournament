'use client';

import React, { useEffect, useRef } from 'react';
import { startViewerSession, closeViewerSession } from '@/services/viewerSessionService';

interface ViewerSessionTrackerProps {
  matchId: string;
}

export function ViewerSessionTracker({ matchId }: ViewerSessionTrackerProps) {
  const sessionIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    // Generate non-PII browser session ID
    let sId = sessionStorage.getItem(`v_sess_${matchId}`);
    if (!sId) {
      sId = `sess_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
      try {
        sessionStorage.setItem(`v_sess_${matchId}`, sId);
      } catch {
        // Fallback for private browsing
      }
    }
    sessionIdRef.current = sId;
    startTimeRef.current = Date.now();

    // Detect device type
    let deviceType = 'desktop';
    if (typeof window !== 'undefined') {
      const w = window.innerWidth;
      const ua = navigator.userAgent.toLowerCase();
      if (w < 768 || /iphone|android|mobile/.test(ua)) {
        deviceType = 'mobile';
      } else if (w < 1024 || /ipad|tablet/.test(ua)) {
        deviceType = 'tablet';
      }
    }

    // Start session in background
    startViewerSession(matchId, sId, deviceType);

    const handleUnload = () => {
      if (sessionIdRef.current) {
        const durationSec = Math.round((Date.now() - startTimeRef.current) / 1000);
        closeViewerSession(sessionIdRef.current, durationSec);
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      handleUnload();
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [matchId]);

  return null;
}
