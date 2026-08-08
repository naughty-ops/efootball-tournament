'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Trophy,
  Plus,
  Search,
  ArrowUpDown,
  Eye,
  Edit,
  Trash2,
  Calendar,
  Users,
  AlertCircle,
} from 'lucide-react';
import {
  getTournaments,
  deleteTournament,
  TournamentWithStats,
} from '@/services/tournamentService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/utils';
import { ConfirmModal } from '@/components/ui/modal';

const STATUS_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Registration', value: 'registration' },
  { label: 'Ongoing', value: 'ongoing' },
  { label: 'Completed', value: 'completed' },
];

export default function AdminTournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search Controls
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'start_date'>('newest');

  // Deletion Modal State
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchTournamentsList = useCallback(async () => {
    try {
      const data = await getTournaments({
        search,
        status: selectedStatus,
        sort: sortBy,
      });
      setTournaments(data);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch tournaments';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [search, selectedStatus, sortBy]);

  useEffect(() => {
    let isMounted = true;
    
    async function loadData() {
      try {
        const data = await getTournaments({
          search,
          status: selectedStatus,
          sort: sortBy,
        });
        if (isMounted) {
          setTournaments(data);
          setError(null);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to fetch tournaments';
          setError(msg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [search, selectedStatus, sortBy]);

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      await deleteTournament(deletingId);
      setDeletingId(null);
      fetchTournamentsList();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Deletion failed';
      alert(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8 pb-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
            Tournament Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create, edit, track statuses, and manage competitive tournaments.
          </p>
        </div>

        <Button asChild size="lg" className="font-bold gap-2 self-start sm:self-auto shadow-md">
          <Link href="/admin/tournaments/new">
            <Plus className="h-5 w-5" />
            <span>Create Tournament</span>
          </Link>
        </Button>
      </div>

      {/* Search, Status Tabs, and Sorting Controls */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by tournament name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 text-xs bg-white border-border"
            />
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <span className="text-xs text-muted-foreground font-medium hidden sm:inline">Sort:</span>
            <select
              value={sortBy}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value as 'newest' | 'oldest' | 'start_date')}
              className="h-10 px-3 rounded-xl border border-border bg-white text-xs font-semibold text-[#0B3323] focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="start_date">Start Date</option>
            </select>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {STATUS_TABS.map((tab) => {
            const isActive = selectedStatus === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => {
                  setLoading(true);
                  setSelectedStatus(tab.value);
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap touch-target ${
                  isActive
                    ? 'bg-[#0B3323] text-white shadow-xs'
                    : 'bg-white border border-border text-muted-foreground hover:bg-secondary hover:text-[#0B3323]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchTournamentsList(); }} className="h-7 text-xs">
            Retry
          </Button>
        </div>
      )}

      {/* Content State: Loading, Empty, or Data */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse space-y-4 p-6">
              <div className="h-4 bg-muted rounded w-1/3" />
              <div className="h-6 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="h-10 bg-muted rounded w-full mt-4" />
            </Card>
          ))}
        </div>
      ) : tournaments.length === 0 ? (
        <Card className="border-dashed border-2 p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-primary mb-4">
            <Trophy className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-[#0B3323]">No tournaments found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-6">
            {search || selectedStatus !== 'all'
              ? 'No tournaments match your filter criteria. Try adjusting your search or status filter.'
              : 'No tournaments yet. Create your first tournament to start managing brackets.'}
          </p>
          <Button asChild className="font-bold gap-2">
            <Link href="/admin/tournaments/new">
              <Plus className="h-4 w-4" />
              <span>Create Tournament</span>
            </Link>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((t) => (
            <Card key={t.id} className="hover:border-primary/50 transition-all flex flex-col justify-between group bg-white border-border">
              <CardHeader className="space-y-3 pb-3">
                <div className="flex items-center justify-between">
                  <Badge
                    variant={
                      t.status === 'ongoing'
                        ? 'default'
                        : t.status === 'registration'
                        ? 'secondary'
                        : t.status === 'completed'
                        ? 'outline'
                        : 'efootball'
                    }
                    className="capitalize font-bold text-[11px]"
                  >
                    {t.status}
                  </Badge>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {t.format.replace('_', ' + ')}
                  </span>
                </div>

                <div>
                  <CardTitle className="text-base font-extrabold text-[#0B3323] group-hover:text-primary transition-colors line-clamp-1">
                    {t.name}
                  </CardTitle>
                  <CardDescription className="text-xs line-clamp-2 mt-1">
                    {t.description || 'No description provided.'}
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-0">
                <div className="grid grid-cols-2 gap-2 text-xs py-2 px-3 rounded-xl bg-[#F4F8F5] border border-border/50">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <span>{t.participant_count}/{t.max_participants} Players</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground justify-end">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    <span>{formatDate(t.start_date)}</span>
                  </div>
                </div>

                {t.status === 'completed' && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[#0B3323] text-xs font-bold flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="truncate">Status: Completed</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-border/40 gap-2">
                  <Button asChild variant="outline" size="sm" className="h-8 px-2.5 text-xs font-semibold text-[#0B3323]">
                    <Link href={`/admin/tournaments/${t.id}`}>
                      <Eye className="h-3.5 w-3.5 mr-1 text-primary" />
                      View
                    </Link>
                  </Button>

                  <Button asChild variant="outline" size="sm" className="h-8 px-2.5 text-xs font-semibold text-[#0B3323]">
                    <Link href={`/admin/tournaments/${t.id}/edit`}>
                      <Edit className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                      Edit
                    </Link>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingId(t.id)}
                    className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingId)}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Tournament"
        description="This action will permanently delete this tournament and its associated participants, rounds, and matches from Supabase. This action cannot be undone."
        confirmText="Yes, Delete"
        variant="destructive"
        isLoading={isDeleting}
      />
    </div>
  );
}
