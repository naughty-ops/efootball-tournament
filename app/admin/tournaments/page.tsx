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
  TournamentWithStats,
} from '@/services/tournamentService';
import { deleteTournamentAction } from '@/app/actions/tournamentActions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { TournamentCard } from '@/components/tournament/TournamentCard';
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
        includeDrafts: true,
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
          includeDrafts: true,
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
      const res = await deleteTournamentAction(deletingId);
      if (!res.success) {
        alert(res.message);
      } else {
        setDeletingId(null);
        fetchTournamentsList();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Deletion failed';
      alert(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8 pb-8 text-white">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-white font-display uppercase tracking-wider">
            Tournament Management
          </h1>
          <p className="text-xs sm:text-sm text-white/70 mt-1">
            Create, edit, track statuses, and manage competitive tournaments.
          </p>
        </div>

        <Button asChild size="lg" className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black uppercase tracking-wider gap-2 rounded-full self-start sm:self-auto shadow-lg cursor-pointer">
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
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-white/50" />
            <Input
              placeholder="Search by tournament name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 text-xs bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 focus:border-[#FFFF00] rounded-full"
            />
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-white/60 hidden sm:block" />
            <span className="text-xs text-white/70 font-bold uppercase tracking-wider hidden sm:inline">Sort:</span>
            <select
              value={sortBy}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value as 'newest' | 'oldest' | 'start_date')}
              className="h-10 px-4 rounded-full border border-white/20 bg-[#0A0A7A] text-xs font-bold text-white focus:outline-none focus:border-[#FFFF00] cursor-pointer"
            >
              <option value="newest" className="bg-[#0A0A7A] text-white">Newest First</option>
              <option value="oldest" className="bg-[#0A0A7A] text-white">Oldest First</option>
              <option value="start_date" className="bg-[#0A0A7A] text-white">Start Date</option>
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
                className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#FFFF00] text-[#08088F] shadow-md border border-[#FFFF00]'
                    : 'bg-[#1010C5] border border-white/20 text-white/80 hover:border-white/40 hover:text-white'
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
        <div className="p-4 rounded-2xl bg-destructive/20 border border-destructive/40 text-red-200 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchTournamentsList(); }} className="h-7 text-xs border-white/30 text-white hover:bg-white/10 rounded-full">
            Retry
          </Button>
        </div>
      )}

      {/* Content State: Loading, Empty, or Data */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse space-y-4 p-6 bg-[#1818D4]/60 border border-white/10 rounded-[28px]">
              <div className="h-4 bg-white/20 rounded-full w-1/3" />
              <div className="h-6 bg-white/20 rounded-full w-3/4" />
              <div className="h-4 bg-white/20 rounded-full w-1/2" />
              <div className="h-10 bg-white/20 rounded-full w-full mt-4" />
            </Card>
          ))}
        </div>
      ) : tournaments.length === 0 ? (
        <Card className="border border-white/20 bg-[#1818D4] p-12 text-center rounded-[32px] text-white">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0A0A7A] border border-white/20 text-[#FFFF00] mb-4">
            <Trophy className="h-8 w-8 text-[#FFFF00]" />
          </div>
          <h3 className="text-xl font-black text-white font-display uppercase tracking-wider">No tournaments found</h3>
          <p className="text-xs text-white/70 max-w-sm mx-auto mt-1 mb-6">
            {search || selectedStatus !== 'all'
              ? 'No tournaments match your filter criteria. Try adjusting your search or status filter.'
              : 'No tournaments yet. Create your first tournament to start managing brackets.'}
          </p>
          <Button asChild className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-full px-6 shadow-lg">
            <Link href="/admin/tournaments/new">
              <Plus className="h-4 w-4 mr-1.5" />
              <span>Create Tournament</span>
            </Link>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((t) => (
            <TournamentCard
              key={t.id}
              tournament={t}
              isAdmin={true}
              onDelete={(id) => setDeletingId(id)}
            />
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
