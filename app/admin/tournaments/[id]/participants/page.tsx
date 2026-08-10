'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Users,
  Plus,
  FileSpreadsheet,
  Search,
  Edit,
  Trash2,
  Ban,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { getTournamentById, TournamentWithStats } from '@/services/tournamentService';
import {
  getParticipantsByTournament,
  addParticipant,
  disqualifyParticipant,
  deleteParticipant,
} from '@/services/participantService';
import type { Participant } from '@/types/database';
import { participantSchema, ParticipantInput } from '@/lib/validations';
import { formatDate } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ConfirmModal } from '@/components/ui/modal';
import dynamic from 'next/dynamic';

const CsvImportModal = dynamic(
  () => import('@/components/admin/CsvImportModal').then((mod) => mod.CsvImportModal),
  { ssr: false }
);

const STATUS_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Eliminated', value: 'eliminated' },
  { label: 'Disqualified', value: 'disqualified' },
];

const SEED_TABS = [
  { label: 'All Players', value: 'all' },
  { label: 'Seeded Only', value: 'seeded' },
  { label: 'Unseeded Only', value: 'unseeded' },
];

export default function AdminParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = use(params);

  const [tournament, setTournament] = useState<TournamentWithStats | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [seedFilter, setSeedFilter] = useState<'all' | 'seeded' | 'unseeded'>('all');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  // Disqualify / Remove Action State
  const [disqualifyingId, setDisqualifyingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Manual Add Form
  const [addFormError, setAddFormError] = useState<string | null>(null);
  const {
    register: registerAdd,
    handleSubmit: handleSubmitAdd,
    reset: resetAdd,
    formState: { errors: errorsAdd, isSubmitting: isSubmittingAdd },
  } = useForm<ParticipantInput>({
    resolver: zodResolver(participantSchema),
    defaultValues: {
      username: '',
      real_name: '',
      contact_info: '',
      seed_number: null,
    },
  });

  const fetchRosterData = useCallback(async () => {
    try {
      const [tData, pData] = await Promise.all([
        getTournamentById(tournamentId),
        getParticipantsByTournament(tournamentId, {
          search,
          status: statusFilter,
          seedFilter,
        }),
      ]);

      if (!tData) {
        setError('Tournament not found.');
      } else {
        setTournament(tData);
        setParticipants(pData);
        setError(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load roster data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, search, statusFilter, seedFilter]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const [tData, pData] = await Promise.all([
          getTournamentById(tournamentId),
          getParticipantsByTournament(tournamentId, {
            search,
            status: statusFilter,
            seedFilter,
          }),
        ]);
        if (isMounted) {
          if (!tData) {
            setError('Tournament not found.');
          } else {
            setTournament(tData);
            setParticipants(pData);
            setError(null);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to load roster data';
          setError(msg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [tournamentId, search, statusFilter, seedFilter]);

  const onAddSubmit = async (data: ParticipantInput) => {
    setAddFormError(null);
    try {
      await addParticipant(tournamentId, data, tournament?.max_participants);
      resetAdd();
      setIsAddModalOpen(false);
      fetchRosterData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add participant';
      setAddFormError(msg);
    }
  };

  const handleDisqualifyConfirm = async () => {
    if (!disqualifyingId) return;
    setActionLoading(true);
    try {
      await disqualifyParticipant(disqualifyingId, tournamentId);
      setDisqualifyingId(null);
      fetchRosterData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Disqualification failed';
      alert(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setActionLoading(true);
    try {
      await deleteParticipant(deletingId, tournamentId);
      setDeletingId(null);
      fetchRosterData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Deletion failed';
      alert(msg);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#0B3323]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-xs font-semibold">Loading Participant Roster...</span>
        </div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold text-[#0B3323]">{error || 'Tournament Not Found'}</h2>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/tournaments">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tournaments
          </Link>
        </Button>
      </div>
    );
  }

  const isFull = participants.length >= tournament.max_participants;
  const isLargeTournament = tournament.max_participants >= 25;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Back Link & Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary -ml-2 mb-1">
            <Link href={`/admin/tournaments/${tournament.id}`}>
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Tournament Details</span>
            </Link>
          </Button>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
              Participant Roster
            </h1>
            <Badge variant="efootball" className="text-xs py-1 px-3 gap-1 font-bold">
              <Users className="h-3.5 w-3.5 text-primary" />
              <span>
                {participants.length} / {tournament.max_participants} Participants
              </span>
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Tournament: <span className="font-bold text-[#0B3323]">{tournament.name}</span>
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setIsCsvModalOpen(true)}
            className={`font-bold gap-2 rounded-xl text-xs ${
              isLargeTournament
                ? 'border-primary text-primary bg-secondary/60 hover:bg-primary hover:text-white shadow-xs'
                : 'border-border text-[#0B3323]'
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Import CSV</span>
          </Button>

          <Button
            onClick={() => setIsAddModalOpen(true)}
            disabled={isFull}
            className="font-bold gap-2 rounded-xl text-xs shadow-md"
          >
            <Plus className="h-4 w-4" />
            <span>Add Participant</span>
          </Button>
        </div>
      </div>

      {/* Tournament Full Warning Banner */}
      {isFull && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              Tournament has reached its maximum participant limit of {tournament.max_participants}. No additional participants can be added.
            </span>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by username or real name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 text-xs bg-white border-border"
            />
          </div>

          {/* Seed Filter Tabs */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-border shrink-0">
            {SEED_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setSeedFilter(tab.value as 'all' | 'seeded' | 'unseeded')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  seedFilter === tab.value
                    ? 'bg-[#0B3323] text-white shadow-xs'
                    : 'text-muted-foreground hover:text-[#0B3323]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap touch-target ${
                statusFilter === tab.value
                  ? 'bg-[#0B3323] text-white shadow-xs'
                  : 'bg-white border border-border text-muted-foreground hover:bg-secondary hover:text-[#0B3323]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Roster Data Table / Empty State */}
      {participants.length === 0 ? (
        <Card className="border-dashed border-2 p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-primary mb-4">
            <Users className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-[#0B3323]">No participants found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-6">
            {search || statusFilter !== 'all' || seedFilter !== 'all'
              ? 'No players match your search or status filters.'
              : 'No participants registered in this tournament yet. Add players manually or import via CSV.'}
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button onClick={() => setIsCsvModalOpen(true)} variant="outline" className="font-bold gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              <span>Import CSV Roster</span>
            </Button>
            <Button onClick={() => setIsAddModalOpen(true)} disabled={isFull} className="font-bold gap-2">
              <Plus className="h-4 w-4" />
              <span>Add First Participant</span>
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="border-border bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F8F5] text-[#0B3323] font-extrabold border-b border-border">
                <tr>
                  <th className="p-4 w-16 text-center">Seed</th>
                  <th className="p-4">Gamertag / Username</th>
                  <th className="p-4">Real Name</th>
                  <th className="p-4">Contact Info (Private)</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Registered</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {participants.map((p) => (
                  <tr key={p.id} className="hover:bg-secondary/15 transition-colors">
                    <td className="p-4 text-center font-bold">
                      {p.seed_number ? (
                        <Badge variant="efootball" className="font-mono text-xs px-2 py-0.5">
                          #{p.seed_number}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/60 text-xs">-</span>
                      )}
                    </td>
                    <td className="p-4 font-bold text-[#0B3323]">{p.username}</td>
                    <td className="p-4 text-muted-foreground">{p.real_name || '-'}</td>
                    <td className="p-4 font-mono text-xs text-muted-foreground">{p.contact_info || '-'}</td>
                    <td className="p-4">
                      <Badge
                        variant={
                          p.status === 'active'
                            ? 'default'
                            : p.status === 'disqualified'
                            ? 'destructive'
                            : 'outline'
                        }
                        className="capitalize font-bold text-[11px]"
                      >
                        {p.status}
                      </Badge>
                    </td>
                    <td className="p-4 text-muted-foreground">{formatDate(p.created_at)}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs font-semibold text-[#0B3323]">
                          <Link href={`/admin/tournaments/${tournamentId}/participants/${p.id}/edit`}>
                            <Edit className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                            Edit
                          </Link>
                        </Button>

                        {p.status !== 'disqualified' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDisqualifyingId(p.id)}
                            className="h-8 px-2 text-xs text-amber-700 hover:bg-amber-50"
                          >
                            <Ban className="h-3.5 w-3.5 mr-1" />
                            Disqualify
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingId(p.id)}
                          className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Manual Add Participant Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setIsAddModalOpen(false)} />
          <Card className="relative w-full max-w-md bg-white border border-border shadow-2xl z-10 p-6 space-y-4">
            <CardHeader className="p-0 pb-2">
              <CardTitle className="text-xl">Add Participant</CardTitle>
              <CardDescription className="text-xs">
                Enter player gamertag and optional seed assignment.
              </CardDescription>
            </CardHeader>

            {addFormError && (
              <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{addFormError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitAdd(onAddSubmit)} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[#0B3323] block mb-1">
                  Gamertag / Username *
                </label>
                <Input placeholder="e.g. Alex_FC" disabled={isSubmittingAdd} {...registerAdd('username')} />
                {errorsAdd.username && (
                  <p className="text-xs text-destructive mt-1 font-medium">{errorsAdd.username.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-[#0B3323] block mb-1">Real Name</label>
                <Input placeholder="e.g. Alex Mercer" disabled={isSubmittingAdd} {...registerAdd('real_name')} />
              </div>

              <div>
                <label className="text-xs font-bold text-[#0B3323] block mb-1">Contact Information (Private)</label>
                <Input placeholder="e.g. alex@email.com or Discord tag" disabled={isSubmittingAdd} {...registerAdd('contact_info')} />
              </div>

              <div>
                <label className="text-xs font-bold text-[#0B3323] block mb-1">Seed Number</label>
                <Input
                  type="number"
                  placeholder="e.g. 1"
                  min={1}
                  disabled={isSubmittingAdd}
                  {...registerAdd('seed_number', { valueAsNumber: true })}
                />
                {errorsAdd.seed_number && (
                  <p className="text-xs text-destructive mt-1 font-medium">{errorsAdd.seed_number.message}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmittingAdd} className="font-bold gap-2">
                  {isSubmittingAdd ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  <span>Save Participant</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onSuccess={fetchRosterData}
        tournamentId={tournamentId}
        existingParticipants={participants}
        maxParticipants={tournament.max_participants}
      />

      {/* Disqualify Modal */}
      <ConfirmModal
        isOpen={Boolean(disqualifyingId)}
        onClose={() => setDisqualifyingId(null)}
        onConfirm={handleDisqualifyConfirm}
        title="Disqualify Participant"
        description="This will mark the participant status as Disqualified without deleting their record from historical statistics."
        confirmText="Confirm Disqualify"
        variant="destructive"
        isLoading={actionLoading}
      />

      {/* Remove Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingId)}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDeleteConfirm}
        title="Remove Participant"
        description="Are you sure you want to remove this participant from the tournament? This action cannot be undone."
        confirmText="Yes, Remove"
        variant="destructive"
        isLoading={actionLoading}
      />
    </div>
  );
}
