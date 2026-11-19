'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Flame,
  Swords,
  Clock,
  Play,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Edit2,
  ShieldAlert,
  Loader2,
  Search,
  ExternalLink,
  Check,
  X,
  Trophy,
  Wallet,
  RefreshCw,
  HelpCircle,
  FileText,
  BadgeAlert,
  SlidersHorizontal,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { OneVsOneCard, OneVsOneMatchDetail, OneVsOneDispute, OneVsOneSettlement } from '@/types/oneVsOne';
import {
  adminResolveDisputeAction,
  adminSaveCardAction,
  adminRetrySettlementAction,
  adminManualSettlementCorrectionAction,
} from '@/app/actions/oneVsOneActions';

interface AdminOneVsOneDeskProps {
  overview: {
    totalMatches: number;
    waitingMatches: number;
    activeMatches: number;
    completedMatches: number;
    disputedMatches: number;
    cancelledMatches: number;
    activeCardsCount: number;
  };
  cards: OneVsOneCard[];
  recentMatches: OneVsOneMatchDetail[];
  openDisputes: (OneVsOneDispute & { match?: OneVsOneMatchDetail })[];
  settlements?: OneVsOneSettlement[];
  creditTickets?: any[];
}

export default function AdminOneVsOneDesk({
  overview,
  cards: initialCards,
  recentMatches,
  openDisputes,
  settlements = [],
  creditTickets = [],
}: AdminOneVsOneDeskProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'matches' | 'cards' | 'disputes' | 'settlements' | 'tickets'>('matches');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [settlementFilter, setSettlementFilter] = useState<string>('all');

  // Card modal state
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<OneVsOneCard | null>(null);
  const [cardFormName, setCardFormName] = useState('');
  const [cardFormEntry, setCardFormEntry] = useState('10');
  const [cardFormPayout, setCardFormPayout] = useState('15');
  const [cardFormStatus, setCardFormStatus] = useState<'active' | 'inactive'>('active');
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  // Dispute resolution state
  const [resolvingDisputeId, setResolvingDisputeId] = useState<string | null>(null);
  const [selectedWinnerId, setSelectedWinnerId] = useState<string>('');
  const [adminNotes, setAdminNotes] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);

  // Settlement Retry state
  const [retryingSettlement, setRetryingSettlement] = useState<OneVsOneSettlement | null>(null);
  const [retryReason, setRetryReason] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  // Settlement Manual Correction state
  const [correctingSettlement, setCorrectingSettlement] = useState<OneVsOneSettlement | null>(null);
  const [correctionAction, setCorrectionAction] = useState<'cancel' | 'mark_completed' | 'reassign_winner'>('mark_completed');
  const [correctionNewWinnerId, setCorrectionNewWinnerId] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  // Inspect Modal
  const [inspectingSettlement, setInspectingSettlement] = useState<OneVsOneSettlement | null>(null);

  const openCreateCardModal = () => {
    setEditingCard(null);
    setCardFormName('');
    setCardFormEntry('10');
    setCardFormPayout('15');
    setCardFormStatus('active');
    setCardError(null);
    setIsCardModalOpen(true);
  };

  const openEditCardModal = (c: OneVsOneCard) => {
    setEditingCard(c);
    setCardFormName(c.name);
    setCardFormEntry(String(c.entry_amount));
    setCardFormPayout(String(c.advertised_payout));
    setCardFormStatus(c.status === 'active' ? 'active' : 'inactive');
    setCardError(null);
    setIsCardModalOpen(true);
  };

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCard(true);
    setCardError(null);

    const res = await adminSaveCardAction({
      id: editingCard?.id,
      name: cardFormName,
      entryAmount: parseFloat(cardFormEntry) || 0,
      advertisedPayout: parseFloat(cardFormPayout) || 0,
      status: cardFormStatus,
      displayOrder: editingCard?.display_order ?? 1,
    });

    setIsSavingCard(false);
    if (!res.success) {
      setCardError(res.error || 'Failed to save card');
      return;
    }

    setIsCardModalOpen(false);
    router.refresh();
  };

  const handleResolveDispute = async (disputeId: string) => {
    if (!selectedWinnerId) {
      setDisputeError('Please select a winner');
      return;
    }

    setIsResolving(true);
    setDisputeError(null);

    const res = await adminResolveDisputeAction({
      disputeId,
      winnerId: selectedWinnerId,
      adminNotes: adminNotes.trim(),
    });

    setIsResolving(false);
    if (!res.success) {
      setDisputeError(res.error || 'Failed to resolve dispute');
      return;
    }

    setResolvingDisputeId(null);
    router.refresh();
  };

  const handleExecuteRetry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retryingSettlement) return;
    if (!retryReason.trim()) {
      setRetryError('Please enter a reason for retrying settlement.');
      return;
    }

    setIsRetrying(true);
    setRetryError(null);

    const res = await adminRetrySettlementAction({
      settlementId: retryingSettlement.id,
      reason: retryReason.trim(),
    });

    setIsRetrying(false);
    if (!res.success) {
      setRetryError(res.error || 'Retry operation failed.');
      return;
    }

    setRetryingSettlement(null);
    setRetryReason('');
    router.refresh();
  };

  const handleExecuteCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingSettlement) return;
    if (!correctionReason.trim() || correctionReason.trim().length < 5) {
      setCorrectionError('A clear audit reason (at least 5 characters) is required.');
      return;
    }

    setIsCorrecting(true);
    setCorrectionError(null);

    const res = await adminManualSettlementCorrectionAction({
      settlementId: correctingSettlement.id,
      action: correctionAction,
      newWinnerId: correctionAction === 'reassign_winner' ? correctionNewWinnerId.trim() : undefined,
      reason: correctionReason.trim(),
    });

    setIsCorrecting(false);
    if (!res.success) {
      setCorrectionError(res.error || 'Correction failed.');
      return;
    }

    setCorrectingSettlement(null);
    setCorrectionReason('');
    router.refresh();
  };

  const filteredMatches = recentMatches.filter((m) => {
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCode = m.match_code.toLowerCase();
      const cardName = (m.card?.name || '').toLowerCase();
      return matchCode.includes(q) || cardName.includes(q);
    }
    return true;
  });

  const filteredSettlements = settlements.filter((s) => {
    if (settlementFilter !== 'all' && s.status !== settlementFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const ref = s.settlement_ref.toLowerCase();
      const matchCode = (s.match?.match_code || '').toLowerCase();
      const winner = (s.winner_profile?.display_name || '').toLowerCase();
      return ref.includes(q) || matchCode.includes(q) || winner.includes(q);
    }
    return true;
  });

  const completedSettlementsCount = settlements.filter((s) => s.status === 'completed').length;
  const failedSettlementsCount = settlements.filter((s) => s.status === 'failed' || s.status === 'under_review').length;
  const totalSettledAmountInr = settlements
    .filter((s) => s.status === 'completed')
    .reduce((acc, curr) => acc + curr.amount_inr, 0);

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto">
      {/* 1. Header & Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
        <Card className="p-4 rounded-2xl bg-[#0B0B24] border border-white/10 text-white">
          <span className="text-[10px] font-bold uppercase text-white/50 block">Total Fixtures</span>
          <span className="text-2xl font-black font-display text-white">{overview.totalMatches}</span>
        </Card>

        <Card className="p-4 rounded-2xl bg-[#0B0B24] border border-white/10 text-white">
          <span className="text-[10px] font-bold uppercase text-amber-400/80 block">Waiting Queue</span>
          <span className="text-2xl font-black font-display text-amber-400">{overview.waitingMatches}</span>
        </Card>

        <Card className="p-4 rounded-2xl bg-[#0B0B24] border border-white/10 text-white">
          <span className="text-[10px] font-bold uppercase text-[#00E676]/80 block">Active Rooms</span>
          <span className="text-2xl font-black font-display text-[#00E676]">{overview.activeMatches}</span>
        </Card>

        <Card className="p-4 rounded-2xl bg-[#0B0B24] border border-white/10 text-white">
          <span className="text-[10px] font-bold uppercase text-white/50 block">Completed</span>
          <span className="text-2xl font-black font-display text-white/90">{overview.completedMatches}</span>
        </Card>

        <Card className="p-4 rounded-2xl bg-[#0B0B24] border border-white/10 text-white">
          <span className="text-[10px] font-bold uppercase text-red-400/80 block">Open Disputes</span>
          <span className="text-2xl font-black font-display text-red-400">{overview.disputedMatches}</span>
        </Card>

        <Card className="p-4 rounded-2xl bg-[#0B0B24] border border-white/10 text-white">
          <span className="text-[10px] font-bold uppercase text-white/50 block">Active Cards</span>
          <span className="text-2xl font-black font-display text-[#00E676]">{overview.activeCardsCount}</span>
        </Card>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-[#050515] border border-white/10 rounded-2xl w-fit flex-wrap">
        <button
          onClick={() => setActiveTab('matches')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'matches'
              ? 'bg-[#00E676] text-[#050515] shadow-md shadow-[#00E676]/20'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <Swords className="h-4 w-4" />
          <span>Live Monitor & Matches</span>
        </button>

        <button
          onClick={() => setActiveTab('cards')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'cards'
              ? 'bg-[#00E676] text-[#050515] shadow-md shadow-[#00E676]/20'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <Flame className="h-4 w-4" />
          <span>Entry Cards</span>
        </button>

        <button
          onClick={() => setActiveTab('disputes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'disputes'
              ? 'bg-[#00E676] text-[#050515] shadow-md shadow-[#00E676]/20'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          <span>Disputes Desk ({openDisputes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('settlements')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'settlements'
              ? 'bg-[#00E676] text-[#050515] shadow-md shadow-[#00E676]/20'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <Wallet className="h-4 w-4" />
          <span>Settlements & Recovery ({settlements.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('tickets')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'tickets'
              ? 'bg-[#00E676] text-[#050515] shadow-md shadow-[#00E676]/20'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <ShieldAlert className="h-4 w-4" />
          <span>Credit Tickets ({creditTickets.length})</span>
        </button>
      </div>

      {/* ======================================================================= */}
      {/* TAB 1: LIVE MONITOR & MATCHES                                          */}
      {/* ======================================================================= */}
      {activeTab === 'matches' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                placeholder="Search match code, tier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-[#0B0B24] border-white/10 text-white rounded-xl text-xs"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
              {['all', 'waiting', 'matched', 'room_submitted', 'ready', 'in_progress', 'result_submitted', 'completed', 'disputed'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase transition-all whitespace-nowrap cursor-pointer ${
                    statusFilter === status
                      ? 'bg-white/20 text-white'
                      : 'bg-[#0B0B24] text-white/50 hover:text-white'
                  }`}
                >
                  {status.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {filteredMatches.length === 0 ? (
              <Card className="p-8 text-center bg-[#0B0B24] border border-white/10 rounded-2xl text-white/50 text-xs">
                No fixtures found matching filter.
              </Card>
            ) : (
              filteredMatches.map((m) => (
                <Card
                  key={m.id}
                  className="rounded-2xl bg-[#0B0B24] border border-white/10 p-4 text-white flex items-center justify-between gap-4 shadow-md hover:border-white/20 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center font-display font-black text-xs text-[#00E676]">
                      1v1
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white">{m.match_code}</span>
                        <span className="text-[10px] font-bold text-[#00E676] bg-[#00E676]/10 px-2 py-0.5 rounded-full uppercase">
                          {m.card?.name || 'Standard'}
                        </span>
                      </div>
                      <span className="text-[11px] text-white/50 block mt-0.5">
                        Created {new Date(m.created_at).toLocaleTimeString()} • Room: {m.room_id || 'Not set'}
                        {m.players && m.players.length > 0 && (
                          <span className="text-emerald-300/90 font-medium ml-1">
                            • Players: {m.players.map((p: any) => p.profile?.display_name || p.profile?.efootball_id || 'Player').join(' vs ')}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                        m.status === 'in_progress'
                          ? 'bg-[#00E676] text-[#050515]'
                          : m.status === 'disputed'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : m.status === 'completed'
                          ? 'bg-purple-500/20 text-purple-300'
                          : 'bg-white/10 text-white/70'
                      }`}
                    >
                      {m.status.replace('_', ' ')}
                    </span>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* TAB 2: ENTRY CARDS                                                      */}
      {/* ======================================================================= */}
      {activeTab === 'cards' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-white/60">Configure entry fees and advertised winner payouts.</p>
            <Button
              onClick={openCreateCardModal}
              className="rounded-full text-xs font-black uppercase bg-[#00E676] hover:bg-[#00C853] text-[#050515] h-9 px-4 gap-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>Create Card</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {initialCards.map((c) => (
              <Card
                key={c.id}
                className="rounded-3xl bg-[#0B0B24] border border-white/15 p-5 text-white space-y-4 shadow-xl flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                        c.status === 'active'
                          ? 'bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/30'
                          : 'bg-white/10 text-white/50'
                      }`}
                    >
                      {c.status}
                    </span>
                    <span className="text-xs text-white/40 font-mono">Order #{c.display_order}</span>
                  </div>

                  <h3 className="text-lg font-black font-display uppercase tracking-wider text-white">
                    {c.name}
                  </h3>

                  <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-white/5 border border-white/10 text-center">
                    <div>
                      <span className="text-[10px] text-white/50 uppercase block">Entry Fee</span>
                      <span className="font-black text-white font-display">₹{c.entry_amount}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-white/50 uppercase block">Winner Prize</span>
                      <span className="font-black text-[#00E676] font-display">₹{c.advertised_payout}</span>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => openEditCardModal(c)}
                  variant="outline"
                  size="sm"
                  className="rounded-full text-xs font-black uppercase border-white/20 text-white hover:bg-white/10 gap-1.5 cursor-pointer"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  <span>Edit Card</span>
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* TAB 3: DISPUTES DESK                                                   */}
      {/* ======================================================================= */}
      {activeTab === 'disputes' && (
        <div className="space-y-4">
          {openDisputes.length === 0 ? (
            <Card className="p-8 text-center bg-[#0B0B24] border border-white/10 rounded-2xl text-white/60">
              <ShieldAlert className="h-10 w-10 text-white/30 mx-auto mb-2" />
              <p className="text-xs font-bold">No active disputes requiring resolution.</p>
            </Card>
          ) : (
            openDisputes.map((d) => (
              <Card
                key={d.id}
                className="rounded-2xl bg-[#0B0B24] border border-red-500/30 p-5 sm:p-6 text-white space-y-4 shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-red-400 bg-red-500/15 border border-red-500/30 px-3 py-0.5 rounded-full">
                      Dispute: {d.reason}
                    </span>
                    <span className="text-xs font-mono text-white/50">
                      Match: {d.match?.match_code || d.match_id}
                    </span>
                  </div>
                  <span className="text-xs text-white/50">{new Date(d.created_at).toLocaleString()}</span>
                </div>

                <div className="text-xs text-white/80 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/10">
                  <span className="text-[10px] font-bold text-white/50 uppercase block mb-1">
                    Player Statement:
                  </span>
                  {d.description}
                </div>

                {d.evidence_url && (
                  <div>
                    <a
                      href={d.evidence_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-[#00E676] font-bold hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>View Screenshot Evidence</span>
                    </a>
                  </div>
                )}

                {/* Resolution Panel */}
                {resolvingDisputeId === d.id ? (
                  <div className="space-y-3 pt-3 border-t border-white/10">
                    <div className="grid grid-cols-2 gap-3">
                      {d.match?.players.map((p) => (
                        <button
                          key={p.user_id}
                          type="button"
                          onClick={() => setSelectedWinnerId(p.user_id)}
                          className={`p-3 rounded-xl border text-xs font-black uppercase text-center cursor-pointer ${
                            selectedWinnerId === p.user_id
                              ? 'bg-[#00E676] text-[#050515] border-[#00E676]'
                              : 'bg-white/5 text-white border-white/10'
                          }`}
                        >
                          Award Winner: {p.profile?.display_name || `Player ${p.player_position}`}
                        </button>
                      ))}
                    </div>

                    <Input
                      placeholder="Admin determination notes..."
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      className="bg-white/5 border-white/20 text-white rounded-xl text-xs"
                    />

                    {disputeError && <p className="text-xs text-red-400 font-bold">{disputeError}</p>}

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleResolveDispute(d.id)}
                        disabled={isResolving || !selectedWinnerId}
                        className="rounded-full text-xs font-black uppercase bg-[#00E676] text-[#050515]"
                      >
                        {isResolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm Resolution'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setResolvingDisputeId(null)}
                        className="rounded-full text-xs font-bold text-white/60"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setResolvingDisputeId(d.id);
                        setSelectedWinnerId('');
                        setAdminNotes('');
                        setDisputeError(null);
                      }}
                      className="rounded-full text-xs font-black uppercase bg-red-500 hover:bg-red-600 text-white cursor-pointer"
                    >
                      Resolve Dispute
                    </Button>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {/* ======================================================================= */}
      {/* TAB 4: SETTLEMENTS & RECOVERY DESK                                     */}
      {/* ======================================================================= */}
      {activeTab === 'settlements' && (
        <div className="space-y-4">
          {/* Metrics summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="p-4 rounded-2xl bg-[#0B0B24] border border-white/10 text-white">
              <span className="text-[10px] font-bold uppercase text-white/50 block">Settled Volume (Simulated/Live)</span>
              <span className="text-xl font-black font-display text-[#00E676]">₹{totalSettledAmountInr}</span>
              <span className="text-[10px] text-white/40 block mt-0.5">{completedSettlementsCount} settlements completed</span>
            </Card>

            <Card className="p-4 rounded-2xl bg-[#0B0B24] border border-white/10 text-white">
              <span className="text-[10px] font-bold uppercase text-amber-400 block">Pending / Under Review</span>
              <span className="text-xl font-black font-display text-amber-400">
                {settlements.filter((s) => s.status === 'under_review' || s.status === 'pending').length}
              </span>
              <span className="text-[10px] text-white/40 block mt-0.5">Awaiting administrative inspection</span>
            </Card>

            <Card className="p-4 rounded-2xl bg-[#0B0B24] border border-white/10 text-white">
              <span className="text-[10px] font-bold uppercase text-red-400 block">Failed Settlements</span>
              <span className="text-xl font-black font-display text-red-400">{failedSettlementsCount}</span>
              <span className="text-[10px] text-white/40 block mt-0.5">Recoverable via retry</span>
            </Card>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                placeholder="Search settlement ref, match code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-[#0B0B24] border-white/10 text-white rounded-xl text-xs"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
              {['all', 'completed', 'failed', 'under_review', 'pending'].map((status) => (
                <button
                  key={status}
                  onClick={() => setSettlementFilter(status)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase transition-all whitespace-nowrap cursor-pointer ${
                    settlementFilter === status
                      ? 'bg-white/20 text-white'
                      : 'bg-[#0B0B24] text-white/50 hover:text-white'
                  }`}
                >
                  {status.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Settlements Table / List */}
          <div className="space-y-3">
            {filteredSettlements.length === 0 ? (
              <Card className="p-8 text-center bg-[#0B0B24] border border-white/10 rounded-2xl text-white/50 text-xs">
                No settlements found matching the criteria.
              </Card>
            ) : (
              filteredSettlements.map((s) => (
                <Card
                  key={s.id}
                  className="rounded-2xl bg-[#0B0B24] border border-white/10 p-4 text-white space-y-3 shadow-md hover:border-white/20 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-[#00E676]">{s.settlement_ref}</span>
                      <span className="text-xs text-white/60 font-mono">
                        Match: {s.match?.match_code || s.match_id.slice(0, 8)}
                      </span>
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          s.mode === 'dry_run' || s.mode === 'free'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : 'bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/30'
                        }`}
                      >
                        {s.mode === 'dry_run' ? 'Dry-Run Simulation' : 'Live Wallet'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                          s.status === 'completed'
                            ? 'bg-[#00E676]/20 text-[#00E676]'
                            : s.status === 'failed'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {s.status}
                      </span>
                      <span className="text-xs text-white/40">
                        {s.settled_at ? new Date(s.settled_at).toLocaleTimeString() : new Date(s.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-white/40 block">Winner</span>
                      <span className="font-bold text-white truncate block">
                        {s.winner_profile?.display_name || (s.winner_id ? s.winner_id.slice(0, 8) : 'Draw (None)')}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-white/40 block">Payout Amount</span>
                      <span className="font-bold font-display text-base text-[#00E676]">₹{s.amount_inr}</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-white/40 block">Retries Logged</span>
                      <span className="font-mono text-white/80">{s.retry_count}</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-white/40 block">Idempotency Key</span>
                      <span className="font-mono text-[10px] text-white/50 truncate block">{s.idempotency_key}</span>
                    </div>
                  </div>

                  {s.failure_reason && (
                    <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-300">
                      <span className="font-bold block text-[10px] uppercase text-red-400">Failure Diagnostic:</span>
                      {s.failure_reason}
                    </div>
                  )}

                  {/* Recovery Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/5 flex-wrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setInspectingSettlement(s)}
                      className="rounded-full text-xs text-white/60 hover:text-white"
                    >
                      Inspect Audit Record
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCorrectingSettlement(s);
                        setCorrectionReason('');
                        setCorrectionError(null);
                      }}
                      className="rounded-full text-xs border-white/20 text-white hover:bg-white/10"
                    >
                      Manual Correction
                    </Button>

                    {s.status !== 'completed' && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setRetryingSettlement(s);
                          setRetryReason('Administrative manual retry trigger');
                          setRetryError(null);
                        }}
                        className="rounded-full text-xs font-black uppercase bg-amber-500 hover:bg-amber-600 text-black gap-1"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Retry Settlement</span>
                      </Button>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* TAB 5: CREDIT RECOVERY TICKETS                                         */}
      {/* ======================================================================= */}
      {activeTab === 'tickets' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-white/60">
              Player support tickets raised for missing wallet credits, delayed payouts, or wrong amounts.
            </p>
          </div>

          <div className="space-y-3">
            {creditTickets.length === 0 ? (
              <Card className="p-8 text-center bg-[#0B0B24] border border-white/10 rounded-2xl text-white/50 text-xs">
                No credit recovery tickets currently open.
              </Card>
            ) : (
              creditTickets.map((t) => (
                <Card
                  key={t.id}
                  className="rounded-2xl bg-[#0B0B24] border border-amber-500/20 p-5 text-white space-y-3 shadow-md"
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-amber-400">{t.ticket_number}</span>
                      <span className="text-xs text-white/50 font-mono">
                        Match: {t.match?.match_code || t.one_vs_one_match_id?.slice(0, 8)}
                      </span>
                      <span className="text-[10px] font-bold text-[#00E676] bg-[#00E676]/10 px-2 py-0.5 rounded-full">
                        Expected ₹{t.expected_payout || 0}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                          t.status === 'resolved'
                            ? 'bg-[#00E676]/20 text-[#00E676]'
                            : t.status === 'rejected'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {t.status}
                      </span>
                      <span className="text-xs text-white/40">{new Date(t.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="text-xs space-y-1">
                    <span className="font-bold text-white block">{t.subject}</span>
                    <p className="text-white/70 line-clamp-2 leading-relaxed bg-white/5 p-2.5 rounded-xl border border-white/10">
                      {t.description}
                    </p>
                  </div>

                  {t.evidence_url && (
                    <div>
                      <a
                        href={t.evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-[#00E676] font-bold hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>View Attached Evidence Screenshot</span>
                      </a>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-white/5 text-xs text-white/50">
                    <span>Raised by: {t.player_name} ({t.player_email})</span>
                    <Button
                      size="sm"
                      onClick={() => router.push(`/admin/tickets/${t.id}`)}
                      className="rounded-full text-xs font-bold bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                    >
                      Manage Ticket
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* Card Create/Edit Modal */}
      {isCardModalOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-[#08081A] border border-white/20 rounded-3xl p-6 text-white space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black uppercase font-display">
                {editingCard ? 'Edit Entry Card' : 'Create Entry Card'}
              </h3>
              <button onClick={() => setIsCardModalOpen(false)} className="text-white/50 hover:text-white cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCard} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-white/70">Card Name</label>
                <Input
                  required
                  value={cardFormName}
                  onChange={(e) => setCardFormName(e.target.value)}
                  placeholder="e.g. Master Contender"
                  className="bg-white/5 border-white/20 text-white rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-white/70">Entry Equivalent (₹)</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={cardFormEntry}
                    onChange={(e) => setCardFormEntry(e.target.value)}
                    className="bg-white/5 border-white/20 text-white rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-white/70">Winner Payout (₹)</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={cardFormPayout}
                    onChange={(e) => setCardFormPayout(e.target.value)}
                    className="bg-white/5 border-white/20 text-white rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-white/70">Status</label>
                <select
                  value={cardFormStatus}
                  onChange={(e) => setCardFormStatus(e.target.value as any)}
                  className="w-full bg-[#0B0B24] border border-white/20 text-white rounded-xl px-3 py-2"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {cardError && <p className="text-red-400 font-bold">{cardError}</p>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsCardModalOpen(false)}
                  className="rounded-full text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingCard || !cardFormName.trim()}
                  className="rounded-full text-xs font-black uppercase bg-[#00E676] text-[#050515] cursor-pointer"
                >
                  {isSavingCard ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Card'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Retry Settlement Modal */}
      {retryingSettlement && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-[#08081A] border border-white/20 rounded-3xl p-6 text-white space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black uppercase font-display flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-amber-400" />
                <span>Retry Settlement</span>
              </h3>
              <button onClick={() => setRetryingSettlement(null)} className="text-white/50 hover:text-white cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-white/70 leading-relaxed">
              Retrying settlement for <span className="font-mono text-white font-bold">{retryingSettlement.settlement_ref}</span>.
              A retry operates with strict idempotency and will never create duplicate wallet credits.
            </p>

            <form onSubmit={handleExecuteRetry} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-white/70 block">Reason for Retry (Mandatory Audit Note)</label>
                <Input
                  required
                  placeholder="e.g. Wallet unlocked, retrying automated prize credit"
                  value={retryReason}
                  onChange={(e) => setRetryReason(e.target.value)}
                  className="bg-white/5 border-white/20 text-white rounded-xl"
                />
              </div>

              {retryError && <p className="text-xs text-red-400 font-bold">{retryError}</p>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRetryingSettlement(null)}
                  className="rounded-full text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isRetrying || !retryReason.trim()}
                  className="rounded-full text-xs font-black uppercase bg-amber-500 hover:bg-amber-600 text-black px-5 cursor-pointer"
                >
                  {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Retry'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Correction Modal */}
      {correctingSettlement && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-[#08081A] border border-white/20 rounded-3xl p-6 text-white space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black uppercase font-display flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-[#00E676]" />
                <span>Manual Settlement Correction</span>
              </h3>
              <button onClick={() => setCorrectingSettlement(null)} className="text-white/50 hover:text-white cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-white/70 leading-relaxed">
              Target Ref: <span className="font-mono text-white font-bold">{correctingSettlement.settlement_ref}</span>
              <br />
              All manual corrections create an immutable entry in the financial audit log.
            </p>

            <form onSubmit={handleExecuteCorrection} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-white/70 block">Correction Action</label>
                <select
                  value={correctionAction}
                  onChange={(e) => setCorrectionAction(e.target.value as any)}
                  className="w-full bg-[#0B0B24] border border-white/20 text-white rounded-xl px-3 py-2.5 text-xs font-bold"
                >
                  <option value="mark_completed">Mark as Completed (Bypassing error)</option>
                  <option value="cancel">Cancel Settlement Record</option>
                  <option value="reassign_winner">Reassign Winner to Different Player</option>
                </select>
              </div>

              {correctionAction === 'reassign_winner' && (
                <div className="space-y-1.5">
                  <label className="font-bold text-white/70 block">New Winner User ID (UUID)</label>
                  <Input
                    required
                    placeholder="Enter valid user UUID"
                    value={correctionNewWinnerId}
                    onChange={(e) => setCorrectionNewWinnerId(e.target.value)}
                    className="bg-white/5 border-white/20 text-white rounded-xl"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="font-bold text-white/70 block">Correction Reason (Required for audit)</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Explain why this correction is being authorized..."
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 text-white rounded-xl p-2.5 text-xs focus:border-[#00E676] resize-none"
                />
              </div>

              {correctionError && <p className="text-xs text-red-400 font-bold">{correctionError}</p>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCorrectingSettlement(null)}
                  className="rounded-full text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isCorrecting || correctionReason.trim().length < 5}
                  className="rounded-full text-xs font-black uppercase bg-[#00E676] hover:bg-[#00C853] text-[#050515] px-5 cursor-pointer"
                >
                  {isCorrecting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply Correction'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Settlement Modal */}
      {inspectingSettlement && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-lg bg-[#08081A] border border-white/20 rounded-3xl p-6 text-white space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-black uppercase font-display text-white">
                  Settlement Inspection
                </h3>
                <span className="font-mono text-xs text-[#00E676]">{inspectingSettlement.settlement_ref}</span>
              </div>
              <button onClick={() => setInspectingSettlement(null)} className="text-white/50 hover:text-white cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
                <div>
                  <span className="text-[10px] text-white/40 block">Match ID</span>
                  <span className="font-mono text-white/90">{inspectingSettlement.match_id}</span>
                </div>
                <div>
                  <span className="text-[10px] text-white/40 block">Winner ID</span>
                  <span className="font-mono text-white/90">{inspectingSettlement.winner_id || 'None (Draw)'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-white/40 block">Execution Mode</span>
                  <span className="font-bold uppercase text-white/90">{inspectingSettlement.mode}</span>
                </div>
                <div>
                  <span className="text-[10px] text-white/40 block">Status</span>
                  <span className="font-bold uppercase text-[#00E676]">{inspectingSettlement.status}</span>
                </div>
                <div>
                  <span className="text-[10px] text-white/40 block">Amount</span>
                  <span className="font-bold text-[#00E676]">₹{inspectingSettlement.amount_inr}</span>
                </div>
                <div>
                  <span className="text-[10px] text-white/40 block">Settled At</span>
                  <span className="text-white/70">{inspectingSettlement.settled_at || 'Not yet'}</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-white/40 uppercase block mb-1">Idempotency Key</span>
                <span className="font-mono text-white/80 bg-white/5 p-2 rounded-xl block border border-white/10">
                  {inspectingSettlement.idempotency_key}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-white/40 uppercase block mb-1">Raw Settlement Metadata</span>
                <pre className="font-mono text-[11px] text-white/70 bg-white/5 p-3 rounded-xl border border-white/10 overflow-x-auto">
                  {JSON.stringify(inspectingSettlement.metadata, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setInspectingSettlement(null)}
                className="rounded-full text-xs bg-white/10 hover:bg-white/20 text-white"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
