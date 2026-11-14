/**
 * Centralized, strongly-typed TanStack Query keys factory.
 * Ensures consistent cache identity across all client components, hooks,
 * and background realtime synchronizers.
 */

export const queryKeys = {
  tournaments: {
    all: ['tournaments'] as const,
    lists: () => [...queryKeys.tournaments.all, 'list'] as const,
    list: (params?: { search?: string; status?: string; sort?: string }) =>
      [...queryKeys.tournaments.lists(), params ?? {}] as const,
    details: () => [...queryKeys.tournaments.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.tournaments.details(), id] as const,
    participants: (id: string) => [...queryKeys.tournaments.detail(id), 'participants'] as const,
    stageInfo: (id: string) => [...queryKeys.tournaments.detail(id), 'stageInfo'] as const,
    groups: (id: string) => [...queryKeys.tournaments.detail(id), 'groups'] as const,
    bracket: (id: string) => [...queryKeys.tournaments.detail(id), 'bracket'] as const,
    matches: (id: string) => [...queryKeys.tournaments.detail(id), 'matches'] as const,
  },

  matches: {
    all: ['matches'] as const,
    live: () => [...queryKeys.matches.all, 'live'] as const,
    user: (userId: string) => [...queryKeys.matches.all, 'user', userId] as const,
    tournament: (tournamentId: string) => [...queryKeys.matches.all, 'tournament', tournamentId] as const,
    detail: (matchId: string) => [...queryKeys.matches.all, 'detail', matchId] as const,
  },

  profile: {
    all: ['profile'] as const,
    detail: (userId: string) => [...queryKeys.profile.all, userId] as const,
  },

  dashboard: {
    all: ['dashboard'] as const,
    overview: (userId: string) => [...queryKeys.dashboard.all, 'overview', userId] as const,
    tournaments: (userId: string) => [...queryKeys.dashboard.all, 'tournaments', userId] as const,
    matches: (userId: string) => [...queryKeys.dashboard.all, 'matches', userId] as const,
    notifications: (userId: string) => [...queryKeys.dashboard.all, 'notifications', userId] as const,
  },

  wallet: {
    all: ['wallet'] as const,
    overview: (userId: string) => [...queryKeys.wallet.all, 'overview', userId] as const,
    transactions: (userId: string) => [...queryKeys.wallet.all, 'transactions', userId] as const,
  },

  cms: {
    all: ['cms'] as const,
    homepage: () => [...queryKeys.cms.all, 'homepage'] as const,
  },

  leaderboard: {
    all: ['leaderboard'] as const,
    rankings: (params?: Record<string, any>) => [...queryKeys.leaderboard.all, 'rankings', params ?? {}] as const,
  },
};
