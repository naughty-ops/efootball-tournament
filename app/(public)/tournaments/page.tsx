'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Trophy, Search, Flame, CheckCircle2, Clock, Filter,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getPublicTournaments } from '@/services/publicTournamentService';
import type { TournamentWithStats } from '@/services/tournamentService';
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches';
import { cn } from '@/lib/utils';
import { TournamentCard } from '@/components/tournament/TournamentCard';

const STATUS_FILTERS = [
  { key: 'all', label: 'All', icon: Filter },
  { key: 'ongoing', label: 'Live / Active', icon: Flame },
  { key: 'registration', label: 'Upcoming', icon: Clock },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
] as const;

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPublicTournaments({ search, status: statusFilter });
      setTournaments(data);
    } catch {
      setError('Unable to load tournaments. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(fetchData, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchData, search]);

  // Realtime subscription for tournament list updates
  useRealtimeMatches(fetchData);

  return (
    <div className="space-y-8 w-full overflow-hidden pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFFF00] text-[#08088F] text-[11px] font-black uppercase tracking-widest mb-2">
            🏆 Official Competitions
          </div>
          <h1 className="text-3xl sm:text-4xl font-black font-display text-white tracking-wider uppercase">
            Tournaments
          </h1>
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
              'flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider border transition-all',
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
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          <div className="h-64 rounded-[28px] bg-[#1818D4]/60 animate-pulse border border-white/10" />
          <div className="h-64 rounded-[28px] bg-[#1818D4]/60 animate-pulse border border-white/10" />
          <div className="h-64 rounded-[28px] bg-[#1818D4]/60 animate-pulse border border-white/10" />
        </div>
      ) : error ? (
        <Card className="p-12 text-center border-white/20 bg-[#1818D4] text-white rounded-[28px]">
          <p className="text-sm font-bold text-[#FF168B] mb-4">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchData} className="rounded-full border-white/30 text-white hover:bg-[#FFFF00] hover:text-[#08088F]">
            Try Again
          </Button>
        </Card>
      ) : tournaments.length === 0 ? (
        <Card className="p-12 text-center border-white/20 bg-[#1010C5] text-white rounded-[28px]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#3434FF] text-[#FFFF00] mb-4 shadow-lg">
            <Trophy className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-black font-display uppercase tracking-wide text-white">No tournaments found</h3>
          <p className="text-xs text-[#D9DCFF]/80 mt-2 max-w-sm mx-auto">
            {search
              ? 'No tournaments match your search criteria. Try a different query.'
              : statusFilter !== 'all'
              ? 'No tournaments currently match the selected status filter.'
              : 'No competitive tournaments are currently listed. Check back soon!'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {tournaments.map((t) => (
            <TournamentCard key={t.id} tournament={t} />
          ))}
        </div>
      )}
    </div>
  );
}
