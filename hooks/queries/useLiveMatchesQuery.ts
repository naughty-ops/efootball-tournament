'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getPublicLiveMatches, type LiveMatchEntry } from '@/services/publicTournamentService';

export interface UseLiveMatchesQueryParams {
  initialData?: LiveMatchEntry[];
  enabled?: boolean;
}

/**
 * Realtime-friendly TanStack Query hook for live match broadcasts.
 * Caches live match listings with 15s staleTime for timely score synchronization.
 */
export function useLiveMatchesQuery(params?: UseLiveMatchesQueryParams) {
  const { initialData, enabled = true } = params ?? {};

  return useQuery({
    queryKey: queryKeys.matches.live(),
    queryFn: async () => {
      return await getPublicLiveMatches();
    },
    initialData,
    staleTime: 15 * 1000, // 15 seconds fresh
    gcTime: 5 * 60 * 1000,
    enabled,
    refetchOnWindowFocus: false,
  });
}
