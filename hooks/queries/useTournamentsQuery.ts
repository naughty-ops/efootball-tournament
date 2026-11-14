'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getPublicTournaments } from '@/services/publicTournamentService';
import type { TournamentWithStats } from '@/services/tournamentService';

export interface UseTournamentsQueryParams {
  search?: string;
  status?: string;
  sort?: string;
  initialData?: TournamentWithStats[];
  enabled?: boolean;
}

/**
 * High-performance TanStack Query hook for public tournaments.
 * Features:
 * - SWR caching (60s staleTime, 10m gcTime)
 * - Server initialData hydration for zero FCP delay
 * - Automatic query deduplication across navigation tabs
 */
export function useTournamentsQuery(params?: UseTournamentsQueryParams) {
  const { search, status, sort, initialData, enabled = true } = params ?? {};

  return useQuery({
    queryKey: queryKeys.tournaments.list({ search, status, sort }),
    queryFn: async () => {
      return await getPublicTournaments({
        search,
        status,
      });
    },
    initialData,
    staleTime: 45 * 1000, // 45 seconds fresh
    gcTime: 10 * 60 * 1000, // 10 minutes cache retention
    enabled,
    refetchOnWindowFocus: false,
  });
}
