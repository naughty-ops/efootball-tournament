'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Trophy, Search, ChevronRight, Users, Calendar, Loader2,
  Flame, CheckCircle2, Clock, Filter,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getPublicTournaments } from '@/services/publicTournamentService';
import type { TournamentWithStats } from '@/services/tournamentService';
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

const STATUS_FILTERS = [
  { key: 'all', label: 'All', icon: Filter },
  { key: 'ongoing', label: 'Live / Active', icon: Flame },
  { key: 'registration', label: 'Upcoming', icon: Clock },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
] as const;

function formatTournamentFormat(format: string) {
  switch (format) {
    case 'group_knockout': return 'Group + Knockout';
    case 'knockout': return 'Knockout';
    case 'league': return 'League';
    default: return format.replace(/_/g, ' ');
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'ongoing':
      return (
        <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white border-0 gap-1.5 text-[11px] font-bold">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
          </span>
          ACTIVE
        </Badge>
      );
    case 'registration':
      return <Badge variant="secondary" className="text-[11px] font-bold">REGISTRATION</Badge>;
    case 'completed':
      return <Badge variant="outline" className="text-[11px] font-bold text-muted-foreground">COMPLETED</Badge>;
    default:
      return <Badge variant="outline" className="text-[11px] font-bold capitalize">{status}</Badge>;
  }
}

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
    <div className="space-y-8 w-full overflow-hidden pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B3323] tracking-tight">
            Tournaments
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Browse ongoing, upcoming, and completed eFootball competitive leagues.
          </p>
        </div>
        <div className="relative w-full sm:w-72 shrink-0">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="tournament-search"
            placeholder="Search tournament..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs h-10 w-full bg-white"
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
              'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all',
              statusFilter === key
                ? 'bg-primary text-white border-primary shadow-sm'
                : 'bg-white text-muted-foreground border-border hover:border-primary/40 hover:text-[#0B3323]'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="min-h-[240px] flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
          <span className="text-xs font-semibold text-[#0B3323]">Loading Tournaments...</span>
        </div>
      ) : error ? (
        <Card className="p-12 text-center border-destructive/30 bg-destructive/5">
          <p className="text-sm font-medium text-destructive mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchData}>Try Again</Button>
        </Card>
      ) : tournaments.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary mb-3">
            <Trophy className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold text-[#0B3323]">No tournaments found</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {search
              ? 'No tournaments match your search criteria.'
              : statusFilter !== 'all'
              ? 'No tournaments with the selected status.'
              : 'No tournaments are currently listed.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {tournaments.map((t) => (
            <Card
              key={t.id}
              className="hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between bg-white border-border group"
            >
              <CardHeader className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  {getStatusBadge(t.status)}
                  <span className="text-xs font-extrabold text-primary bg-secondary px-2.5 py-1 rounded-lg border border-primary/10 uppercase tracking-wide shrink-0">
                    {formatTournamentFormat(t.format)}
                  </span>
                </div>
                <CardTitle className="text-base font-bold text-[#0B3323] group-hover:text-primary transition-colors line-clamp-2">
                  {t.name}
                </CardTitle>
                {t.description && (
                  <CardDescription className="text-xs line-clamp-2">
                    {t.description}
                  </CardDescription>
                )}
              </CardHeader>

              <CardContent className="pt-2 text-xs text-muted-foreground border-t border-border/50 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs py-1.5 px-3 rounded-xl bg-[#F4F8F5]">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <span>{t.participant_count}/{t.max_participants} Players</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground justify-end">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    <span>{formatDate(t.start_date)}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-1">
                  <span className="text-[11px] text-muted-foreground">
                    {t.end_date ? `Ends ${formatDate(t.end_date)}` : 'End date TBD'}
                  </span>
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs text-primary font-bold gap-1 -mr-2">
                    <Link href={`/tournaments/${t.id}`}>
                      <span>View</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
