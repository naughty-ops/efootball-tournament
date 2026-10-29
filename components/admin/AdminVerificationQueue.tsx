'use client';

import React, { useState, useEffect, useMemo, useTransition } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  ShieldCheck,
  Phone,
  Gamepad2,
  Mail,
  User,
  AlertCircle,
  Loader2,
  RefreshCw,
  Info,
  Calendar,
  AlertTriangle,
  MessageCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { isValidEfootballId } from '@/lib/validations';
import {
  getAdminVerificationQueueAction,
  adminVerifyWhatsAppAction,
  adminVerifyEfootballIdAction,
  adminVerifyWhatsAppByNumberAction,
  type AdminVerificationItem,
} from '@/app/actions/verificationActions';

type FilterType = 'all' | 'needs_action' | 'whatsapp_pending' | 'efootball_pending' | 'verified';

interface RejectModalState {
  isOpen: boolean;
  item: AdminVerificationItem | null;
  target: 'whatsapp' | 'efootball';
  reason: string;
}

export function AdminVerificationQueue({
  initialItems = [],
}: {
  initialItems?: AdminVerificationItem[];
}) {
  const [items, setItems] = useState<AdminVerificationItem[]>(initialItems);
  const [isLoading, setIsLoading] = useState(initialItems.length === 0);
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<FilterType>('needs_action');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Quick Direct WhatsApp Verification State
  const [quickVerifyInput, setQuickVerifyInput] = useState('');
  const [isQuickVerifying, setIsQuickVerifying] = useState(false);

  const [rejectModal, setRejectModal] = useState<RejectModalState>({
    isOpen: false,
    item: null,
    target: 'whatsapp',
    reason: '',
  });

  const loadQueue = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await getAdminVerificationQueueAction();
      if (res.success && res.data) {
        setItems(res.data);
      } else {
        setFeedback({ message: res.message || 'Failed to load queue', type: 'error' });
      }
    } catch (err: any) {
      setFeedback({ message: err.message || 'Error fetching verification requests', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickVerifyWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickVerifyInput.trim()) return;
    setIsQuickVerifying(true);
    setFeedback(null);
    try {
      const res = await adminVerifyWhatsAppByNumberAction(quickVerifyInput.trim(), 'verified');
      if (res.success) {
        setFeedback({ message: res.message, type: 'success' });
        setQuickVerifyInput('');
        loadQueue();
      } else {
        setFeedback({ message: res.message, type: 'error' });
      }
    } catch (err: any) {
      setFeedback({ message: err.message || 'Verification failed', type: 'error' });
    } finally {
      setIsQuickVerifying(false);
    }
  };

  useEffect(() => {
    if (initialItems.length === 0) {
      loadQueue();
    }
  }, []);

  // Filtered & searched items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Filter tab
      if (filter === 'needs_action') {
        const needsWa = item.whatsappVerificationStatus === 'pending';
        const needsEf = item.efootballVerificationStatus === 'pending';
        if (!needsWa && !needsEf) return false;
      } else if (filter === 'whatsapp_pending') {
        if (item.whatsappVerificationStatus !== 'pending') return false;
      } else if (filter === 'efootball_pending') {
        if (item.efootballVerificationStatus !== 'pending') return false;
      } else if (filter === 'verified') {
        if (!item.whatsappVerified || !item.efootballIdVerified) return false;
      }

      // 2. Search query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = item.displayName.toLowerCase().includes(q);
        const emailMatch = (item.email || '').toLowerCase().includes(q);
        const efMatch = item.efootballId.toLowerCase().includes(q);
        const waMatch = item.whatsappNumber.toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !efMatch && !waMatch) return false;
      }

      return true;
    });
  }, [items, filter, searchQuery]);

  // Counts
  const counts = useMemo(() => {
    const total = items.length;
    const waPending = items.filter((i) => i.whatsappVerificationStatus === 'pending').length;
    const efPending = items.filter((i) => i.efootballVerificationStatus === 'pending').length;
    const needsAction = items.filter(
      (i) => i.whatsappVerificationStatus === 'pending' || i.efootballVerificationStatus === 'pending'
    ).length;
    const fullyVerified = items.filter((i) => i.whatsappVerified && i.efootballIdVerified).length;

    return { total, waPending, efPending, needsAction, fullyVerified };
  }, [items]);

  // Handle WhatsApp Verification Action
  const handleVerifyWhatsApp = async (
    targetUserId: string,
    decision: 'verified' | 'rejected',
    reason?: string
  ) => {
    setProcessingId(`wa-${targetUserId}`);
    setFeedback(null);

    startTransition(async () => {
      try {
        const res = await adminVerifyWhatsAppAction(targetUserId, decision, reason);
        if (res.success) {
          setFeedback({ message: res.message, type: 'success' });
          // Update local state optimistically
          setItems((prev) =>
            prev.map((i) => {
              if (i.id === targetUserId) {
                return {
                  ...i,
                  whatsappVerificationStatus: decision,
                  whatsappVerified: decision === 'verified',
                  whatsappVerifiedAt: decision === 'verified' ? new Date().toISOString() : null,
                  whatsappRejectionReason: decision === 'rejected' ? (reason || 'Rejected by administrator.') : null,
                };
              }
              return i;
            })
          );
        } else {
          setFeedback({ message: res.message, type: 'error' });
        }
      } catch (err: any) {
        setFeedback({ message: err.message || 'Operation failed', type: 'error' });
      } finally {
        setProcessingId(null);
      }
    });
  };

  // Handle eFootball Verification Action
  const handleVerifyEfootball = async (
    targetUserId: string,
    decision: 'verified' | 'rejected',
    reason?: string
  ) => {
    setProcessingId(`ef-${targetUserId}`);
    setFeedback(null);

    startTransition(async () => {
      try {
        const res = await adminVerifyEfootballIdAction(targetUserId, decision, reason);
        if (res.success) {
          setFeedback({ message: res.message, type: 'success' });
          // Update local state optimistically
          setItems((prev) =>
            prev.map((i) => {
              if (i.id === targetUserId) {
                return {
                  ...i,
                  efootballVerificationStatus: decision,
                  efootballIdVerified: decision === 'verified',
                  efootballRejectionReason: decision === 'rejected' ? (reason || 'Rejected by administrator.') : null,
                };
              }
              return i;
            })
          );
        } else {
          setFeedback({ message: res.message, type: 'error' });
        }
      } catch (err: any) {
        setFeedback({ message: err.message || 'Operation failed', type: 'error' });
      } finally {
        setProcessingId(null);
      }
    });
  };

  // Open Reject Modal
  const openRejectModal = (item: AdminVerificationItem, target: 'whatsapp' | 'efootball') => {
    setRejectModal({
      isOpen: true,
      item,
      target,
      reason: '',
    });
  };

  const confirmRejection = async () => {
    if (!rejectModal.item) return;
    const { item, target, reason } = rejectModal;
    setRejectModal((prev) => ({ ...prev, isOpen: false }));

    if (target === 'whatsapp') {
      await handleVerifyWhatsApp(item.id, 'rejected', reason.trim() || undefined);
    } else {
      await handleVerifyEfootball(item.id, 'rejected', reason.trim() || undefined);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setFilter('needs_action')}
          className={cn(
            'p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between',
            filter === 'needs_action'
              ? 'bg-[#FFFF00]/15 border-[#FFFF00] shadow-md shadow-[#FFFF00]/10'
              : 'bg-[#1818D4]/60 border-white/15 hover:bg-[#1818D4]'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/70">
              Action Required
            </span>
            <Clock className={cn('h-4 w-4', filter === 'needs_action' ? 'text-[#FFFF00]' : 'text-white/60')} />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-[#FFFF00] font-display mt-2">
            {counts.needsAction}
          </div>
        </div>

        <div
          onClick={() => setFilter('whatsapp_pending')}
          className={cn(
            'p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between',
            filter === 'whatsapp_pending'
              ? 'bg-[#00C853]/15 border-[#00C853] shadow-md shadow-[#00C853]/10'
              : 'bg-[#1818D4]/60 border-white/15 hover:bg-[#1818D4]'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/70">
              WhatsApp Pending
            </span>
            <Phone className="h-4 w-4 text-[#00C853]" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-[#00C853] font-display mt-2">
            {counts.waPending}
          </div>
        </div>

        <div
          onClick={() => setFilter('efootball_pending')}
          className={cn(
            'p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between',
            filter === 'efootball_pending'
              ? 'bg-[#3434FF]/20 border-white/30 shadow-md'
              : 'bg-[#1818D4]/60 border-white/15 hover:bg-[#1818D4]'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/70">
              eFootball ID Pending
            </span>
            <Gamepad2 className="h-4 w-4 text-white/80" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white font-display mt-2">
            {counts.efPending}
          </div>
        </div>

        <div
          onClick={() => setFilter('verified')}
          className={cn(
            'p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between',
            filter === 'verified'
              ? 'bg-[#00C853]/15 border-[#00C853] shadow-md shadow-[#00C853]/10'
              : 'bg-[#1818D4]/60 border-white/15 hover:bg-[#1818D4]'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/70">
              Fully Verified
            </span>
            <ShieldCheck className="h-4 w-4 text-[#00C853]" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-[#00C853] font-display mt-2">
            {counts.fullyVerified}
          </div>
        </div>
      </div>

      {/* Verification Queue Card */}
      <Card className="bg-[#1818D4] border border-white/20 rounded-[32px] shadow-xl text-white overflow-hidden">
        <CardHeader className="pb-4 border-b border-white/10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-[#0A0A7A] text-[#FFFF00] border border-white/20 gap-1.5 py-0.5 px-2.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                  <ShieldCheck className="h-3 w-3 text-[#FFFF00]" />
                  <span>Compliance & Integrity Desk</span>
                </Badge>
              </div>
              <CardTitle className="text-xl sm:text-2xl font-black font-display uppercase tracking-wider text-white">
                Member Verification Desk
              </CardTitle>
              <CardDescription className="text-xs text-white/70">
                Review and approve WhatsApp contact numbers and player eFootball handles. Unverified accounts cannot compete in brackets.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadQueue}
                disabled={isLoading || isPending}
                className="border-white/20 text-white hover:bg-white/10 rounded-full h-9 px-3 gap-1.5 font-bold text-xs"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
                <span>Refresh</span>
              </Button>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, eFootball ID, or WhatsApp..."
                className="pl-9 pr-3 h-10 rounded-full bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 text-xs focus-visible:ring-[#FFFF00]"
              />
            </div>

            {/* Quick Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant={filter === 'needs_action' ? 'default' : 'ghost'}
                onClick={() => setFilter('needs_action')}
                className={cn(
                  'h-8 rounded-full px-3 text-xs font-black uppercase tracking-wider',
                  filter === 'needs_action'
                    ? 'bg-[#FFFF00] text-[#08088F] hover:bg-[#E6E600]'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                )}
              >
                Needs Action ({counts.needsAction})
              </Button>
              <Button
                size="sm"
                variant={filter === 'whatsapp_pending' ? 'default' : 'ghost'}
                onClick={() => setFilter('whatsapp_pending')}
                className={cn(
                  'h-8 rounded-full px-3 text-xs font-black uppercase tracking-wider',
                  filter === 'whatsapp_pending'
                    ? 'bg-[#00C853] text-[#08088F] hover:bg-[#00B048]'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                )}
              >
                WhatsApp ({counts.waPending})
              </Button>
              <Button
                size="sm"
                variant={filter === 'efootball_pending' ? 'default' : 'ghost'}
                onClick={() => setFilter('efootball_pending')}
                className={cn(
                  'h-8 rounded-full px-3 text-xs font-black uppercase tracking-wider',
                  filter === 'efootball_pending'
                    ? 'bg-white text-[#08088F] hover:bg-white/90'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                )}
              >
                eFootball ID ({counts.efPending})
              </Button>
              <Button
                size="sm"
                variant={filter === 'all' ? 'default' : 'ghost'}
                onClick={() => setFilter('all')}
                className={cn(
                  'h-8 rounded-full px-3 text-xs font-black uppercase tracking-wider',
                  filter === 'all'
                    ? 'bg-white/20 text-white hover:bg-white/30'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                )}
              >
                All ({counts.total})
              </Button>
            </div>
          </div>

          {/* Quick Direct Verify Form */}
          <form
            onSubmit={handleQuickVerifyWhatsApp}
            className="pt-3.5 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
          >
            <div className="flex items-center gap-1.5 text-xs text-white/80 shrink-0 font-bold">
              <Phone className="h-3.5 w-3.5 text-[#00C853]" />
              <span>Verify by Number / Email:</span>
            </div>
            <Input
              type="text"
              value={quickVerifyInput}
              onChange={(e) => setQuickVerifyInput(e.target.value)}
              placeholder="Paste WhatsApp number (e.g. +919207516227) or player email..."
              className="flex-1 h-9 rounded-full bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 text-xs focus-visible:ring-[#00C853]"
            />
            <Button
              type="submit"
              disabled={isQuickVerifying || !quickVerifyInput.trim()}
              className="bg-[#00C853] hover:bg-[#00B048] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-full h-9 px-4 gap-1.5 cursor-pointer shrink-0"
            >
              {isQuickVerifying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              <span>Verify WhatsApp</span>
            </Button>
          </form>
        </CardHeader>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={cn(
              'mx-6 mt-4 p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in',
              feedback.type === 'success'
                ? 'bg-[#00C853]/20 border border-[#00C853]/40 text-[#00E676]'
                : 'bg-red-500/20 border border-red-500/40 text-red-200'
            )}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#00C853]" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-white/60 hover:text-white text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Content Body */}
        <CardContent className="p-6">
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-[#FFFF00] mx-auto" />
              <p className="text-xs text-white/70 font-bold uppercase tracking-wider">
                Loading verification requests...
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-3">
              <CheckCircle2 className="h-10 w-10 text-[#00C853] mx-auto opacity-80" />
              <h3 className="font-bold text-base text-white">Queue Clear</h3>
              <p className="text-xs text-white/60 max-w-sm mx-auto">
                {filter === 'needs_action'
                  ? 'There are no pending WhatsApp or eFootball ID verification requests waiting for review.'
                  : 'No member records matched your selected criteria.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredItems.map((item) => {
                const isWaPending = item.whatsappVerificationStatus === 'pending';
                const isWaVerified = item.whatsappVerified;
                const isWaRejected = item.whatsappVerificationStatus === 'rejected';

                const isEfPending = item.efootballVerificationStatus === 'pending';
                const isEfVerified = item.efootballIdVerified;
                const isEfRejected = item.efootballVerificationStatus === 'rejected';

                const isProcessingWa = processingId === `wa-${item.id}`;
                const isProcessingEf = processingId === `ef-${item.id}`;

                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-2xl bg-[#0A0A7A] border border-white/10 hover:border-white/20 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                  >
                    {/* Column 1: Member Identity */}
                    <div className="space-y-1.5 min-w-[240px]">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-[#1818D4] border border-white/20 flex items-center justify-center text-[#FFFF00] shrink-0">
                          <User className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-sm">{item.displayName}</h4>
                          <p className="text-[11px] text-white/60 flex items-center gap-1">
                            <Mail className="h-3 w-3 text-white/40" />
                            <span>{item.email || `User: ${item.id.slice(0, 8)}...`}</span>
                          </p>
                        </div>
                      </div>

                      <div className="text-[10px] text-white/50 pl-10 flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        <span>Registered {new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Column 2: eFootball ID Verification Detail */}
                    <div className="flex-1 min-w-[220px] p-3 rounded-xl bg-[#1818D4]/70 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-white/60 flex items-center gap-1">
                          <Gamepad2 className="h-3 w-3 text-[#FFFF00]" />
                          eFootball ID
                        </span>
                        {isEfVerified || isValidEfootballId(item.efootballId) ? (
                          <Badge className="bg-[#00C853]/20 text-[#00E676] border border-[#00C853]/30 text-[10px] font-bold py-0">
                            Format Verified
                          </Badge>
                        ) : isEfRejected ? (
                          <Badge className="bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-bold py-0">
                            Rejected
                          </Badge>
                        ) : (
                          <Badge className="bg-[#FFFF00]/20 text-[#FFFF00] border border-[#FFFF00]/30 text-[10px] font-bold py-0">
                            Format Pending
                          </Badge>
                        )}
                      </div>

                      <div className="font-mono text-sm font-black text-white tracking-widest bg-[#0A0A7A] px-2.5 py-1 rounded border border-white/10">
                        {item.efootballId}
                      </div>

                      {item.efootballRejectionReason && (
                        <p className="text-[10px] text-red-300 italic">
                          Reason: {item.efootballRejectionReason}
                        </p>
                      )}

                      {/* eFootball Admin Actions */}
                      <div className="flex items-center gap-2 pt-1">
                        {!isEfVerified ? (
                          <Button
                            size="sm"
                            disabled={isProcessingEf || isPending}
                            onClick={() => handleVerifyEfootball(item.id, 'verified')}
                            className="h-7 text-[11px] font-black uppercase tracking-wider bg-[#00C853] hover:bg-[#00B048] text-[#08088F] rounded-full px-3 gap-1 cursor-pointer"
                          >
                            {isProcessingEf ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3" />
                            )}
                            <span>Approve ID</span>
                          </Button>
                        ) : null}

                        {!isEfRejected ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isProcessingEf || isPending}
                            onClick={() => openRejectModal(item, 'efootball')}
                            className="h-7 text-[11px] font-black uppercase tracking-wider border-red-400/40 text-red-300 hover:bg-red-500/20 rounded-full px-3 gap-1 cursor-pointer"
                          >
                            <XCircle className="h-3 w-3" />
                            <span>Reject</span>
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {/* Column 3: WhatsApp Number Verification Detail */}
                    <div className="flex-1 min-w-[220px] p-3 rounded-xl bg-[#1818D4]/70 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-white/60 flex items-center gap-1">
                          <Phone className="h-3 w-3 text-[#00C853]" />
                          WhatsApp Contact
                        </span>
                        {isWaVerified ? (
                          <Badge className="bg-[#00C853]/20 text-[#00E676] border border-[#00C853]/30 text-[10px] font-bold py-0">
                            Verified
                          </Badge>
                        ) : isWaPending ? (
                          <Badge className="bg-[#FFFF00]/20 text-[#FFFF00] border border-[#FFFF00]/30 text-[10px] font-bold py-0">
                            Pending Approval
                          </Badge>
                        ) : isWaRejected ? (
                          <Badge className="bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-bold py-0">
                            Rejected
                          </Badge>
                        ) : (
                          <Badge className="bg-white/10 text-white/60 border border-white/20 text-[10px] font-bold py-0">
                            Not Requested
                          </Badge>
                        )}
                      </div>

                      <div className="font-mono text-sm font-bold text-white bg-[#0A0A7A] px-2.5 py-1 rounded border border-white/10">
                        {item.whatsappNumber || 'Not Provided'}
                      </div>

                      {item.whatsappRequestedAt && (
                        <p className="text-[10px] text-white/50">
                          Requested: {new Date(item.whatsappRequestedAt).toLocaleString()}
                        </p>
                      )}

                      {item.whatsappRejectionReason && (
                        <p className="text-[10px] text-red-300 italic">
                          Reason: {item.whatsappRejectionReason}
                        </p>
                      )}

                      {/* WhatsApp Admin Actions */}
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        {item.whatsappNumber && item.whatsappNumber !== 'Not Provided' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const clean = item.whatsappNumber.replace(/\D/g, '');
                              window.open(`https://wa.me/${clean}`, '_blank', 'noopener,noreferrer');
                            }}
                            className="h-7 text-[11px] font-black uppercase tracking-wider border-white/20 text-[#25D366] hover:bg-[#25D366]/20 rounded-full px-2.5 gap-1 cursor-pointer"
                          >
                            <MessageCircle className="h-3 w-3 text-[#25D366]" />
                            <span>Chat</span>
                          </Button>
                        )}

                        {!isWaVerified ? (
                          <Button
                            size="sm"
                            disabled={isProcessingWa || isPending || !item.whatsappNumber}
                            onClick={() => handleVerifyWhatsApp(item.id, 'verified')}
                            className="h-7 text-[11px] font-black uppercase tracking-wider bg-[#00C853] hover:bg-[#00B048] text-[#08088F] rounded-full px-3 gap-1 cursor-pointer"
                          >
                            {isProcessingWa ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3" />
                            )}
                            <span>Approve WhatsApp</span>
                          </Button>
                        ) : null}

                        {!isWaRejected && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isProcessingWa || isPending}
                            onClick={() => openRejectModal(item, 'whatsapp')}
                            className="h-7 text-[11px] font-black uppercase tracking-wider border-red-400/40 text-red-300 hover:bg-red-500/20 rounded-full px-3 gap-1 cursor-pointer"
                          >
                            <XCircle className="h-3 w-3" />
                            <span>Reject</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rejection Modal */}
      {rejectModal.isOpen && rejectModal.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#08088F]/85 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setRejectModal((prev) => ({ ...prev, isOpen: false }))}
          />
          <div className="relative w-full max-w-md bg-[#1818D4] rounded-[32px] border border-white/20 shadow-2xl p-6 sm:p-8 z-10 space-y-5 animate-in zoom-in-95 duration-200 text-white">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/20 text-red-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black font-display uppercase tracking-wider text-white">
                  Reject {rejectModal.target === 'whatsapp' ? 'WhatsApp Number' : 'eFootball ID'}
                </h3>
                <p className="text-xs text-white/70">
                  Player: <strong className="text-white">{rejectModal.item.displayName}</strong>
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-white/80 block">
                Reason for Rejection (Visible to Player)
              </label>
              <textarea
                value={rejectModal.reason}
                onChange={(e) => setRejectModal((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder={
                  rejectModal.target === 'whatsapp'
                    ? 'e.g. Invalid country code, unanswered verification call, or incorrect WhatsApp owner.'
                    : 'e.g. eFootball ID not found in Konami player database or mismatched username.'
                }
                rows={3}
                className="w-full rounded-2xl bg-[#0A0A7A] border border-white/20 p-3 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-red-400"
              />

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-1.5">
                {rejectModal.target === 'whatsapp' ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setRejectModal((prev) => ({
                          ...prev,
                          reason: 'WhatsApp number is invalid or unreachable.',
                        }))
                      }
                      className="text-[10px] bg-white/10 hover:bg-white/20 px-2 py-1 rounded-full text-white/80 cursor-pointer"
                    >
                      Unreachable
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRejectModal((prev) => ({
                          ...prev,
                          reason: 'Missing valid country code or incorrect digits.',
                        }))
                      }
                      className="text-[10px] bg-white/10 hover:bg-white/20 px-2 py-1 rounded-full text-white/80 cursor-pointer"
                    >
                      Invalid Format
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setRejectModal((prev) => ({
                          ...prev,
                          reason: 'eFootball ID does not exist in Konami in-game records.',
                        }))
                      }
                      className="text-[10px] bg-white/10 hover:bg-white/20 px-2 py-1 rounded-full text-white/80 cursor-pointer"
                    >
                      ID Not Found
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRejectModal((prev) => ({
                          ...prev,
                          reason: 'Account name does not match submitted eFootball ID profile.',
                        }))
                      }
                      className="text-[10px] bg-white/10 hover:bg-white/20 px-2 py-1 rounded-full text-white/80 cursor-pointer"
                    >
                      Name Mismatch
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => setRejectModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-white/70 hover:text-white hover:bg-white/10 rounded-full h-10 px-5 text-xs font-black uppercase cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmRejection}
                className="bg-red-500 hover:bg-red-600 text-white rounded-full h-10 px-6 text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
