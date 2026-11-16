'use client';

import React, { useState, useTransition } from 'react';
import Image from 'next/image';
import {
  Wallet,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  QrCode,
  Search,
  RefreshCw,
  Copy,
  Check,
  Eye,
  Sliders,
  ArrowUpRight,
  ShieldCheck,
  FileText,
  Upload,
  Phone,
  Landmark,
  ExternalLink,
  X,
  Loader2,
  DollarSign,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  WalletDepositRecord,
  WalletDepositStatus,
  WalletPaymentSettings,
} from '@/types/wallet';
import {
  adminApproveDepositAction,
  adminRejectDepositAction,
  updateWalletPaymentSettingsAction,
  uploadAdminQrCodeAction,
} from '@/app/actions/walletActions';
import { formatDate } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface AdminWalletDeskProps {
  initialDeposits: WalletDepositRecord[];
  initialSettings: WalletPaymentSettings;
  summary: {
    pendingCount: number;
    approvedSumInr: number;
    rejectedCount: number;
  };
}

export default function AdminWalletDesk({
  initialDeposits = [],
  initialSettings,
  summary: initialSummary,
}: AdminWalletDeskProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'deposits' | 'settings'>('deposits');
  const [deposits, setDeposits] = useState<WalletDepositRecord[]>(initialDeposits);
  const [summary, setSummary] = useState(initialSummary);
  const [settings, setSettings] = useState<WalletPaymentSettings>(initialSettings);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | WalletDepositStatus>('all');

  // Modals state
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
  const [approvingDeposit, setApprovingDeposit] = useState<WalletDepositRecord | null>(null);
  const [rejectingDeposit, setRejectingDeposit] = useState<WalletDepositRecord | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // QR Upload & Settings Form state
  const [isPending, startTransition] = useTransition();
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [copiedUtr, setCopiedUtr] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUtr(text);
    setTimeout(() => setCopiedUtr(null), 2000);
  };

  // Filtered deposits
  const filteredDeposits = deposits.filter((d) => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchUtr = d.utrReference?.toLowerCase().includes(q);
      const matchRef = d.depositReference?.toLowerCase().includes(q);
      const matchUser = d.userName?.toLowerCase().includes(q) || d.userId?.toLowerCase().includes(q);
      return matchUtr || matchRef || matchUser;
    }
    return true;
  });

  // Action: Approve Deposit
  const handleConfirmApproval = async () => {
    if (!approvingDeposit) return;
    setActionError(null);

    startTransition(async () => {
      const res = await adminApproveDepositAction({
        depositId: approvingDeposit.id,
        adminNotes: adminNotes.trim() || undefined,
      });

      if (!res.success) {
        setActionError(res.error || 'Failed to approve deposit.');
        return;
      }

      // Update local state
      setDeposits((prev) =>
        prev.map((d) =>
          d.id === approvingDeposit.id
            ? {
                ...d,
                status: 'approved' as WalletDepositStatus,
                adminNotes: adminNotes.trim() || null,
                approvedAt: new Date().toISOString(),
              }
            : d
        )
      );

      setSummary((prev) => ({
        ...prev,
        pendingCount: Math.max(0, prev.pendingCount - 1),
        approvedSumInr: prev.approvedSumInr + approvingDeposit.amountInr,
      }));

      setApprovingDeposit(null);
      setAdminNotes('');
      router.refresh();
    });
  };

  // Action: Reject Deposit
  const handleConfirmRejection = async () => {
    if (!rejectingDeposit) return;
    if (!rejectionReason.trim() || rejectionReason.trim().length < 3) {
      setActionError('Please provide a specific rejection reason (min 3 characters).');
      return;
    }

    setActionError(null);

    startTransition(async () => {
      const res = await adminRejectDepositAction({
        depositId: rejectingDeposit.id,
        rejectionReason: rejectionReason.trim(),
      });

      if (!res.success) {
        setActionError(res.error || 'Failed to reject deposit.');
        return;
      }

      // Update local state
      setDeposits((prev) =>
        prev.map((d) =>
          d.id === rejectingDeposit.id
            ? {
                ...d,
                status: 'rejected' as WalletDepositStatus,
                rejectionReason: rejectionReason.trim(),
                reviewedAt: new Date().toISOString(),
              }
            : d
        )
      );

      setSummary((prev) => ({
        ...prev,
        pendingCount: Math.max(0, prev.pendingCount - 1),
        rejectedCount: prev.rejectedCount + 1,
      }));

      setRejectingDeposit(null);
      setRejectionReason('');
      router.refresh();
    });
  };

  // Action: Upload QR Code Image
  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingQr(true);
    setSettingsError(null);
    setSettingsSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await uploadAdminQrCodeAction(formData);
      if (!res.success || !res.data) {
        setSettingsError(res.error || 'Failed to upload QR code.');
      } else {
        setSettings((prev) => ({ ...prev, upiQrImageUrl: res.data!.publicUrl }));
        setSettingsSuccess('QR Code uploaded and published to public storage!');
      }
    } catch (err: any) {
      setSettingsError(err?.message || 'Failed to upload QR code image.');
    } finally {
      setIsUploadingQr(false);
    }
  };

  // Action: Save Payment Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    setSettingsSuccess(null);

    startTransition(async () => {
      const res = await updateWalletPaymentSettingsAction(settings);
      if (!res.success) {
        setSettingsError(res.error || 'Failed to update payment settings.');
      } else {
        setSettingsSuccess('Payment settings and UPI parameters successfully updated!');
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#FFFF00]/15 text-[#FFFF00] border border-[#FFFF00]/30">
              Administrative Financial Control
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white font-display uppercase tracking-wide mt-1">
            Wallet & Manual Deposit Desk
          </h1>
          <p className="text-xs sm:text-sm text-white/60">
            Verify incoming UPI transfers against banking statements, credit player wallets atomically, and manage platform QR credentials.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2 bg-[#08086B] p-1 rounded-xl border border-white/10 shrink-0">
          <button
            onClick={() => setActiveTab('deposits')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'deposits'
                ? 'bg-[#FFFF00] text-[#08088F] shadow-sm font-black'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <ArrowUpRight className="h-4 w-4" />
            <span>Verification Queue</span>
            {summary.pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-500 text-white font-black animate-pulse">
                {summary.pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-[#FFFF00] text-[#08088F] shadow-sm font-black'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <QrCode className="h-4 w-4" />
            <span>QR & UPI Settings</span>
          </button>
        </div>
      </div>

      {/* TAB 1: DEPOSITS VERIFICATION QUEUE */}
      {activeTab === 'deposits' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Pending Review */}
            <Card className="bg-[#0A0A7A] border border-amber-500/40 rounded-2xl shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl" />
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-300">
                    Awaiting Review
                  </span>
                  <div className="text-3xl font-black text-white font-display mt-1">
                    {summary.pendingCount}
                  </div>
                  <p className="text-[10px] text-amber-200/70 mt-0.5">Claims needing bank verification</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300">
                  <Clock className="h-6 w-6 animate-pulse" />
                </div>
              </CardContent>
            </Card>

            {/* 2. Total Approved (Sum ₹) */}
            <Card className="bg-[#0A0A7A] border border-[#00C853]/40 rounded-2xl shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#00C853]/10 rounded-full blur-2xl" />
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#00E676]">
                    Total Approved
                  </span>
                  <div className="text-3xl font-black text-white font-display mt-1">
                    ₹{summary.approvedSumInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <p className="text-[10px] text-emerald-200/70 mt-0.5">Credited to player balances</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-[#00C853]/15 border border-[#00C853]/30 flex items-center justify-center text-[#00E676]">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            {/* 3. Rejected Count */}
            <Card className="bg-[#0A0A7A] border border-red-500/40 rounded-2xl shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl" />
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-red-300">
                    Total Rejected
                  </span>
                  <div className="text-3xl font-black text-white font-display mt-1">
                    {summary.rejectedCount}
                  </div>
                  <p className="text-[10px] text-red-200/70 mt-0.5">Fake or unverified UTR claims</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-300">
                  <XCircle className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            {/* 4. Total Requests */}
            <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl" />
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-blue-300">
                    Total Requests
                  </span>
                  <div className="text-3xl font-black text-white font-display mt-1">
                    {deposits.length}
                  </div>
                  <p className="text-[10px] text-white/50 mt-0.5">All-time submitted deposit slips</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-300">
                  <FileText className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Table Container */}
          <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-xl overflow-hidden">
            {/* Search & Filter Bar */}
            <div className="p-4 bg-[#08086B]/70 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative w-full">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <Input
                    placeholder="Search by UTR reference or Deposit ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 bg-[#05054B] border-white/20 text-white placeholder:text-white/40 text-xs rounded-xl h-10"
                  />
                </div>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="text-xs text-white/60 hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {(['all', 'under_review', 'approved', 'rejected'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      statusFilter === st
                        ? 'bg-[#FFFF00] text-[#08088F] shadow-sm font-black'
                        : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
                    }`}
                  >
                    {st === 'all'
                      ? `All (${deposits.length})`
                      : st === 'under_review'
                      ? `Under Review (${summary.pendingCount})`
                      : st === 'approved'
                      ? 'Approved'
                      : 'Rejected'}
                  </button>
                ))}

                <button
                  onClick={() => router.refresh()}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                  title="Refresh Table"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Deposits Table */}
            <CardContent className="p-0">
              {filteredDeposits.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <FileText className="h-10 w-10 text-white/30 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                    No deposit requests match your criteria
                  </h4>
                  <p className="text-xs text-white/50 mt-1">
                    Try adjusting your search terms or status filters.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/10 bg-[#060645]/50 text-white/60 text-[10px] uppercase font-black tracking-wider">
                        <th className="py-3 px-4">Deposit Ref & Date</th>
                        <th className="py-3 px-4">Player Details</th>
                        <th className="py-3 px-4">Amount</th>
                        <th className="py-3 px-4">UTR Reference</th>
                        <th className="py-3 px-4">Proof Receipt</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {filteredDeposits.map((dep) => {
                        const isUnderReview = dep.status === 'under_review';
                        const isApproved = dep.status === 'approved';
                        const isRejected = dep.status === 'rejected';

                        return (
                          <tr
                            key={dep.id}
                            className={`hover:bg-white/[0.03] transition-colors ${
                              isUnderReview ? 'bg-amber-500/[0.03]' : ''
                            }`}
                          >
                            {/* Ref & Date */}
                            <td className="py-3.5 px-4 font-mono">
                              <span className="font-bold text-white block">
                                {dep.depositReference}
                              </span>
                              <span className="text-[10px] text-white/50">
                                {formatDate(dep.createdAt)}
                              </span>
                            </td>

                            {/* Player */}
                            <td className="py-3.5 px-4">
                              <span className="font-bold text-white block">
                                {dep.userName || 'Player'}
                              </span>
                              <span className="text-[10px] text-white/50 font-mono truncate max-w-[140px] block">
                                {dep.userId}
                              </span>
                            </td>

                            {/* Amount */}
                            <td className="py-3.5 px-4">
                              <span className="text-sm font-black text-white font-display block">
                                ₹{dep.amountInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] text-[#00E676] font-bold uppercase">
                                {dep.paymentMethod}
                              </span>
                            </td>

                            {/* UTR */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className="font-bold text-white bg-black/40 px-2 py-0.5 rounded border border-white/10">
                                  {dep.utrReference}
                                </span>
                                <button
                                  onClick={() => handleCopy(dep.utrReference)}
                                  className="p-1 hover:bg-white/10 rounded text-white/60 hover:text-white"
                                  title="Copy UTR"
                                >
                                  {copiedUtr === dep.utrReference ? (
                                    <Check className="h-3 w-3 text-[#00E676]" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </button>
                              </div>
                            </td>

                            {/* Proof Screenshot */}
                            <td className="py-3.5 px-4">
                              {dep.proofSignedUrl ? (
                                <button
                                  onClick={() => setSelectedProofUrl(dep.proofSignedUrl || null)}
                                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#FFFF00] hover:underline bg-white/5 px-2.5 py-1 rounded-lg border border-white/10"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  <span>View Proof</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-white/40 italic">
                                  No proof attached
                                </span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4">
                              {isApproved && (
                                <Badge className="bg-[#00C853]/20 text-[#00E676] border-[#00C853]/40 text-[10px] font-black uppercase">
                                  Approved
                                </Badge>
                              )}
                              {isUnderReview && (
                                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] font-black uppercase animate-pulse">
                                  Under Review
                                </Badge>
                              )}
                              {isRejected && (
                                <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[10px] font-black uppercase">
                                  Rejected
                                </Badge>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right">
                              {isUnderReview ? (
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    onClick={() => {
                                      setApprovingDeposit(dep);
                                      setAdminNotes('');
                                      setActionError(null);
                                    }}
                                    size="sm"
                                    className="bg-[#00C853] hover:bg-[#00B048] text-black font-black text-xs uppercase tracking-wider rounded-xl h-8 px-3 gap-1 shadow-sm cursor-pointer"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    <span>Approve</span>
                                  </Button>

                                  <Button
                                    onClick={() => {
                                      setRejectingDeposit(dep);
                                      setRejectionReason('');
                                      setActionError(null);
                                    }}
                                    size="sm"
                                    variant="outline"
                                    className="border-red-500/40 text-red-300 hover:bg-red-500/20 font-black text-xs uppercase tracking-wider rounded-xl h-8 px-3 gap-1 cursor-pointer"
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                    <span>Reject</span>
                                  </Button>
                                </div>
                              ) : isApproved ? (
                                <span className="text-[11px] text-[#00E676] font-medium">
                                  Credited {dep.approvedAt ? formatDate(dep.approvedAt) : ''}
                                </span>
                              ) : (
                                <span
                                  className="text-[11px] text-red-300 truncate max-w-[120px] inline-block font-medium"
                                  title={dep.rejectionReason || 'Rejected'}
                                >
                                  {dep.rejectionReason || 'Rejected'}
                                </span>
                              )}
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
        </div>
      )}

      {/* TAB 2: PAYMENT & QR SETTINGS */}
      {activeTab === 'settings' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-xl overflow-hidden">
            <CardHeader className="p-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#FFFF00]/15 border border-[#FFFF00]/30 flex items-center justify-center text-[#FFFF00]">
                  <QrCode className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg font-black text-white font-display uppercase tracking-wide">
                    Platform UPI & QR Code Configuration
                  </CardTitle>
                  <p className="text-xs text-white/60">
                    These payment parameters are displayed to players when depositing funds through the Add Money modal.
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {settingsSuccess && (
                <div className="mb-6 p-4 rounded-xl bg-[#00C853]/15 border border-[#00C853]/40 text-[#00E676] text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{settingsSuccess}</span>
                </div>
              )}

              {settingsError && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <span>{settingsError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Col: QR Code Preview & Upload */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <QrCode className="h-4 w-4 text-[#FFFF00]" />
                    Merchant QR Code Asset
                  </h4>

                  <div className="p-5 rounded-2xl bg-[#060645] border border-white/15 text-center flex flex-col items-center justify-center">
                    {settings.upiQrImageUrl ? (
                      <div className="relative w-48 h-48 bg-white rounded-xl p-2 shadow-inner">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={settings.upiQrImageUrl}
                          alt="Merchant UPI QR"
                          className="w-full h-full object-contain rounded-lg"
                        />
                      </div>
                    ) : (
                      <div className="w-48 h-48 rounded-xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-white/40 p-4">
                        <QrCode className="h-10 w-10 mb-2 opacity-50" />
                        <span className="text-xs font-medium">No QR Image Uploaded</span>
                        <span className="text-[10px] text-white/30 mt-1">
                          SVG fallback QR is auto-generated
                        </span>
                      </div>
                    )}

                    <div className="mt-4 w-full">
                      <label className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider cursor-pointer transition-all border border-white/20">
                        {isUploadingQr ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin text-[#FFFF00]" />
                            <span>Uploading to CDN...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 text-[#FFFF00]" />
                            <span>Upload New QR Image</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          onChange={handleQrUpload}
                          disabled={isUploadingQr}
                          className="hidden"
                        />
                      </label>
                      <p className="text-[10px] text-white/40 mt-1.5 text-center">
                        PNG, JPG, WEBP, or SVG up to 5MB. Publicly hosted on CDN.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Col: Parameters Form */}
                <form onSubmit={handleSaveSettings} className="lg:col-span-2 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* UPI ID */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/80 uppercase tracking-wider">
                        Official Merchant UPI ID *
                      </label>
                      <Input
                        value={settings.upiId}
                        onChange={(e) => setSettings({ ...settings, upiId: e.target.value })}
                        placeholder="e.g. efootball.arena@upi"
                        required
                        className="bg-[#05054B] border-white/20 text-white font-mono text-xs rounded-xl h-11"
                      />
                      <span className="text-[10px] text-white/40 block">
                        Used for one-click copy and dynamic QR generation.
                      </span>
                    </div>

                    {/* Merchant Phone */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/80 uppercase tracking-wider">
                        Merchant Phone / GPay Number *
                      </label>
                      <Input
                        value={settings.upiPhoneNumber}
                        onChange={(e) => setSettings({ ...settings, upiPhoneNumber: e.target.value })}
                        placeholder="e.g. +91 98765 43210"
                        required
                        className="bg-[#05054B] border-white/20 text-white font-mono text-xs rounded-xl h-11"
                      />
                      <span className="text-[10px] text-white/40 block">
                        Displayed for direct phone number UPI transfers.
                      </span>
                    </div>

                    {/* Account Holder Name */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/80 uppercase tracking-wider">
                        Account / Business Name *
                      </label>
                      <Input
                        value={settings.accountHolderName}
                        onChange={(e) =>
                          setSettings({ ...settings, accountHolderName: e.target.value })
                        }
                        placeholder="e.g. eFootball Arena Sports"
                        required
                        className="bg-[#05054B] border-white/20 text-white text-xs rounded-xl h-11"
                      />
                    </div>

                    {/* Min & Max Deposit in INR */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-white/80 uppercase tracking-wider">
                          Min Deposit (₹)
                        </label>
                        <Input
                          type="number"
                          min={10}
                          max={1000}
                          value={settings.minDepositInr}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              minDepositInr: Number(e.target.value),
                            })
                          }
                          required
                          className="bg-[#05054B] border-white/20 text-white font-mono text-xs rounded-xl h-11"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-white/80 uppercase tracking-wider">
                          Max Deposit (₹)
                        </label>
                        <Input
                          type="number"
                          min={100}
                          max={50000}
                          value={settings.maxDepositInr}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              maxDepositInr: Number(e.target.value),
                            })
                          }
                          required
                          className="bg-[#05054B] border-white/20 text-white font-mono text-xs rounded-xl h-11"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Payment Instructions */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-white/80 uppercase tracking-wider">
                      Player Deposit Instructions
                    </label>
                    <textarea
                      rows={4}
                      value={settings.instructions}
                      onChange={(e) => setSettings({ ...settings, instructions: e.target.value })}
                      placeholder="Step-by-step instructions shown to players..."
                      className="w-full p-3 rounded-xl bg-[#05054B] border border-white/20 text-white text-xs focus:outline-none focus:border-[#FFFF00]"
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="pt-3 flex justify-end">
                    <Button
                      type="submit"
                      disabled={isPending}
                      className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-xl h-11 px-6 shadow-md transition-all active:scale-95 cursor-pointer"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Saving Changes...</span>
                        </>
                      ) : (
                        <span>Save Payment Parameters</span>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* MODAL 1: APPROVE DEPOSIT CONFIRMATION */}
      {approvingDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative max-w-md w-full bg-[#0A0A7A] border-2 border-[#00C853]/50 rounded-2xl p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-[#00C853]/20 border border-[#00C853]/40 flex items-center justify-center text-[#00E676]">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <h3 className="text-base font-black uppercase tracking-wider font-display">
                  Approve Deposit & Credit Wallet
                </h3>
              </div>
              <button
                onClick={() => setApprovingDeposit(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-white/80">
              Confirm that you have verified credit of this payment in your merchant bank statement:
            </p>

            <div className="p-4 rounded-xl bg-[#060645] border border-white/10 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-white/50">Deposit Ref:</span>
                <span className="font-mono font-bold">{approvingDeposit.depositReference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Player Name:</span>
                <span className="font-bold">{approvingDeposit.userName || 'Player'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">UTR Reference:</span>
                <span className="font-mono font-bold text-[#FFFF00]">
                  {approvingDeposit.utrReference}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-white/10">
                <span className="text-white/70 font-bold uppercase text-[10px]">
                  Amount to Credit:
                </span>
                <span className="text-xl font-black text-[#00E676] font-display">
                  ₹{approvingDeposit.amountInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-white/70 uppercase tracking-wider">
                Internal Admin Notes (Optional)
              </label>
              <Input
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="e.g. Verified in HDFC bank statement ending 4012"
                className="bg-[#05054B] border-white/20 text-white text-xs rounded-xl h-10"
              />
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setApprovingDeposit(null)}
                disabled={isPending}
                className="border-white/20 text-white text-xs font-bold rounded-xl h-10 px-4"
              >
                Cancel
              </Button>

              <Button
                size="sm"
                onClick={handleConfirmApproval}
                disabled={isPending}
                className="bg-[#00C853] hover:bg-[#00B048] text-black font-black text-xs uppercase tracking-wider rounded-xl h-10 px-5 gap-1.5 shadow-lg"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processing Credit...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>Confirm & Credit Balance</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: REJECT DEPOSIT WITH MANDATORY REASON */}
      {rejectingDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative max-w-md w-full bg-[#0A0A7A] border-2 border-red-500/50 rounded-2xl p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-300">
                  <XCircle className="h-5 w-5" />
                </div>
                <h3 className="text-base font-black uppercase tracking-wider font-display">
                  Reject Deposit Claim
                </h3>
              </div>
              <button
                onClick={() => setRejectingDeposit(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-white/80">
              The player will be immediately notified in-app with your explanation. Balance will remain unchanged.
            </p>

            <div className="p-3 rounded-xl bg-[#060645] border border-white/10 text-xs flex justify-between items-center">
              <div>
                <span className="text-white/50 block text-[10px]">UTR Claim:</span>
                <span className="font-mono font-bold text-white">
                  {rejectingDeposit.utrReference}
                </span>
              </div>
              <div className="text-right">
                <span className="text-white/50 block text-[10px]">Claimed Amount:</span>
                <span className="font-black text-white font-display">
                  ₹{rejectingDeposit.amountInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-white/80 uppercase tracking-wider">
                Reason for Rejection * (Visible to Player)
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. UTR not found in bank statement; amount mismatch; blurry screenshot"
                required
                className="w-full p-3 rounded-xl bg-[#05054B] border border-white/20 text-white text-xs focus:outline-none focus:border-red-400"
              />
              <span className="text-[10px] text-white/40">
                Minimum 3 characters required.
              </span>
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRejectingDeposit(null)}
                disabled={isPending}
                className="border-white/20 text-white text-xs font-bold rounded-xl h-10 px-4"
              >
                Cancel
              </Button>

              <Button
                size="sm"
                onClick={handleConfirmRejection}
                disabled={isPending || !rejectionReason.trim()}
                className="bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider rounded-xl h-10 px-5 gap-1.5 shadow-lg"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Rejecting...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    <span>Confirm Rejection</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PRIVATE SCREENSHOT LIGHTBOX */}
      {selectedProofUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="relative max-w-lg w-full bg-[#0A0A7A] border border-white/20 rounded-2xl p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#FFFF00]" />
                Private Payment Screenshot
              </h4>
              <button
                onClick={() => setSelectedProofUrl(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-center bg-black/40 rounded-xl overflow-hidden max-h-[70vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedProofUrl}
                alt="Payment proof screenshot"
                className="max-h-[65vh] w-auto object-contain rounded-lg"
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-white/60">
              <span>Encrypted tokenized preview</span>
              <a
                href={selectedProofUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[#FFFF00] hover:underline"
              >
                <span>Open Original Image</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
