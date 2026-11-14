'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { createClient } from '@/lib/supabase/client';
import {
  getPlayerProfile,
  getPlayerTournaments,
  getPlayerMatches,
  calculatePlayerOverviewStats,
  type PlayerTournamentItem,
  type PlayerMatchItem,
  type PlayerOverviewStats,
} from '@/services/playerDashboardService';
import { getPlayerWalletOverview } from '@/services/walletService';
import type { Profile } from '@/types/database';

export interface UsePlayerDashboardOptions {
  userId?: string;
  initialProfile?: Profile | null;
  initialTournaments?: PlayerTournamentItem[];
  initialMatches?: PlayerMatchItem[];
  initialWalletOverview?: any;
}

/**
 * High-performance hook for player dashboard data with SWR caching.
 * Prevents redundant fetches when switching between dashboard sub-tabs:
 * /dashboard -> /dashboard/tournaments -> /dashboard/matches -> /dashboard/wallet
 */
export function usePlayerProfileQuery(userId?: string, initialProfile?: Profile | null) {
  return useQuery<Profile | null>({
    queryKey: queryKeys.profile.detail(userId || 'current'),
    queryFn: async () => {
      if (!userId) return null;
      const supabase = createClient();
      return await getPlayerProfile(supabase, userId);
    },
    initialData: initialProfile,
    staleTime: 120 * 1000, // 2 minutes
    gcTime: 15 * 60 * 1000,
    enabled: Boolean(userId),
  });
}

export function usePlayerTournamentsQuery(userId?: string, initialTournaments?: PlayerTournamentItem[]) {
  return useQuery<PlayerTournamentItem[]>({
    queryKey: queryKeys.dashboard.tournaments(userId || 'current'),
    queryFn: async () => {
      if (!userId) return [];
      const supabase = createClient();
      const res = await getPlayerTournaments(supabase, userId);
      return res.data || [];
    },
    initialData: initialTournaments,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 15 * 60 * 1000,
    enabled: Boolean(userId),
  });
}

export function usePlayerMatchesQuery(userId?: string, initialMatches?: PlayerMatchItem[]) {
  return useQuery<PlayerMatchItem[]>({
    queryKey: queryKeys.dashboard.matches(userId || 'current'),
    queryFn: async () => {
      if (!userId) return [];
      const supabase = createClient();
      const res = await getPlayerMatches(supabase, userId);
      return res.data || [];
    },
    initialData: initialMatches,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 15 * 60 * 1000,
    enabled: Boolean(userId),
  });
}

export function usePlayerWalletOverviewQuery(userId?: string, initialWallet?: any) {
  return useQuery({
    queryKey: queryKeys.wallet.overview(userId || 'current'),
    queryFn: async () => {
      if (!userId) return null;
      return await getPlayerWalletOverview(userId);
    },
    initialData: initialWallet,
    staleTime: 45 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled: Boolean(userId),
  });
}

export function usePlayerOverviewStatsQuery(
  tournaments: PlayerTournamentItem[],
  matches: PlayerMatchItem[]
): PlayerOverviewStats {
  return calculatePlayerOverviewStats(tournaments, matches);
}
