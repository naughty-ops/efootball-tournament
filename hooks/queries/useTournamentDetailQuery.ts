'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import {
  getPublicTournament,
  getPublicTournamentStageInfo,
  getPublicParticipants,
  getPublicGroupStage,
  getPublicBracket,
  getPublicMatches,
  type PublicParticipant,
} from '@/services/publicTournamentService';
import type { TournamentWithStats } from '@/services/tournamentService';
import type { GroupStageOverview } from '@/services/groupService';
import type { BracketOverview } from '@/services/bracketService';
import type { RoundWithMatches } from '@/services/matchService';

/**
 * High-performance hook for tournament detail data with tab-specific sub-queries.
 * Each dataset is independently cached with SWR so switching between
 * Overview -> Participants -> Groups -> Bracket -> Matches is instantaneous.
 */
export function useTournamentDetailQuery(tournamentId: string, initialTournament?: TournamentWithStats | null) {
  const tournamentQuery = useQuery<TournamentWithStats | null>({
    queryKey: queryKeys.tournaments.detail(tournamentId),
    queryFn: async () => {
      if (!tournamentId) return null;
      return await getPublicTournament(tournamentId);
    },
    initialData: initialTournament,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: Boolean(tournamentId),
  });

  return {
    tournament: tournamentQuery.data,
    isLoading: tournamentQuery.isLoading,
    isFetching: tournamentQuery.isFetching,
    error: tournamentQuery.error,
    refetch: tournamentQuery.refetch,
  };
}

export function useTournamentParticipantsQuery(tournamentId: string, initialParticipants?: PublicParticipant[]) {
  return useQuery<PublicParticipant[]>({
    queryKey: queryKeys.tournaments.participants(tournamentId),
    queryFn: async () => {
      if (!tournamentId) return [];
      return await getPublicParticipants(tournamentId);
    },
    initialData: initialParticipants,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: Boolean(tournamentId),
  });
}

export function useTournamentStageInfoQuery(tournamentId: string, initialStageInfo?: Record<string, any> | null) {
  return useQuery({
    queryKey: queryKeys.tournaments.stageInfo(tournamentId),
    queryFn: async () => {
      if (!tournamentId) return null;
      return await getPublicTournamentStageInfo(tournamentId);
    },
    initialData: initialStageInfo,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: Boolean(tournamentId),
  });
}

export function useTournamentGroupsQuery(tournamentId: string, enabled = false) {
  return useQuery<GroupStageOverview | null>({
    queryKey: queryKeys.tournaments.groups(tournamentId),
    queryFn: async () => {
      if (!tournamentId) return null;
      return await getPublicGroupStage(tournamentId);
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: Boolean(tournamentId) && enabled,
  });
}

export function useTournamentBracketQuery(tournamentId: string, enabled = false) {
  return useQuery<BracketOverview | null>({
    queryKey: queryKeys.tournaments.bracket(tournamentId),
    queryFn: async () => {
      if (!tournamentId) return null;
      return await getPublicBracket(tournamentId);
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: Boolean(tournamentId) && enabled,
  });
}

export function useTournamentMatchesQuery(tournamentId: string, enabled = false) {
  return useQuery<RoundWithMatches[]>({
    queryKey: queryKeys.tournaments.matches(tournamentId),
    queryFn: async () => {
      if (!tournamentId) return [];
      return await getPublicMatches(tournamentId);
    },
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: Boolean(tournamentId) && enabled,
  });
}
