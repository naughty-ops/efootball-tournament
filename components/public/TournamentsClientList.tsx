'use client';

import React, { useEffect, useCallback, useMemo } from 'react';
import {
  Trophy,
  Search,
  Flame,
  CheckCircle2,
  Clock,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { TournamentWithStats } from '@/services/tournamentService';
import { useTournamentsQuery } from '@/hooks/queries/useTournamentsQuery';
import { useTournamentFilterStore } from '@/lib/stores/useTabStateStore';
import { useRealtimeMatches, type RealtimePayload } from '@/hooks/useRealtimeMatches';
import { cn } from '@/lib/utils';
import { TournamentCard } from '@/components/tournament/TournamentCard';

const STATUS_FILTERS = [
  { key: 'all', label: 'All', icon: Filter },
  { key: 'ongoing', label: 'Live / Active', icon: Flame },
  { key: 'registration', label: 'Upcoming', icon: Clock },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
] as const;

interface TournamentsClientListProps {
  initialTournaments: TournamentWithStats[];
}

export default function TournamentsClientList({
  initialTournaments,
}: TournamentsClientListProps) {
  // Global persistent filter store: remembers query and filter when navigating back from detail tabs
  const { search, statusFilter, scrollY, setSearch, setStatusFilter, setScrollY } =
    useTournamentFilterStore();

  // Centralized TanStack Query hook with SWR cache and initialData hydration
  const {
    data: allTournaments = initialTournaments,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useTournamentsQuery({
    initialData: initialTournaments,
  });

  // Restore scroll position when returning from tournament detail
  useEffect(() => {
    if (scrollY > 0) {
      window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior });
    }
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [scrollY, setScrollY]);

  // Instantaneous in-memory filtering: 0ms response time, 0 network requests
  const tournaments = useMemo(() => {
    return allTournaments.filter((t) => {
      // 1. Status Filter
      if (statusFilter !== 'all' && t.status !== statusFilter) {
        return false;
      }
      // 2. Search Query Filter
      if (search.trim()) {
        const query = search.toLowerCase().trim();
        const matchesName = t.name.toLowerCase().includes(query);
        const matchesDesc = (t.description || '').toLowerCase().includes(query);
        const matchesFormat = (t.format || '').toLowerCase().includes(query);
        if (!matchesName && !matchesDesc && !matchesFormat) {
          return false;
        }
      }
      return true;
    });
  }, [allTournaments, statusFilter, search]);

  // Realtime subscription: silently refreshes query cache in background without UI destruction
  const handleRealtimeUpdate = useCallback(
    (payload?: RealtimePayload) => {
      if (!payload || payload.table === 'tournaments') {
        refetch();
      }
    },
    [refetch]
  );

  useRealtimeMatches(handleRealtimeUpdate);

  return (
    <div className="space-y-8 w-full overflow-hidden pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFFF00] text-[#08088F] text-[11px] font-black uppercase tracking-widest mb-2">
            🏆 Official Competitions
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl sm:text-4xl font-black font-display text-white tracking-wider uppercase">
              Tournaments
            </h1>
            {isFetching && !isLoading && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-[#FFFF00]/80 bg-white/10 px-2.5 py-0.5 rounded-full animate-pulse">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Syncing...
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[#D9DCFF]/80 mt-1 font-medium">
            Browse ongoing, upcoming, and completed eFootball competitive leagues.
          </p>
        </div>
        <div className="relative w-full sm:w-72 shrink-0">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#D9DCFF]/60" />
          <Input
            id="tournament-search"
            placeholder="Search tournaments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 text-xs h-11 w-full bg-[#0A0A7A] border-white/20 text-white placeholder:text-[#D9DCFF]/50 rounded-full focus-visible:border-[#FFFF00] focus-visible:ring-1 focus-visible:ring-[#FFFF00]"
          />
        </div>
      </div>

      {/* Status Filters */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            id={`filter-${key}`}
            onClick={() => setStatusFilter(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider border transition-all active:scale-95 cursor-pointer',
              statusFilter === key
                ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.35)] scale-[1.02]'
                : 'bg-[#1010C5] text-white/90 border-white/20 hover:border-[#FFFF00] hover:text-white'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-56 rounded-3xl bg-[#1414C8]/50 animate-pulse border border-white/10"
            />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-16 bg-[#1010C5] rounded-3xl border border-white/15 p-8 max-w-md mx-auto">
          <p className="text-sm text-[#FF168B] font-bold mb-4">
            Failed to load tournaments. Please check your connection.
          </p>
          <button
            onClick={() => refetch()}
            className="px-5 py-2 rounded-full bg-[#FFFF00] text-[#08088F] font-black text-xs uppercase cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="text-center py-16 bg-[#1010C5] rounded-3xl border border-white/15 p-8 max-w-md mx-auto">
          <Trophy className="h-12 w-12 text-[#FFFF00] mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-black font-display uppercase text-white mb-1">
            No Tournaments Found
          </h3>
          <p className="text-xs text-[#D9DCFF]/70">
            {search
              ? 'No competitions match your search query.'
              : 'There are currently no tournaments matching this filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {tournaments.map((tournament, index) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              priority={index < 3}
            />
          ))}
        </div>
      )}
    </div>
  );
}
