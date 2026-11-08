'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  Phone,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  CreditCard,
  User,
  Users,
  Eye,
  Check,
  X,
  FileCheck,
  Building,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  getTournamentPaymentRequestsAction,
  adminApproveRegistrationAction,
  adminRejectRegistrationAction,
  adminSetUnderVerificationAction,
  PaymentRequestItem,
  PaymentRequestSummary,
} from '@/app/actions/paymentRegistrationActions';
import { getTournamentById, TournamentWithStats } from '@/services/tournamentService';
import { generateAdminContactPlayerLink } from '@/lib/whatsappPayment';
import { formatDate } from '@/lib/utils';

const STATUS_FILTERS = [
  { label: 'All Requests', value: 'all' },
  { label: 'Pending Payment', value: 'pending_payment' },
  { label: 'Submitted Proof', value: 'payment_submitted' },
  { label: 'Under Review', value: 'under_verification' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Cancelled', value: 'cancelled' },
];

export default function TournamentPaymentsAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  const [tournament, setTournament] = useState<TournamentWithStats | null>(null);
  const [requests, setRequests] = useState<PaymentRequestItem[]>([]);
  const [summary, setSummary] = useState<PaymentRequestSummary>({
    total: 0,
    pending_payment: 0,
    payment_submitted: 0,
    under_verification: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    slots_remaining: 0,
    max_participants: 0,
    current_participants: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Selected Request for Details Modal
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequestItem | null>(null);

  // Action Modals & State
  const [actionLoading, setActionLoading] = useState(false);
  const [approveModalItem, setApproveModalItem] = useState<PaymentRequestItem | null>(null);
  const [verifiedAmountINR, setVerifiedAmountINR] = useState<string>('');
  const [approvalNote, setApprovalNote] = useState<string>('');

  const [rejectModalItem, setRejectModalItem] = useState<PaymentRequestItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tData, reqsData] = await Promise.all([
        getTournamentById(tournamentId),
        getTournamentPaymentRequestsAction(tournamentId, {
          status: statusFilter,
          search,
          page,
          pageSize: 25,
        }),
      ]);

      setTournament(tData);

      if (reqsData.success) {
        setRequests(reqsData.requests);
        setSummary(reqsData.summary);
        setTotalCount(reqsData.totalCount);
      } else {
        setError(reqsData.message || 'Failed to load payment requests.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error loading data.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, statusFilter, search, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Mark Under Verification
  const handleMarkUnderVerification = async (req: PaymentRequestItem) => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await adminSetUnderVerificationAction(req.id);
      if (res.success) {
        setFeedback({ type: 'success', message: `Marked registration ${req.id.slice(0, 8)} as Under Verification.` });
        if (selectedRequest?.id === req.id) {
          setSelectedRequest({ ...selectedRequest, status: 'under_verification' });
        }
        await fetchData();
      } else {
        setFeedback({ type: 'error', message: res.message || 'Failed to update status.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Error marking registration under verification.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Approve Registration
  const handleApprove = async () => {
    if (!approveModalItem) return;

    setActionLoading(true);
    setFeedback(null);

    const paise = verifiedAmountINR ? Math.round(parseFloat(verifiedAmountINR) * 100) : approveModalItem.amount_paise;

    try {
      const res = await adminApproveRegistrationAction(approveModalItem.id, paise, approvalNote);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: `Approved registration for ${approveModalItem.profile?.display_name || 'Player'}! Participant slot confirmed.`,
        });
        setApproveModalItem(null);
        setSelectedRequest(null);
        await fetchData();
      } else {
        setFeedback({ type: 'error', message: res.message || 'Failed to approve registration.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Unexpected error approving registration.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reject Registration
  const handleReject = async () => {
    if (!rejectModalItem) return;
    if (!rejectionReason.trim()) {
      setFeedback({ type: 'error', message: 'A rejection reason is required.' });
      return;
    }

    setActionLoading(true);
    setFeedback(null);

    try {
      const res = await adminRejectRegistrationAction(rejectModalItem.id, rejectionReason);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: `Rejected registration for ${rejectModalItem.profile?.display_name || 'Player'}.`,
        });
        setRejectModalItem(null);
        setSelectedRequest(null);
        await fetchData();
      } else {
        setFeedback({ type: 'error', message: res.message || 'Failed to reject registration.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Unexpected error rejecting registration.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 text-[#0A0D14]">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="rounded-full h-8 px-2.5">
            <Link href={`/admin/tournaments/${tournamentId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                Tournament Payments Desk
              </span>
              {tournament?.is_paid ? (
                <Badge className="bg-[#FFFF00] text-[#08088F] font-black text-[9px] uppercase px-2 py-0.5 rounded-full border-0">
                  PAID TOURNAMENT
                </Badge>
              ) : (
                <Badge className="bg-emerald-100 text-emerald-800 font-bold text-[9px] uppercase px-2 py-0.5 rounded-full border-0">
                  FREE TOURNAMENT
                </Badge>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#0B3323] tracking-tight font-display">
              {tournament?.name || 'Tournament'} — Payment Requests
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-full text-xs font-bold gap-1.5 h-8 border-border"
          >
            <Link href={`/admin/tournaments/${tournamentId}/participants`}>
              <Users className="h-3.5 w-3.5" />
              <span>Participants ({summary.current_participants})</span>
            </Link>
          </Button>

          <Button
            size="sm"
            onClick={fetchData}
            variant="outline"
            className="rounded-full text-xs font-bold gap-1.5 h-8 border-border"
            disabled={loading}
          >
            <RotateCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-rose-50 text-rose-900 border-rose-300'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="underline ml-4 hover:no-underline font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Metric Cards Overview Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="p-3.5 bg-white border-border shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Total Requests</span>
          <span className="text-xl font-black text-[#0B3323] block">{summary.total}</span>
        </Card>

        <Card className="p-3.5 bg-amber-50 border-amber-200 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-amber-800 block">Pending Payment</span>
          <span className="text-xl font-black text-amber-900 block">{summary.pending_payment}</span>
        </Card>

        <Card className="p-3.5 bg-sky-50 border-sky-200 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-sky-800 block">Submitted Proof</span>
          <span className="text-xl font-black text-sky-900 block">{summary.payment_submitted}</span>
        </Card>

        <Card className="p-3.5 bg-indigo-50 border-indigo-200 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-indigo-800 block">Under Review</span>
          <span className="text-xl font-black text-indigo-900 block">{summary.under_verification}</span>
        </Card>

        <Card className="p-3.5 bg-emerald-50 border-emerald-200 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-emerald-800 block">Approved</span>
          <span className="text-xl font-black text-emerald-900 block">{summary.approved}</span>
        </Card>

        <Card className="p-3.5 bg-rose-50 border-rose-200 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-rose-800 block">Rejected</span>
          <span className="text-xl font-black text-rose-900 block">{summary.rejected}</span>
        </Card>

        <Card className="p-3.5 bg-slate-50 border-slate-200 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-700 block">Slots Left</span>
          <span className="text-xl font-black text-slate-900 block">
            {summary.slots_remaining} / {summary.max_participants}
          </span>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 bg-white border-border shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by player, eFootball ID, WhatsApp, Ref, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs rounded-xl"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={statusFilter === f.value ? 'default' : 'outline'}
                onClick={() => setStatusFilter(f.value)}
                className={`text-xs h-8 rounded-full px-3 shrink-0 font-bold ${
                  statusFilter === f.value ? 'bg-primary text-white' : 'border-border'
                }`}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {/* Requests Table */}
      <Card className="bg-white border-border shadow-xs overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F8FAFC] border-b border-border text-[11px] font-black uppercase text-muted-foreground tracking-wider">
              <tr>
                <th className="py-3 px-4">Player Details</th>
                <th className="py-3 px-4">eFootball ID</th>
                <th className="py-3 px-4">WhatsApp Contact</th>
                <th className="py-3 px-4">Entry Fee</th>
                <th className="py-3 px-4">Payment Ref</th>
                <th className="py-3 px-4">Created / Submitted</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                    <span>Loading payment requests...</span>
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <CreditCard className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                    <p className="font-bold">No payment requests found.</p>
                    <p className="text-[11px] mt-0.5">
                      {statusFilter !== 'all' || search ? 'Try resetting filters or search.' : 'Registrations will appear here once submitted.'}
                    </p>
                  </td>
                </tr>
              ) : (
                requests.map((req) => {
                  const p = req.profile;
                  const feeINR = Math.round((req.amount_paise || 0) / 100);
                  const isVerifiedWA = p?.whatsapp_verified;

                  const waChatUrl = p?.whatsapp_number
                    ? generateAdminContactPlayerLink({
                        playerPhone: p.whatsapp_number,
                        tournamentName: tournament?.name || 'Tournament',
                        registrationId: req.id,
                        playerName: p.display_name || 'Player',
                      })
                    : null;

                  return (
                    <tr key={req.id} className="hover:bg-muted/40 transition-colors">
                      {/* Player info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-[#08088F] text-white flex items-center justify-center font-bold text-xs uppercase shrink-0">
                            {p?.display_name?.slice(0, 1) || 'P'}
                          </div>
                          <div>
                            <span className="font-bold text-[#0B3323] block">
                              {p?.display_name || 'Unknown Player'}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono block">
                              ID: {req.id.slice(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* eFootball ID */}
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-[#0B3323] bg-muted px-2 py-0.5 rounded text-[11px]">
                          {p?.efootball_id || 'Not Set'}
                        </span>
                      </td>

                      {/* WhatsApp contact */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-800">
                            {p?.whatsapp_number || 'N/A'}
                          </span>
                          {isVerifiedWA ? (
                            <span title="WhatsApp Verified" className="inline-flex">
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            </span>
                          ) : (
                            <span title="Unverified WhatsApp" className="inline-flex">
                              <ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            </span>
                          )}
                          {waChatUrl && (
                            <a
                              href={waChatUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-1 text-emerald-600 hover:text-emerald-700"
                              title="Chat on WhatsApp"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Entry Fee */}
                      <td className="py-3 px-4">
                        <span className="font-extrabold text-[#0B3323]">₹{feeINR} INR</span>
                      </td>

                      {/* Payment Ref / Mode */}
                      <td className="py-3 px-4">
                        {req.payment_reference ? (
                          <span className="font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                            {req.payment_reference}
                          </span>
                        ) : (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-bold">
                            WhatsApp Chat
                          </span>
                        )}
                      </td>

                      {/* Timeline */}
                      <td className="py-3 px-4 text-[11px] text-muted-foreground">
                        <div>Created: {formatDate(req.created_at)}</div>
                        {req.submitted_at && (
                          <div className="text-emerald-700 font-medium">Submitted: {formatDate(req.submitted_at)}</div>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4">
                        {req.status === 'pending_payment' && (
                          <Badge className="bg-amber-100 text-amber-800 font-bold text-[10px] uppercase border-amber-300">
                            Pending Payment
                          </Badge>
                        )}
                        {req.status === 'payment_submitted' && (
                          <Badge className="bg-sky-100 text-sky-800 font-bold text-[10px] uppercase border-sky-300">
                            Proof Submitted
                          </Badge>
                        )}
                        {req.status === 'under_verification' && (
                          <Badge className="bg-indigo-100 text-indigo-800 font-bold text-[10px] uppercase border-indigo-300">
                            Under Review
                          </Badge>
                        )}
                        {(req.status === 'approved' || req.status === 'confirmed') && (
                          <Badge className="bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase border-emerald-300">
                            Approved
                          </Badge>
                        )}
                        {req.status === 'rejected' && (
                          <Badge className="bg-rose-100 text-rose-800 font-bold text-[10px] uppercase border-rose-300">
                            Rejected
                          </Badge>
                        )}
                        {req.status === 'cancelled' && (
                          <Badge className="bg-slate-100 text-slate-700 font-bold text-[10px] uppercase border-slate-300">
                            Cancelled
                          </Badge>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedRequest(req)}
                            className="h-7 text-xs font-bold px-2 rounded-lg gap-1 border-border"
                          >
                            <Eye className="h-3 w-3" />
                            <span>Details</span>
                          </Button>

                          {req.status !== 'approved' && req.status !== 'confirmed' && req.status !== 'cancelled' && (
                            <>
                              {req.status !== 'under_verification' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleMarkUnderVerification(req)}
                                  disabled={actionLoading}
                                  className="h-7 text-xs font-bold px-2 rounded-lg text-indigo-700 hover:bg-indigo-50 border-indigo-200"
                                  title="Mark as Under Verification"
                                >
                                  Reviewing
                                </Button>
                              )}

                              <Button
                                size="sm"
                                onClick={() => {
                                  setApproveModalItem(req);
                                  setVerifiedAmountINR(String(Math.round((req.amount_paise || 0) / 100)));
                                  setApprovalNote('');
                                }}
                                disabled={actionLoading || summary.slots_remaining <= 0}
                                className="h-7 text-xs font-bold px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                              >
                                <Check className="h-3 w-3" />
                                <span>Approve</span>
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setRejectModalItem(req);
                                  setRejectionReason('');
                                }}
                                disabled={actionLoading}
                                className="h-7 text-xs font-bold px-2 rounded-lg text-rose-700 hover:bg-rose-50 border-rose-200"
                              >
                                <X className="h-3 w-3" />
                                <span>Reject</span>
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Details View Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-xl w-full shadow-2xl space-y-5 border border-slate-200 text-[#0A0D14] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                  Registration Request Details
                </span>
                <h3 className="text-lg font-black text-[#0B3323] font-display">
                  {selectedRequest.profile?.display_name || 'Player'}
                </h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedRequest(null)}
                className="h-8 w-8 p-0 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Profile & Contact Details */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <span className="text-[10px] font-black uppercase text-muted-foreground block">Player Profile</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Full / Display Name:</span>
                  <strong className="text-[#0B3323]">{selectedRequest.profile?.display_name || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">eFootball ID:</span>
                  <strong className="font-mono text-[#0B3323]">{selectedRequest.profile?.efootball_id || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">WhatsApp:</span>
                  <div className="flex items-center gap-1.5 font-bold text-[#0B3323]">
                    <span>{selectedRequest.profile?.whatsapp_number || 'N/A'}</span>
                    {selectedRequest.profile?.whatsapp_verified ? (
                      <span className="text-[9px] text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded font-bold">Verified</span>
                    ) : (
                      <span className="text-[9px] text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded font-bold">Unverified</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Account Status:</span>
                  <strong className="capitalize text-[#0B3323]">
                    {selectedRequest.profile?.account_status || 'Active'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Transaction / Reference Box */}
            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 text-xs space-y-2">
              <span className="text-[10px] font-black uppercase text-emerald-900 block">Payment Info</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Entry Fee:</span>
                  <strong className="text-emerald-900 font-black text-sm">
                    ₹{Math.round((selectedRequest.amount_paise || 0) / 100)} INR
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Payment Verification Mode:</span>
                  <strong className="font-mono text-emerald-950 font-bold select-all">
                    {selectedRequest.payment_reference || 'WhatsApp Chat Verification'}
                  </strong>
                </div>
              </div>
              {selectedRequest.notes && (
                <div className="pt-1 text-[11px] text-slate-700">
                  <span className="font-bold">Player note:</span> {selectedRequest.notes}
                </div>
              )}
            </div>

            {/* Registration Timeline */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <span className="text-[10px] font-black uppercase text-muted-foreground block">Timeline</span>
              <div className="space-y-1 text-[11px] text-slate-700">
                <div>Created: <span className="font-semibold">{formatDate(selectedRequest.created_at)}</span></div>
                {selectedRequest.submitted_at && (
                  <div>Submitted: <span className="font-semibold">{formatDate(selectedRequest.submitted_at)}</span></div>
                )}
                {selectedRequest.verified_at && (
                  <div>Verified: <span className="font-semibold">{formatDate(selectedRequest.verified_at)}</span></div>
                )}
                {selectedRequest.rejection_reason && (
                  <div className="text-rose-700">Rejection reason: <span className="font-bold">{selectedRequest.rejection_reason}</span></div>
                )}
              </div>
            </div>

            {/* Direct WhatsApp Contact button */}
            {selectedRequest.profile?.whatsapp_number && (
              <Button asChild className="w-full bg-[#00C853] hover:bg-[#00B048] text-[#072418] font-black rounded-xl h-10 text-xs gap-2 shadow-sm">
                <a
                  href={generateAdminContactPlayerLink({
                    playerPhone: selectedRequest.profile.whatsapp_number,
                    tournamentName: tournament?.name || 'Tournament',
                    registrationId: selectedRequest.id,
                    playerName: selectedRequest.profile.display_name || 'Player',
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>Chat with Player on WhatsApp</span>
                </a>
              </Button>
            )}

            {/* Modal Actions */}
            {selectedRequest.status !== 'approved' && selectedRequest.status !== 'confirmed' && selectedRequest.status !== 'cancelled' && (
              <div className="flex items-center gap-2 pt-2 border-t">
                {selectedRequest.status !== 'under_verification' && (
                  <Button
                    variant="outline"
                    onClick={() => handleMarkUnderVerification(selectedRequest)}
                    disabled={actionLoading}
                    className="flex-1 text-xs font-bold h-10 rounded-xl"
                  >
                    Mark Under Review
                  </Button>
                )}
                <Button
                  onClick={() => {
                    setApproveModalItem(selectedRequest);
                    setVerifiedAmountINR(String(Math.round((selectedRequest.amount_paise || 0) / 100)));
                    setApprovalNote('');
                  }}
                  disabled={actionLoading || summary.slots_remaining <= 0}
                  className="flex-1 text-xs font-black h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Approve Registration
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRejectModalItem(selectedRequest);
                    setRejectionReason('');
                  }}
                  disabled={actionLoading}
                  className="text-xs font-bold h-10 rounded-xl text-rose-700 border-rose-300"
                >
                  Reject
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approve Confirmation Modal */}
      {approveModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 border border-slate-200 text-[#0A0D14]">
            <div className="space-y-1">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <Check className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-black text-[#0B3323] font-display uppercase tracking-tight">
                Approve Payment & Confirm Slot
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Approving this registration will atomically add <strong className="text-black">{approveModalItem.profile?.display_name || 'Player'}</strong> ({approveModalItem.profile?.efootball_id || 'ID'}) into confirmed tournament participants.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Verified Amount (INR ₹)
                </label>
                <Input
                  type="number"
                  value={verifiedAmountINR}
                  onChange={(e) => setVerifiedAmountINR(e.target.value)}
                  className="h-10 rounded-xl font-bold text-sm"
                  placeholder="e.g. 50"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Admin Verification Note (Optional)
                </label>
                <Input
                  type="text"
                  value={approvalNote}
                  onChange={(e) => setApprovalNote(e.target.value)}
                  className="h-10 rounded-xl text-xs"
                  placeholder="e.g. Verified via WhatsApp screenshot & UPI statement"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setApproveModalItem(null)}
                disabled={actionLoading}
                className="flex-1 rounded-xl text-xs font-bold h-10 border-slate-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleApprove}
                disabled={actionLoading}
                className="flex-1 rounded-xl text-xs font-black h-10 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Approval'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {rejectModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 border border-slate-200 text-[#0A0D14]">
            <div className="space-y-1">
              <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                <X className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-black text-rose-900 font-display uppercase tracking-tight">
                Reject Payment Registration
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Rejecting will mark the request as rejected and notify the user with the reason provided. Participant slot will not be assigned.
              </p>
            </div>

            <div className="space-y-1 text-xs">
              <label className="font-bold text-slate-700 block mb-1">
                Rejection Reason <span className="text-rose-500">*</span>
              </label>
              <Input
                type="text"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="h-10 rounded-xl text-xs"
                placeholder="e.g. Payment not received, Invalid transaction ID, Incorrect amount"
                required
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setRejectModalItem(null)}
                disabled={actionLoading}
                className="flex-1 rounded-xl text-xs font-bold h-10 border-slate-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleReject}
                disabled={actionLoading || !rejectionReason.trim()}
                className="flex-1 rounded-xl text-xs font-black h-10 bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Rejection'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
