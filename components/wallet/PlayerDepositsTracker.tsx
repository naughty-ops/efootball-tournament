'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Copy,
  Check,
  Eye,
  PlusCircle,
  ArrowUpRight,
  ShieldCheck,
  FileText,
  X,
  ExternalLink,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WalletDepositRecord, WalletDepositStatus } from '@/types/wallet';
import { formatDate } from '@/lib/utils';

interface PlayerDepositsTrackerProps {
  deposits: WalletDepositRecord[];
  onAddMoneyClick?: () => void;
  isLoading?: boolean;
}

export default function PlayerDepositsTracker({
  deposits = [],
  onAddMoneyClick,
  isLoading = false,
}: PlayerDepositsTrackerProps) {
  const [copiedUtr, setCopiedUtr] = useState<string | null>(null);
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | WalletDepositStatus>('all');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCopyUtr = (utr: string) => {
    navigator.clipboard.writeText(utr);
    setCopiedUtr(utr);
    setTimeout(() => setCopiedUtr(null), 2000);
  };

  const filteredDeposits = deposits.filter((d) => {
    if (filterStatus === 'all') return true;
    return d.status === filterStatus;
  });

  const underReviewCount = deposits.filter((d) => d.status === 'under_review').length;
  const approvedCount = deposits.filter((d) => d.status === 'approved').length;
  const rejectedCount = deposits.filter((d) => d.status === 'rejected').length;
  const totalApprovedInr = deposits
    .filter((d) => d.status === 'approved')
    .reduce((sum, d) => sum + d.amountInr, 0);

  const getStatusBadge = (status: WalletDepositStatus) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-[#00C853]/20 text-[#00E676] border-[#00C853]/40 text-[9px] sm:text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0">
            <CheckCircle2 className="h-3 w-3" />
            <span>APPROVED & CREDITED</span>
          </Badge>
        );
      case 'under_review':
        return (
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[9px] sm:text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 animate-pulse">
            <Clock className="h-3 w-3" />
            <span>UNDER REVIEW</span>
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[9px] sm:text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0">
            <XCircle className="h-3 w-3" />
            <span>REJECTED</span>
          </Badge>
        );
      default:
        return (
          <Badge className="bg-white/10 text-white/70 border-white/20 text-[9px] sm:text-[10px] font-black uppercase tracking-wider shrink-0">
            {status}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-xl overflow-hidden">
        <CardHeader className="p-4 sm:p-5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#FFFF00]/15 border border-[#FFFF00]/30 flex items-center justify-center text-[#FFFF00] shrink-0">
              <ArrowUpRight className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-black text-white font-display uppercase tracking-wide flex items-center gap-2 flex-wrap">
                <span>Deposit Requests</span>
                {underReviewCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold">
                    {underReviewCount} Under Review
                  </span>
                )}
              </CardTitle>
              <p className="text-xs text-white/60">
                Track your manual UPI deposit submissions, verification progress, and ledger credits.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onAddMoneyClick && (
              <Button
                onClick={onAddMoneyClick}
                size="sm"
                className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-xl h-9 px-4 gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Add Money</span>
              </Button>
            )}
          </div>
        </CardHeader>

        {/* Filter Pills */}
        <div className="px-4 py-3 bg-[#08086B]/60 border-b border-white/10 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider mr-1">
              Filter:
            </span>
            {(['all', 'under_review', 'approved', 'rejected'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterStatus === st
                    ? 'bg-[#FFFF00] text-[#08088F] shadow-sm font-black'
                    : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
                }`}
              >
                {st === 'all'
                  ? `All (${deposits.length})`
                  : st === 'under_review'
                  ? `Review (${underReviewCount})`
                  : st === 'approved'
                  ? `Approved (${approvedCount})`
                  : `Rejected (${rejectedCount})`}
              </button>
            ))}
          </div>

          <div className="text-[11px] text-white/60 font-medium">
            Total Approved:{' '}
            <span className="font-bold text-[#00E676]">
              ₹{totalApprovedInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <CardContent className="p-4 sm:p-5">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-xl border border-white/10 bg-white/5 animate-pulse space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="h-4 w-32 bg-white/10 rounded" />
                    <div className="h-4 w-20 bg-white/10 rounded" />
                  </div>
                  <div className="h-6 w-24 bg-white/10 rounded" />
                  <div className="h-4 w-48 bg-white/10 rounded" />
                </div>
              ))}
            </div>
          ) : filteredDeposits.length === 0 ? (
            <div className="text-center py-10 px-4 rounded-xl border border-dashed border-white/15 bg-white/[0.02]">
              <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 mx-auto flex items-center justify-center text-white/40 mb-3">
                <FileText className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-black text-white uppercase tracking-wider">
                {filterStatus === 'all'
                  ? 'No deposit requests submitted yet'
                  : `No ${filterStatus.replace('_', ' ')} deposit requests`}
              </h4>
              <p className="text-xs text-white/60 mt-1 max-w-sm mx-auto leading-relaxed">
                Scan the admin QR code, transfer funds using any UPI app (GPay, PhonePe, Paytm), and submit your 12-digit UTR with screenshot to add money.
              </p>
              {onAddMoneyClick && filterStatus === 'all' && (
                <Button
                  onClick={onAddMoneyClick}
                  size="sm"
                  className="mt-4 bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-xl h-9 px-5 gap-1.5 shadow-md cursor-pointer"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>Make First Deposit</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDeposits.map((deposit) => {
                const isUnderReview = deposit.status === 'under_review';
                const isApproved = deposit.status === 'approved';
                const isRejected = deposit.status === 'rejected';

                return (
                  <div
                    key={deposit.id}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                      isUnderReview
                        ? 'bg-amber-500/[0.04] border-amber-500/30 hover:border-amber-500/50'
                        : isApproved
                        ? 'bg-[#00C853]/[0.04] border-[#00C853]/30 hover:border-[#00C853]/50'
                        : isRejected
                        ? 'bg-red-500/[0.04] border-red-500/30 hover:border-red-500/50'
                        : 'bg-white/[0.02] border-white/10'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Left: Ref, Status, Amount */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`h-10 w-10 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${
                            isApproved
                              ? 'bg-[#00C853]/15 border-[#00C853]/30 text-[#00E676]'
                              : isUnderReview
                              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                              : 'bg-red-500/15 border-red-500/30 text-red-300'
                          }`}
                        >
                          <ArrowUpRight className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-white tracking-wide">
                              {deposit.depositReference}
                            </span>
                            {getStatusBadge(deposit.status)}
                          </div>

                          <div className="text-xl sm:text-2xl font-black text-white font-display mt-0.5">
                            ₹{deposit.amountInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>

                          <p className="text-[11px] text-white/50 mt-0.5">
                            Submitted on {formatDate(deposit.createdAt)}
                          </p>
                        </div>
                      </div>

                      {/* Right: UTR, Screenshot, Meta */}
                      <div className="flex flex-row sm:flex-col sm:items-end justify-between sm:justify-center items-center gap-2 text-xs border-t sm:border-t-0 pt-2 sm:pt-0 border-white/10">
                        {/* UTR Copy Badge */}
                        <div className="flex items-center gap-1.5 bg-black/30 border border-white/10 px-2.5 py-1 rounded-lg">
                          <span className="text-[10px] font-black uppercase tracking-wider text-white/50">
                            UTR:
                          </span>
                          <span className="font-mono font-bold text-white text-xs truncate max-w-[120px] sm:max-w-none">
                            {deposit.utrReference}
                          </span>
                          <button
                            onClick={() => handleCopyUtr(deposit.utrReference)}
                            className="p-1 hover:bg-white/10 rounded transition-colors text-white/60 hover:text-white cursor-pointer shrink-0"
                            title="Copy UTR Reference"
                          >
                            {copiedUtr === deposit.utrReference ? (
                              <Check className="h-3 w-3 text-[#00E676]" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>

                        {/* View Receipt Button */}
                        {deposit.proofSignedUrl && (
                          <button
                            onClick={() => setSelectedProofUrl(deposit.proofSignedUrl || null)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FFFF00] hover:text-yellow-300 hover:underline transition-colors cursor-pointer shrink-0"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View Proof</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Under Review Notice */}
                    {isUnderReview && (
                      <div className="mt-3 pt-3 border-t border-amber-500/20 flex items-center gap-2 text-xs text-amber-200">
                        <Clock className="h-4 w-4 shrink-0 text-amber-300 animate-spin" />
                        <span>
                          Verification in progress. Platform administrators are verifying this UTR in the merchant bank statement. Wallets are credited within 5–15 minutes.
                        </span>
                      </div>
                    )}

                    {/* Approved Confirmation */}
                    {isApproved && (
                      <div className="mt-3 pt-3 border-t border-[#00C853]/20 flex items-center justify-between gap-2 text-xs text-emerald-200">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 shrink-0 text-[#00E676]" />
                          <span>
                            Verified & credited to your available balance.
                            {deposit.approvedAt && ` (${formatDate(deposit.approvedAt)})`}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Rejection Alert */}
                    {isRejected && (
                      <div className="mt-3 pt-3 border-t border-red-500/20 bg-red-500/10 -mx-3.5 sm:-mx-4 -mb-3.5 sm:-mb-4 p-3 rounded-b-2xl">
                        <div className="flex items-start gap-2 text-xs text-red-200">
                          <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                          <div>
                            <span className="font-bold text-red-300 uppercase tracking-wider text-[10px] block">
                              Reason for Rejection:
                            </span>
                            <p className="mt-0.5 text-white/90 font-medium">
                              {deposit.rejectionReason || 'UTR not verified or matching credit not found in bank ledger.'}
                            </p>
                            <p className="text-[11px] text-white/60 mt-1">
                              If you made this transfer, please verify your transaction details and submit a fresh deposit request with the accurate 12-digit UTR and receipt.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Screenshot Lightbox Modal */}
      {selectedProofUrl && mounted && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="relative max-w-lg w-full bg-[#0A0A7A] border border-white/20 rounded-2xl p-4 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
              <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#FFFF00]" />
                <span>Payment Proof Receipt</span>
              </h4>
              <button
                onClick={() => setSelectedProofUrl(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white cursor-pointer"
                aria-label="Close proof preview"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="my-3 flex-1 flex items-center justify-center bg-black/40 rounded-xl overflow-hidden min-h-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedProofUrl}
                alt="Payment proof screenshot"
                className="max-h-[65vh] w-auto max-w-full object-contain rounded-lg"
              />
            </div>

            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-white/60 shrink-0">
              <span>Encrypted payment screenshot</span>
              <a
                href={selectedProofUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[#FFFF00] hover:underline font-bold"
              >
                <span>Open Full Size</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
