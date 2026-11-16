'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getAliveMembersDirectory,
  getAliveMembersCounts,
  type MemberPresenceItem,
  type MemberPresenceCounts,
} from '@/services/memberPresenceService';

export function useAliveMembersDirectory() {
  const [members, setMembers] = useState<MemberPresenceItem[]>([]);
  const [counts, setCounts] = useState<MemberPresenceCounts>({
    total_alive: 0,
    total_idle: 0,
    total_offline: 0,
    total_members: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const fetchDirectory = useCallback(async () => {
    const [dirRes, countsRes] = await Promise.all([
      getAliveMembersDirectory(),
      getAliveMembersCounts(),
    ]);

    if (!isMountedRef.current) return;

    if (dirRes.success) {
      setMembers(dirRes.members);
    } else if (dirRes.error) {
      setError(dirRes.error);
    }

    if (countsRes.success) {
      setCounts(countsRes.counts);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchDirectory();

    // 30s reconciliation interval for server-expired heartbeats
    const reconciliationInterval = setInterval(() => {
      fetchDirectory();
    }, 30000);

    // Supabase Realtime channel subscription with unique topic to prevent React 19 remount collision
    const supabase = createClient();
    const channelId = `alive-members-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'member_presence',
        },
        () => {
          fetchDirectory();
        }
      )
      .subscribe();

    return () => {
      isMountedRef.current = false;
      clearInterval(reconciliationInterval);
      supabase.removeChannel(channel);
    };
  }, [fetchDirectory]);

  return {
    members,
    counts,
    loading,
    error,
    refresh: fetchDirectory,
  };
}
