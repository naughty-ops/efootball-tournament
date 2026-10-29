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
  Phone,
  CheckCircle2,
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
      setTournament(tData);
      setParticipants(pData);
      setError(null);
    } catch (err: unknown) {
      console.error('Error loading roster data:', err);
      const msg = err instanceof Error ? err.message : 'Failed to load participants';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, search, statusFilter, seedFilter]);

  useEffect(() => {
    fetchRosterData();
  }, [fetchRosterData]);

  // Form submission for adding participant manually
  const onAddSubmit = async (data: ParticipantInput) => {
    setAddFormError(null);
    try {
      await addParticipant(tournamentId, data, tournament?.max_participants);
      setIsAddModalOpen(false);
      resetAdd();
      await fetchRosterData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add participant';
      setAddFormError(msg);
    }
  };

  // Disqualify action
  const handleDisqualifyConfirm = async () => {
    if (!disqualifyingId) return;
    setActionLoading(true);
    try {
      await disqualifyParticipant(disqualifyingId, tournamentId);
      setDisqualifyingId(null);
      await fetchRosterData();
    } catch (err: unknown) {
      console.error('Error disqualifying participant:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Delete / Remove action
  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setActionLoading(true);
    try {
      await deleteParticipant(deletingId, tournamentId);
      setDeletingId(null);
      await fetchRosterData();
    } catch (err: unknown) {
      console.error('Error removing participant:', err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#FFFF00]" />
          <span className="text-xs font-semibold">Loading Participant Roster...</span>
        </div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4 text-white">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/20 text-destructive">
          <AlertCircle className="h-7 w-7 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold">{error || 'Tournament Not Found'}</h2>
        <Button asChild variant="outline" size="sm" className="rounded-full border-white/20 text-white hover:bg-white/10">
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
    <div className="space-y-8 max-w-6xl mx-auto pb-16 text-white">
      {/* Back Link & Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="gap-2 text-white/70 hover:text-white hover:bg-white/10 -ml-2 mb-1 rounded-full">
            <Link href={`/admin/tournaments/${tournament.id}`}>
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Tournament Details</span>
            </Link>
          </Button>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black font-display uppercase tracking-wider text-white">
              Participant Roster
            </h1>
            <Badge className="bg-[#FFFF00] text-[#08088F] text-xs py-1 px-3 gap-1.5 font-black uppercase tracking-wider rounded-full shadow-sm">
              <Users className="h-3.5 w-3.5" />
              <span>
                {participants.length} / {tournament.max_participants} Participants
              </span>
            </Badge>
          </div>
          <p className="text-xs text-white/70">
            Tournament: <span className="font-bold text-[#FFFF00]">{tournament.name}</span>
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setIsCsvModalOpen(true)}
            className={`font-bold gap-2 rounded-full text-xs border-white/30 text-white hover:bg-white/10 ${
              isLargeTournament ? 'bg-[#0A0A7A] border-[#FFFF00] text-[#FFFF00]' : ''
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Import CSV</span>
          </Button>

          <Button
            onClick={() => setIsAddModalOpen(true)}
            disabled={isFull}
            className="font-black gap-2 rounded-full text-xs shadow-md bg-[#FFFF00] text-[#08088F] hover:bg-[#E6E600] uppercase tracking-wider cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Add Participant</span>
          </Button>
        </div>
      </div>

      {/* Tournament Full Warning Banner */}
      {isFull && (
        <div className="p-3.5 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-200 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              Tournament has reached its maximum participant capacity of {tournament.max_participants}. No additional participants can be added.
            </span>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-white/50" />
            <Input
              placeholder="Search by player name or eFootball ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 text-xs bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 rounded-xl focus:border-[#FFFF00]"
            />
          </div>

          {/* Seed Filter Tabs */}
          <div className="flex items-center gap-1 bg-[#0A0A7A] p-1 rounded-xl border border-white/20 shrink-0">
            {SEED_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setSeedFilter(tab.value as 'all' | 'seeded' | 'unseeded')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  seedFilter === tab.value
                    ? 'bg-[#FFFF00] text-[#08088F] shadow-xs'
                    : 'text-white/60 hover:text-white'
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
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === tab.value
                  ? 'bg-[#FFFF00] text-[#08088F] shadow-md'
                  : 'bg-[#0A0A7A] border border-white/20 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Roster Data Table / Empty State */}
      {participants.length === 0 ? (
        <Card className="border-dashed border-2 border-white/20 p-12 text-center bg-[#1818D4] rounded-3xl text-white">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0A0A7A] text-[#FFFF00] mb-4">
            <Users className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-black uppercase tracking-wider text-white">No participants found</h3>
          <p className="text-xs text-white/70 max-w-sm mx-auto mt-1 mb-6">
            {search || statusFilter !== 'all' || seedFilter !== 'all'
              ? 'No players match your search or status filters.'
              : 'No participants registered in this tournament yet. Add players manually or import via CSV.'}
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button onClick={() => setIsCsvModalOpen(true)} variant="outline" className="font-bold gap-2 rounded-full border-white/30 text-white hover:bg-white/10">
              <FileSpreadsheet className="h-4 w-4 text-[#FFFF00]" />
              <span>Import CSV Roster</span>
            </Button>
            <Button onClick={() => setIsAddModalOpen(true)} disabled={isFull} className="font-black gap-2 rounded-full bg-[#FFFF00] text-[#08088F] hover:bg-[#E6E600]">
              <Plus className="h-4 w-4" />
              <span>Add First Participant</span>
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="border border-white/20 bg-[#1818D4] shadow-2xl rounded-3xl overflow-hidden text-white">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-[#0A0A7A] text-white/70 font-black uppercase tracking-wider text-[11px] border-b border-white/10">
                <tr>
                  <th className="p-4 w-16 text-center">Seed</th>
                  <th className="p-4">Player Name</th>
                  <th className="p-4">eFootball ID</th>
                  <th className="p-4">Contact (WhatsApp)</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Registered</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {participants.map((p) => {
                  const hasRealName = Boolean(p.real_name && p.real_name.trim().length > 0);
                  const playerName = hasRealName ? p.real_name!.trim() : p.username;

                  return (
                    <tr key={p.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 text-center font-bold">
                        {p.seed_number ? (
                          <Badge className="font-mono text-xs px-2 py-0.5 bg-[#FFFF00] text-[#08088F] font-black rounded-lg">
                            #{p.seed_number}
                          </Badge>
                        ) : (
                          <span className="text-white/40 text-xs">-</span>
                        )}
                      </td>

                      {/* Player Name */}
                      <td className="p-4">
                        <div className="font-black text-white text-sm">
                          {playerName}
                        </div>
                      </td>

                      {/* eFootball ID */}
                      <td className="p-4">
                        <span className="font-mono text-xs font-bold text-[#FFFF00] bg-[#0A0A7A] px-2.5 py-1 rounded-md border border-white/20">
                          {p.username}
                        </span>
                      </td>

                      {/* Contact Info */}
                      <td className="p-4 font-mono text-xs text-white/80">
                        {p.contact_info ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-emerald-400" />
                            <span>{p.contact_info}</span>
                          </span>
                        ) : (
                          <span className="text-white/40">-</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-4">
                        <Badge
                          className={`capitalize font-bold text-[11px] rounded-full px-2.5 py-0.5 border-none ${
                            p.status === 'active'
                              ? 'bg-emerald-500 text-white'
                              : p.status === 'disqualified'
                              ? 'bg-[#FF168B] text-white'
                              : 'bg-white/10 text-white/60'
                          }`}
                        >
                          {p.status}
                        </Badge>
                      </td>

                      <td className="p-4 text-white/60">{formatDate(p.created_at)}</td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs font-bold text-white hover:bg-white/10 rounded-lg">
                            <Link href={`/admin/tournaments/${tournamentId}/participants/${p.id}/edit`}>
                              <Edit className="h-3.5 w-3.5 mr-1 text-[#FFFF00]" />
                              Edit
                            </Link>
                          </Button>

                          {p.status !== 'disqualified' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDisqualifyingId(p.id)}
                              className="h-8 px-2 text-xs font-bold text-amber-300 hover:bg-amber-500/20 rounded-lg"
                            >
                              <Ban className="h-3.5 w-3.5 mr-1" />
                              Disqualify
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingId(p.id)}
                            className="h-8 px-2 text-xs font-bold text-red-300 hover:bg-red-500/20 rounded-lg"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Manual Add Participant Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xs" onClick={() => setIsAddModalOpen(false)} />
          <Card className="relative w-full max-w-md bg-[#1818D4] border border-white/20 shadow-2xl z-10 p-6 space-y-4 rounded-3xl text-white">
            <CardHeader className="p-0 pb-2 border-b border-white/10">
              <CardTitle className="text-xl font-black font-display uppercase tracking-wider text-white">
                Add Participant
              </CardTitle>
              <CardDescription className="text-xs text-white/70">
                Enter player name, eFootball ID, and optional seed assignment.
              </CardDescription>
            </CardHeader>

            {addFormError && (
              <div className="p-3 rounded-xl bg-destructive/20 border border-destructive/40 text-red-200 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{addFormError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitAdd(onAddSubmit)} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-white block mb-1 uppercase tracking-wider">
                  Player Name (Real / Display Name) *
                </label>
                <Input
                  placeholder="e.g. Alex Mercer"
                  disabled={isSubmittingAdd}
                  className="bg-[#0A0A7A] border-white/20 text-white rounded-xl h-10"
                  {...registerAdd('real_name')}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-white block mb-1 uppercase tracking-wider">
                  eFootball ID / Gamertag *
                </label>
                <Input
                  placeholder="e.g. ABCD-123-456-789 or Alex_FC"
                  disabled={isSubmittingAdd}
                  className="bg-[#0A0A7A] border-white/20 text-white rounded-xl h-10 font-mono"
                  {...registerAdd('username')}
                />
                {errorsAdd.username && (
                  <p className="text-xs text-red-300 mt-1 font-medium">{errorsAdd.username.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-white block mb-1 uppercase tracking-wider">
                  WhatsApp / Contact Info (Private)
                </label>
                <Input
                  placeholder="e.g. +919876543210"
                  disabled={isSubmittingAdd}
                  className="bg-[#0A0A7A] border-white/20 text-white rounded-xl h-10 font-mono"
                  {...registerAdd('contact_info')}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-white block mb-1 uppercase tracking-wider">
                  Seed Number
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 1"
                  min={1}
                  disabled={isSubmittingAdd}
                  className="bg-[#0A0A7A] border-white/20 text-white rounded-xl h-10 font-mono"
                  {...registerAdd('seed_number', { valueAsNumber: true })}
                />
                {errorsAdd.seed_number && (
                  <p className="text-xs text-red-300 mt-1 font-medium">{errorsAdd.seed_number.message}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModalOpen(false)} className="rounded-full border-white/20 text-white hover:bg-white/10">
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmittingAdd} className="font-black gap-2 bg-[#FFFF00] text-[#08088F] hover:bg-[#E6E600] rounded-full uppercase tracking-wider cursor-pointer">
                  {isSubmittingAdd ? <Loader2 className="h-4 w-4 animate-spin text-[#08088F]" /> : <Plus className="h-4 w-4 text-[#08088F]" />}
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
