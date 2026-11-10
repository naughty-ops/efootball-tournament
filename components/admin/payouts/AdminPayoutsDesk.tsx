'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Landmark,
  Trophy,
  Coins,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Search,
  Filter,
  Eye,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  ExternalLink,
  Loader2,
  Lock,
  FileCheck,
  X,
  History,
  AlertTriangle,
  Hourglass,
  Calendar,
  RotateCcw,
  Copy,
  Check,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  AdminFinancialOverviewStats,
  PayoutTransactionRecord,
  PayoutStatus,
} from '@/types/wallet';
import {
  adminDistributePrizesAction,
  adminUpdatePayoutStatusAction,
} from '@/app/actions/walletActions';
import { formatDate } from '@/lib/utils';

interface AdminPayoutsDeskProps {
  overview: AdminFinancialOverviewStats;
  payouts: PayoutTransactionRecord[];
  completedTournaments: any[];
}

export default function AdminPayoutsDesk({
  overview,
  payouts,
  completedTournaments,
}: AdminPayoutsDeskProps) {
  const [activeTab, setActiveTab] = useState<'payouts' | 'distribution'>('payouts');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Time state for SLA calculations
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Payout detail / action modal state
  const [selectedPayout, setSelectedPayout] = useState<PayoutTransactionRecord | null>(null);
  const [actionType, setActionType] = useState<
    'view_details' | 'mark_paid' | 'mark_processing' | 'mark_failed' | 'retry' | null
  >(null);
  const [utrInput, setUtrInput] = useState('');
  const [receiptUrlInput, setReceiptUrlInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Prize Distribution modal state
  const [selectedTournament, setSelectedTournament] = useState<any | null>(null);
  const [distNotes, setDistNotes] = useState('');
  const [distLoading, setDistLoading] = useState(false);
  const [distError, setDistError] = useState<string | null>(null);
  const [distSuccess, setDistSuccess] = useState<string | null>(null);

  // Copy to clipboard helper
  const handleCopy = (text: string, key: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  // Filter payouts
  const filteredPayouts = useMemo(() => {
    return payouts.filter((p) => {
      const deadlineMs = p.deadlineAt ? new Date(p.deadlineAt).getTime() : new Date(p.createdAt).getTime() + 24 * 3600 * 1000;
      const isOverdue = deadlineMs < nowMs && p.payoutStatus !== 'PAID' && p.payoutStatus !== 'REJECTED';

      let matchesStatus = true;
      if (statusFilter === 'all') {
        matchesStatus = true;
      } else if (statusFilter === 'overdue') {
        matchesStatus = isOverdue;
      } else {
        matchesStatus = p.payoutStatus === statusFilter;
      }

      const matchesSearch =
        !searchTerm.trim() ||
        p.payoutReference.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.playerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.playerEmail && p.playerEmail.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.tournamentName && p.tournamentName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.utrReference && p.utrReference.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchesStatus && matchesSearch;
    });
  }, [payouts, statusFilter, searchTerm, nowMs]);

  // Action status update handler
  const handleUpdateStatus = async () => {
    if (!selectedPayout) return;
    setActionError(null);
    setActionLoading(true);

    try {
      let newStatus: PayoutStatus = 'PROCESSING';
      let utr: string | undefined = undefined;
      let reason: string | undefined = undefined;

      if (actionType === 'mark_paid') {
        newStatus = 'PAID';
        utr = utrInput.trim();
        if (!utr || utr.length < 4) {
          setActionError('Please enter a valid Bank UTR / Transaction Reference (minimum 4 characters).');
          setActionLoading(false);
          return;
        }
      } else if (actionType === 'mark_processing' || actionType === 'retry') {
        newStatus = 'PROCESSING';
      } else if (actionType === 'mark_failed') {
        newStatus = 'FAILED';
        reason = reasonInput.trim();
        if (!reason || reason.length < 5) {
          setActionError('Please provide a mandatory explanation for marking this payout as failed.');
          setActionLoading(false);
          return;
        }
      }

      const res = await adminUpdatePayoutStatusAction({
        payoutId: selectedPayout.id,
        newStatus,
        utrReference: utr,
        failureReason: reason,
        receiptUrl: receiptUrlInput.trim() || undefined,
      });

      if (!res.success) {
        setActionError(res.error || 'Failed to update payout status.');
      } else {
        setSelectedPayout(null);
        setActionType(null);
        setUtrInput('');
        setReceiptUrlInput('');
        setReasonInput('');
      }
    } catch (err: any) {
      setActionError(err.message || 'An unexpected error occurred.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDistributePrizes = async () => {
    if (!selectedTournament) return;
    setDistError(null);
    setDistSuccess(null);
    setDistLoading(true);

    try {
      const res = await adminDistributePrizesAction({
        tournamentId: selectedTournament.id,
        customNotes: distNotes.trim() || undefined,
      });

      if (!res.success) {
        setDistError(res.error || 'Failed to distribute prizes.');
      } else {
        setDistSuccess(
          `Successfully distributed prize money and provisioned direct 24h SLA payouts for ${res.data?.awardedCount} verified winners!`
        );
        setTimeout(() => {
          setSelectedTournament(null);
          setDistSuccess(null);
        }, 2500);
      }
    } catch (err: any) {
      setDistError(err.message || 'An unexpected error occurred.');
    } finally {
      setDistLoading(false);
    }
  };

  const getPayoutBadge = (status: PayoutStatus, isOverdue: boolean) => {
    switch (status) {
      case 'PAID':
        return (
          <Badge className="bg-[#00C853]/20 text-[#00E676] border-[#00C853]/40 text-[10px] font-black uppercase tracking-wider">
            PAID
          </Badge>
        );
      case 'PROCESSING':
        return (
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 text-[10px] font-black uppercase tracking-wider animate-pulse">
            PROCESSING
          </Badge>
        );
      case 'APPROVED':
      case 'PENDING':
      case 'PENDING_APPROVAL':
        return (
          <Badge className={`text-[10px] font-black uppercase tracking-wider ${
            isOverdue
              ? 'bg-red-500/20 text-red-300 border-red-500/40'
              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
          }`}>
            {isOverdue ? 'OVERDUE' : 'APPROVED'}
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40 text-[10px] font-black uppercase tracking-wider">
            FAILED
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[10px] font-black uppercase tracking-wider">
            REJECTED
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#FFFF00]/15 text-[#FFFF00] border border-[#FFFF00]/30">
              Finance & Payout Command Desk
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white font-display uppercase tracking-wide mt-1">
            Direct Player Payout Operations
          </h1>
          <p className="text-xs sm:text-sm text-white/60">
            Manual administrator banking transfer workflow, 24-hour SLA enforcement, and immutable financial ledger.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 bg-[#0B0B7C] p-1.5 rounded-2xl border border-white/20 shadow-md">
          <button
            type="button"
            onClick={() => setActiveTab('payouts')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeTab === 'payouts'
                ? 'bg-[#FFFF00] text-[#08088F] shadow-sm'
                : 'text-white/70 hover:text-white'
            }`}
          >
            Payout Queue ({payouts.filter((p) => p.payoutStatus !== 'PAID' && p.payoutStatus !== 'REJECTED').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('distribution')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeTab === 'distribution'
                ? 'bg-[#FFFF00] text-[#08088F] shadow-sm'
                : 'text-white/70 hover:text-white'
            }`}
          >
            Prize Distribution Hub ({completedTournaments.filter((t) => !t.hasDistributedPrizes).length} Pending)
          </button>
        </div>
      </div>

      {/* SLA Alert Header Banner if Overdue or Urgent Payouts Exist */}
      {(overview.overduePayoutsCount > 0 || overview.urgentPayoutsCount > 0) && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-red-600/30 via-red-600/15 to-transparent border-2 border-red-500/60 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-600/30 border border-red-400 flex items-center justify-center text-red-200 shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-400 animate-pulse" />
            </div>
            <div>
              <h4 className="text-sm font-black uppercase tracking-wider text-white">
                SLA Alert: {overview.overduePayoutsCount} Overdue Payouts • {overview.urgentPayoutsCount} Due Within 1 Hour
              </h4>
              <p className="text-xs text-white/80 mt-0.5">
                Tournament prize winners are entitled to external bank/UPI disbursement within 24 hours of eligibility. Please review and disburse immediately.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setStatusFilter('overdue')}
            className="bg-red-500 hover:bg-red-600 text-white font-black text-xs uppercase tracking-wider rounded-xl h-9 px-4 shrink-0 cursor-pointer shadow-md"
          >
            View Overdue Queue
          </Button>
        </div>
      )}

      {/* Advanced Financial Overview KPI Cards (8 Key Metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. Total Distributed */}
        <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-lg">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-white/60">Prizes Distributed</span>
              <Trophy className="h-4 w-4 text-[#00E676]" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-white font-display mt-2">
              ₹{overview.totalPrizeAwardedInr.toLocaleString('en-IN')}
            </div>
            <p className="text-[10px] text-white/50 mt-1">Confirmed entitlements</p>
          </CardContent>
        </Card>

        {/* 2. Total Paid */}
        <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-lg">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-blue-300">Total Settled</span>
              <CheckCircle2 className="h-4 w-4 text-blue-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-blue-400 font-display mt-2">
              ₹{overview.totalPaidInr.toLocaleString('en-IN')}
            </div>
            <p className="text-[10px] text-white/50 mt-1">{overview.paidPayoutsCount} payouts completed</p>
          </CardContent>
        </Card>

        {/* 3. Approved Unpaid */}
        <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-lg">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-amber-300">Approved Unpaid</span>
              <Clock className="h-4 w-4 text-amber-300" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-300 font-display mt-2">
              ₹{overview.approvedUnpaidInr.toLocaleString('en-IN')}
            </div>
            <p className="text-[10px] text-white/50 mt-1">{overview.pendingPayoutsCount} rewards awaiting transfer</p>
          </CardContent>
        </Card>

        {/* 4. Total Outstanding Liability */}
        <Card className="bg-gradient-to-br from-[#0B0B8C] to-[#1212B0] border-2 border-[#FFFF00]/40 rounded-2xl shadow-lg">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-[#FFFF00]">Total Liability</span>
              <Coins className="h-4 w-4 text-[#FFFF00]" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-[#FFFF00] font-display mt-2">
              ₹{overview.totalOutstandingInr.toLocaleString('en-IN')}
            </div>
            <p className="text-[10px] text-white/70 mt-1">Total unpaid liabilities</p>
          </CardContent>
        </Card>

        {/* 5. Processing */}
        <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-lg">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-white/60">In Processing</span>
              <Hourglass className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-white font-display mt-2">
              ₹{overview.processingPayoutsInr.toLocaleString('en-IN')}
            </div>
            <p className="text-[10px] text-white/50 mt-1">{overview.processingPayoutsCount} in transit</p>
          </CardContent>
        </Card>

        {/* 6. Overdue Payouts */}
        <Card className={`border rounded-2xl shadow-lg ${
          overview.overduePayoutsCount > 0
            ? 'bg-red-500/20 border-red-500/60'
            : 'bg-[#0A0A7A] border-white/20'
        }`}>
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-black uppercase ${
                overview.overduePayoutsCount > 0 ? 'text-red-300' : 'text-white/60'
              }`}>
                Overdue Payouts
              </span>
              <AlertTriangle className={`h-4 w-4 ${
                overview.overduePayoutsCount > 0 ? 'text-red-400 animate-pulse' : 'text-white/40'
              }`} />
            </div>
            <div className={`text-xl sm:text-2xl font-black font-display mt-2 ${
              overview.overduePayoutsCount > 0 ? 'text-red-300' : 'text-white'
            }`}>
              {overview.overduePayoutsCount}
            </div>
            <p className="text-[10px] text-white/50 mt-1">Exceeded 24h SLA deadline</p>
          </CardContent>
        </Card>

        {/* 7. Failed Payouts */}
        <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-lg">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-rose-300">Failed Payouts</span>
              <AlertCircle className="h-4 w-4 text-rose-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-rose-300 font-display mt-2">
              {overview.failedPayoutsCount}
            </div>
            <p className="text-[10px] text-white/50 mt-1">Retryable without duplicating prize</p>
          </CardContent>
        </Card>

        {/* 8. Due Soon (Within 6 Hours) */}
        <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-lg">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-amber-300">Due Within 6h</span>
              <Clock className="h-4 w-4 text-amber-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-300 font-display mt-2">
              {overview.dueSoonPayoutsCount}
            </div>
            <p className="text-[10px] text-white/50 mt-1">{overview.urgentPayoutsCount} due within 1 hour</p>
          </CardContent>
        </Card>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: PAYOUT MANAGEMENT QUEUE */}
      {/* ============================================================ */}
      {activeTab === 'payouts' && (
        <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-xl overflow-hidden">
          <CardHeader className="p-4 sm:p-5 border-b border-white/10 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <CardTitle className="text-base sm:text-lg font-black text-white flex items-center gap-2 font-display uppercase tracking-wider">
                <Landmark className="h-4 w-4 text-[#FFFF00]" />
                <span>Manual Player Payout Queue</span>
              </CardTitle>
              <span className="text-xs font-bold text-white/70">
                Total Matches: <span className="text-[#FFFF00]">{filteredPayouts.length}</span>
              </span>
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <div className="relative sm:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
                <Input
                  placeholder="Search player, reference, tournament, or UTR..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs bg-black/30 border-white/15 text-white rounded-xl placeholder:text-white/40"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 px-3 text-xs bg-[#07074E] border border-white/15 text-white rounded-xl focus:border-[#FFFF00] outline-none cursor-pointer"
              >
                <option value="all">All Payout Statuses</option>
                <option value="overdue">🚨 Overdue Payouts (&gt;24h)</option>
                <option value="APPROVED">Approved (Awaiting Transfer)</option>
                <option value="PROCESSING">Under Processing</option>
                <option value="PAID">Paid & Settled</option>
                <option value="FAILED">Failed Transfers</option>
                <option value="PENDING">Pending</option>
              </select>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {filteredPayouts.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Landmark className="h-10 w-10 text-white/30 mx-auto mb-2" />
                <p className="text-sm font-bold text-white/70">No payouts matching your search or filter.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5 text-white/60 font-black uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-3">Player</th>
                      <th className="py-3 px-3">Tournament / Position</th>
                      <th className="py-3 px-3 text-right">Reward</th>
                      <th className="py-3 px-3">Preferred Channel</th>
                      <th className="py-3 px-3">SLA Deadline / Status</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredPayouts.map((p) => {
                      const deadlineMs = p.deadlineAt ? new Date(p.deadlineAt).getTime() : new Date(p.createdAt).getTime() + 24 * 3600 * 1000;
                      const diffMs = deadlineMs - nowMs;
                      const isOverdue = diffMs <= 0 && p.payoutStatus !== 'PAID' && p.payoutStatus !== 'REJECTED';
                      const hoursLeft = Math.floor(diffMs / (1000 * 60 * 60));
                      const minutesLeft = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-white/5 transition-colors ${
                            isOverdue ? 'bg-red-950/20' : ''
                          }`}
                        >
                          {/* Player */}
                          <td className="py-3.5 px-3">
                            <div className="font-bold text-white">{p.playerName}</div>
                            <div className="text-[10px] text-white/50 font-mono">
                              ID: {p.playerId.slice(0, 8).toUpperCase()}
                            </div>
                          </td>

                          {/* Tournament & Position */}
                          <td className="py-3.5 px-3">
                            <div className="font-bold text-white truncate max-w-[170px]">
                              {p.tournamentName || 'Tournament Prize'}
                            </div>
                            <div className="text-[10px] text-[#FFFF00] font-medium">
                              {p.positionTitle || 'Winner'} • Ref: {p.payoutReference}
                            </div>
                          </td>

                          {/* Reward Amount */}
                          <td className="py-3.5 px-3 text-right font-black text-sm font-display text-[#00E676]">
                            ₹{Number(p.amountInr).toLocaleString('en-IN')}
                          </td>

                          {/* Preferred Method & Masked Account */}
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-1.5 text-white/90">
                              {p.paymentMethodType === 'upi' ? (
                                <Smartphone className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Landmark className="h-3.5 w-3.5 text-blue-400" />
                              )}
                              <span className="capitalize font-bold">
                                {p.paymentMethodType === 'upi' ? 'UPI' : 'Bank'}
                              </span>
                            </div>
                            <div className="text-[10px] text-white/50 font-mono">
                              {p.paymentDetails?.maskedAccountNumber || p.paymentDetails?.upiId || 'Not Saved'}
                            </div>
                          </td>

                          {/* SLA Deadline & Time Remaining */}
                          <td className="py-3.5 px-3">
                            {p.payoutStatus === 'PAID' ? (
                              <div className="text-[11px] text-[#00E676] font-bold flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Paid {p.paidAt ? formatDate(p.paidAt) : ''}</span>
                              </div>
                            ) : isOverdue ? (
                              <div className="text-red-400 font-black text-[11px] flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 animate-pulse" />
                                <span>OVERDUE ({Math.abs(hoursLeft)}h ago)</span>
                              </div>
                            ) : (
                              <div className="text-amber-300 font-bold text-[11px] flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>{hoursLeft}h {minutesLeft}m left</span>
                              </div>
                            )}
                            <div className="text-[10px] text-white/40">
                              Eligible: {p.eligibleAt ? formatDate(p.eligibleAt) : formatDate(p.createdAt)}
                            </div>
                          </td>

                          {/* Payout Status */}
                          <td className="py-3.5 px-3">{getPayoutBadge(p.payoutStatus, isOverdue)}</td>

                          {/* Action Buttons */}
                          <td className="py-3.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* View / Copy Decrypted Details */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedPayout(p);
                                  setActionType('view_details');
                                }}
                                className="h-7 px-2 text-[11px] bg-white/5 border-white/20 text-white hover:bg-white/10 cursor-pointer"
                                title="Inspect Bank/UPI Details"
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                Transfer Details
                              </Button>

                              {/* Start Processing */}
                              {(p.payoutStatus === 'APPROVED' || p.payoutStatus === 'PENDING') && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedPayout(p);
                                    setActionType('mark_processing');
                                  }}
                                  className="h-7 px-2.5 text-[11px] bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer"
                                >
                                  Process
                                </Button>
                              )}

                              {/* Record Paid */}
                              {p.payoutStatus !== 'PAID' && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedPayout(p);
                                    setActionType('mark_paid');
                                  }}
                                  className="h-7 px-2.5 text-[11px] bg-[#00C853] hover:bg-[#00E676] text-[#08088F] font-black cursor-pointer shadow-sm gap-1"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>Mark Paid</span>
                                </Button>
                              )}

                              {/* Mark Failed */}
                              {p.payoutStatus === 'PROCESSING' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedPayout(p);
                                    setActionType('mark_failed');
                                  }}
                                  className="h-7 px-2 text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                                >
                                  Mark Failed
                                </Button>
                              )}

                              {/* Retry Failed */}
                              {p.payoutStatus === 'FAILED' && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedPayout(p);
                                    setActionType('retry');
                                  }}
                                  className="h-7 px-2 text-[11px] bg-amber-500 hover:bg-amber-600 text-[#08088F] font-black cursor-pointer gap-1"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Retry
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/* TAB 2: TOURNAMENT PRIZE DISTRIBUTION HUB */}
      {/* ============================================================ */}
      {activeTab === 'distribution' && (
        <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-xl overflow-hidden">
          <CardHeader className="p-4 sm:p-5 border-b border-white/10">
            <CardTitle className="text-base sm:text-lg font-black text-white flex items-center gap-2 font-display uppercase tracking-wider">
              <Trophy className="h-4 w-4 text-[#FFFF00]" />
              <span>Completed Tournament Prize Allocation</span>
            </CardTitle>
            <p className="text-xs text-white/60 mt-0.5">
              Review concluded tournament podium winners. Distributing prizes allocates funds into the player wallet ledger and automatically schedules 24-hour SLA direct payouts.
            </p>
          </CardHeader>

          <CardContent className="p-4 sm:p-6 space-y-4">
            {completedTournaments.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Trophy className="h-10 w-10 text-white/30 mx-auto mb-2" />
                <p className="text-sm font-bold text-white/70">No completed tournaments found.</p>
                <p className="text-xs text-white/40 mt-1">
                  Once a tournament concludes with verified winners, it will appear here for prize allocation.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {completedTournaments.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl bg-black/30 border border-white/15 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-black text-white truncate">{t.name}</h4>
                        {t.hasDistributedPrizes ? (
                          <Badge className="bg-[#00C853]/20 text-[#00E676] border-[#00C853]/40 text-[10px] font-black uppercase">
                            All Awarded ({t.distributedCount})
                          </Badge>
                        ) : t.isPartiallyDistributed ? (
                          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] font-black uppercase">
                            Partially Awarded ({t.distributedCount}/{t.eligibleCount})
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 text-[10px] font-black uppercase">
                            Ready to Award
                          </Badge>
                        )}
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                          <span className="text-[10px] text-white/50 block">Champion</span>
                          <span className="font-bold text-[#FFFF00] truncate block">
                            {t.champion?.username || t.champion?.real_name || 'TBD'}
                          </span>
                          <span className="text-[10px] text-[#00E676] font-bold">
                            ₹{Number(t.first_place_prize_paise || 0) / 100}
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                          <span className="text-[10px] text-white/50 block">Runner-up</span>
                          <span className="font-bold text-white truncate block">
                            {t.runner_up?.username || t.runner_up?.real_name || 'TBD'}
                          </span>
                          <span className="text-[10px] text-[#00E676] font-bold">
                            ₹{Number(t.second_place_prize_paise || 0) / 100}
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                          <span className="text-[10px] text-white/50 block">3rd Place</span>
                          <span className="font-bold text-white truncate block">
                            {t.third_place?.username || t.third_place?.real_name || 'TBD'}
                          </span>
                          <span className="text-[10px] text-[#00E676] font-bold">
                            ₹{Number(t.third_place_prize_paise || 0) / 100}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                      <span className="text-xs text-white/60">
                        Prize Pool: ₹{Number(t.prize_pool_paise || 0) / 100}
                      </span>
                      <Button
                        size="sm"
                        disabled={t.hasDistributedPrizes}
                        onClick={() => {
                          setSelectedTournament(t);
                          setDistError(null);
                          setDistSuccess(null);
                        }}
                        className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-xl h-8 px-4 disabled:opacity-50 cursor-pointer"
                      >
                        {t.hasDistributedPrizes
                          ? 'All Prizes Distributed'
                          : t.isPartiallyDistributed
                          ? 'Distribute Remaining'
                          : 'Distribute Prizes'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/* MODAL 1: VIEW DECRYPTED TRANSFER DETAILS FOR EXTERNAL BANKING */}
      {/* ============================================================ */}
      {selectedPayout && actionType === 'view_details' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#0B0B7C] border-2 border-white/20 rounded-3xl max-w-lg w-full p-6 shadow-2xl text-white space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#FFFF00]" />
                <h3 className="text-base font-black uppercase tracking-wider">
                  External Transfer Destination
                </h3>
              </div>
              <button
                onClick={() => {
                  setSelectedPayout(null);
                  setActionType(null);
                }}
                className="text-white/60 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs">
              <p>
                <strong>Admin Directive:</strong> Open your banking portal or Google Pay app, manually transfer exactly <strong>₹{selectedPayout.amountInr}</strong> to the credentials below, then record the Bank UTR reference.
              </p>
            </div>

            <div className="space-y-3 bg-black/30 p-4 rounded-2xl border border-white/10 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-white/60">Player Name</span>
                <span className="font-bold text-white">{selectedPayout.playerName}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-white/60">Amount to Transfer</span>
                <span className="font-black text-emerald-400 text-sm">₹{selectedPayout.amountInr}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-white/60">Transfer Channel</span>
                <span className="font-bold capitalize">{selectedPayout.paymentMethodType === 'upi' ? 'Google Pay / UPI' : 'Direct Bank Transfer'}</span>
              </div>

              {selectedPayout.paymentDetails?.paymentMethodType === 'bank_account' ? (
                <>
                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                    <span className="text-white/60">Account Holder</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{selectedPayout.paymentDetails.accountHolderName}</span>
                      <button
                        onClick={() => handleCopy(selectedPayout.paymentDetails?.accountHolderName || '', 'holder')}
                        className="text-[#FFFF00] hover:text-yellow-300"
                      >
                        {copiedKey === 'holder' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                    <span className="text-white/60">Bank Name</span>
                    <span className="font-bold">{selectedPayout.paymentDetails.bankName}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                    <span className="text-white/60">Account Number</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#FFFF00] text-sm">
                        {selectedPayout.paymentDetails.accountNumber || selectedPayout.paymentDetails.maskedAccountNumber}
                      </span>
                      <button
                        onClick={() => handleCopy(selectedPayout.paymentDetails?.accountNumber || '', 'acc')}
                        className="text-[#FFFF00] hover:text-yellow-300"
                      >
                        {copiedKey === 'acc' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-white/60">IFSC Code</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white">{selectedPayout.paymentDetails.ifscCode}</span>
                      <button
                        onClick={() => handleCopy(selectedPayout.paymentDetails?.ifscCode || '', 'ifsc')}
                        className="text-[#FFFF00] hover:text-yellow-300"
                      >
                        {copiedKey === 'ifsc' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex justify-between items-center py-1">
                  <span className="text-white/60">UPI ID / VPA</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#FFFF00] text-sm">
                      {selectedPayout.paymentDetails?.upiId || 'N/A'}
                    </span>
                    <button
                      onClick={() => handleCopy(selectedPayout.paymentDetails?.upiId || '', 'upi')}
                      className="text-[#FFFF00] hover:text-yellow-300"
                    >
                      {copiedKey === 'upi' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedPayout(null);
                  setActionType(null);
                }}
                className="border-white/20 text-white rounded-xl text-xs font-bold"
              >
                Close
              </Button>
              <Button
                onClick={() => setActionType('mark_paid')}
                className="bg-[#00C853] hover:bg-[#00E676] text-[#08088F] font-black text-xs rounded-xl gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Mark Paid (Enter UTR)</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: RECORD EXTERNAL PAYMENT (MANDATORY UTR) */}
      {/* ============================================================ */}
      {selectedPayout && actionType === 'mark_paid' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#0B0B7C] border-2 border-white/20 rounded-3xl max-w-md w-full p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-[#00E676]" />
                <h3 className="text-base font-black uppercase tracking-wider">
                  Mark Payout as Paid
                </h3>
              </div>
              <button
                onClick={() => {
                  setSelectedPayout(null);
                  setActionType(null);
                }}
                className="text-white/60 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-white/70">
              Confirm that you have completed the external transfer of{' '}
              <strong className="text-[#00E676]">₹{selectedPayout.amountInr}</strong> to{' '}
              <strong>{selectedPayout.playerName}</strong>.
            </p>

            {actionError && (
              <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs">
                {actionError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-white/80 block mb-1">
                  Bank UTR / Transaction Reference Number <span className="text-red-400">*</span>
                </label>
                <Input
                  placeholder="e.g. 429182910481 or UPI/429182910481"
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value)}
                  className="bg-black/40 border-white/20 text-white rounded-xl h-10 font-mono"
                />
                <span className="text-[10px] text-white/50 block mt-1">
                  Unique reference generated by your bank or UPI application.
                </span>
              </div>

              <div>
                <label className="font-bold text-white/80 block mb-1">
                  Optional Payment Receipt URL / Cloudinary Link
                </label>
                <Input
                  placeholder="https://res.cloudinary.com/..."
                  value={receiptUrlInput}
                  onChange={(e) => setReceiptUrlInput(e.target.value)}
                  className="bg-black/40 border-white/20 text-white rounded-xl h-10"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <Button
                variant="outline"
                disabled={actionLoading}
                onClick={() => {
                  setSelectedPayout(null);
                  setActionType(null);
                }}
                className="border-white/20 text-white rounded-xl text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                disabled={actionLoading || !utrInput.trim()}
                onClick={handleUpdateStatus}
                className="bg-[#00C853] hover:bg-[#00E676] text-[#08088F] font-black text-xs rounded-xl gap-2"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirm & Mark as Paid
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: MARK AS FAILED (MANDATORY REASON) */}
      {/* ============================================================ */}
      {selectedPayout && actionType === 'mark_failed' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#0B0B7C] border-2 border-red-500/50 rounded-3xl max-w-md w-full p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-rose-400" />
                <h3 className="text-base font-black uppercase tracking-wider text-rose-300">
                  Mark Payout as Failed
                </h3>
              </div>
              <button
                onClick={() => {
                  setSelectedPayout(null);
                  setActionType(null);
                }}
                className="text-white/60 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-white/70">
              Marking this payout as failed preserves the player&apos;s prize balance in the wallet and notifies them. Administrators can retry later.
            </p>

            {actionError && (
              <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs">
                {actionError}
              </div>
            )}

            <div>
              <label className="font-bold text-white/80 block mb-1 text-xs">
                Mandatory Explanation Reason <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Beneficiary bank account returned IFSC inactive / UPI VPA rejected by receiving PSP."
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                className="w-full bg-black/40 border border-white/20 text-white rounded-xl p-3 text-xs outline-none focus:border-red-400"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <Button
                variant="outline"
                disabled={actionLoading}
                onClick={() => {
                  setSelectedPayout(null);
                  setActionType(null);
                }}
                className="border-white/20 text-white rounded-xl text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                disabled={actionLoading || reasonInput.trim().length < 5}
                onClick={handleUpdateStatus}
                className="bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl gap-2"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
                Confirm Failed Status
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 4: PRIZE ALLOCATION CONFIRMATION */}
      {/* ============================================================ */}
      {selectedTournament && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#0B0B7C] border-2 border-[#FFFF00]/50 rounded-3xl max-w-lg w-full p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-[#FFFF00]" />
                <h3 className="text-base font-black uppercase tracking-wider">
                  Distribute Tournament Prizes
                </h3>
              </div>
              <button
                onClick={() => setSelectedTournament(null)}
                className="text-white/60 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-white/80">
              Distribute configured cash rewards for <strong>{selectedTournament.name}</strong>. This writes atomic entries into the authoritative financial ledger and provisions direct 24h SLA payouts.
            </p>

            <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2 text-xs">
              <div className="font-bold text-white/70">Configured Prize Breakdown:</div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className="p-2 rounded-lg bg-black/30 border border-white/10">
                  <span className="text-white/50 block text-[10px]">Champion (1st)</span>
                  <span className="font-bold text-[#FFFF00] block truncate">
                    {selectedTournament.champion?.username || selectedTournament.champion?.real_name || 'TBD'}
                  </span>
                  <span className="text-[#00E676] font-bold block">
                    ₹{Number(selectedTournament.first_place_prize_paise || 0) / 100}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-black/30 border border-white/10">
                  <span className="text-white/50 block text-[10px]">Runner-up (2nd)</span>
                  <span className="font-bold text-white block truncate">
                    {selectedTournament.runner_up?.username || selectedTournament.runner_up?.real_name || 'TBD'}
                  </span>
                  <span className="text-[#00E676] font-bold block">
                    ₹{Number(selectedTournament.second_place_prize_paise || 0) / 100}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-black/30 border border-white/10">
                  <span className="text-white/50 block text-[10px]">3rd Place</span>
                  <span className="font-bold text-white block truncate">
                    {selectedTournament.third_place?.username || selectedTournament.third_place?.real_name || 'TBD'}
                  </span>
                  <span className="text-[#00E676] font-bold block">
                    ₹{Number(selectedTournament.third_place_prize_paise || 0) / 100}
                  </span>
                </div>
              </div>
            </div>

            {distError && (
              <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs">
                {distError}
              </div>
            )}
            {distSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs">
                {distSuccess}
              </div>
            )}

            <div>
              <label className="font-bold text-white/80 block mb-1 text-xs">
                Optional Audit Notes
              </label>
              <Input
                placeholder="e.g. Official Season 4 Grand Finalist distributions approved."
                value={distNotes}
                onChange={(e) => setDistNotes(e.target.value)}
                className="bg-black/40 border-white/20 text-white rounded-xl h-10 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <Button
                variant="outline"
                disabled={distLoading}
                onClick={() => setSelectedTournament(null)}
                className="border-white/20 text-white rounded-xl text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                disabled={distLoading}
                onClick={handleDistributePrizes}
                className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs rounded-xl gap-2 cursor-pointer shadow-lg"
              >
                {distLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
                Execute Prize Distribution
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
