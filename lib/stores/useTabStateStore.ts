'use client';

import { create } from 'zustand';

interface TournamentFilterState {
  search: string;
  statusFilter: string;
  sortBy: 'newest' | 'oldest' | 'start_date';
  scrollY: number;
  setSearch: (search: string) => void;
  setStatusFilter: (status: string) => void;
  setSortBy: (sort: 'newest' | 'oldest' | 'start_date') => void;
  setScrollY: (y: number) => void;
  reset: () => void;
}

export const useTournamentFilterStore = create<TournamentFilterState>((set) => ({
  search: '',
  statusFilter: 'all',
  sortBy: 'newest',
  scrollY: 0,
  setSearch: (search) => set({ search }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setSortBy: (sortBy) => set({ sortBy }),
  setScrollY: (scrollY) => set({ scrollY }),
  reset: () => set({ search: '', statusFilter: 'all', sortBy: 'newest', scrollY: 0 }),
}));

interface PlayerDashboardTabState {
  competitionSubTab: 'registered' | 'explore' | 'payment_pending';
  matchesFilter: 'all' | 'upcoming' | 'completed' | 'live';
  tournamentSearch: string;
  setCompetitionSubTab: (tab: 'registered' | 'explore' | 'payment_pending') => void;
  setMatchesFilter: (filter: 'all' | 'upcoming' | 'completed' | 'live') => void;
  setTournamentSearch: (q: string) => void;
}

export const usePlayerDashboardTabStore = create<PlayerDashboardTabState>((set) => ({
  competitionSubTab: 'registered',
  matchesFilter: 'all',
  tournamentSearch: '',
  setCompetitionSubTab: (competitionSubTab) => set({ competitionSubTab }),
  setMatchesFilter: (matchesFilter) => set({ matchesFilter }),
  setTournamentSearch: (tournamentSearch) => set({ tournamentSearch }),
}));
