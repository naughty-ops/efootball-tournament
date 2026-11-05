'use client';

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  ShieldCheck,
  Phone,
  Gamepad2,
  Mail,
  User,
  AlertCircle,
  Loader2,
  RefreshCw,
  Calendar,
  AlertTriangle,
  MessageCircle,
  Eye,
  Ban,
  RotateCcw,
  FileText,
  Trophy,
  History,
  Check,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ArrowUpDown,
  ExternalLink,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { isValidEfootballId } from '@/lib/validations/efootball';
import {
  getAdminVerificationQueueAction,
  getVerificationDashboardStatsAction,
  getMemberVerificationDetailsAction,
  adminVerifyWhatsAppAction,
  adminVerifyEfootballIdAction,
  adminVerifyBothAction,
  adminVerifyWhatsAppByNumberAction,
  adminRevokeVerificationAction,
  adminSuspendMemberAction,
  adminUnsuspendMemberAction,
  adminUpdateMemberNotesAction,
  type AdminVerificationItem,
  type VerificationDashboardStats,
  type MemberDetailedVerificationView,
} from '@/app/actions/verificationActions';

type TabType = 'all' | 'pending' | 'verified' | 'rejected' | 'suspended';
type SortByType = 'created_at_desc' | 'created_at_asc' | 'name_asc' | 'name_desc';

interface RejectModalState {
  isOpen: boolean;
  item: AdminVerificationItem | null;
  target: 'whatsapp' | 'efootball';
  reason: string;
}

interface RevokeModalState {
  isOpen: boolean;
  item: AdminVerificationItem | null;
  target: 'whatsapp' | 'efootball' | 'both';
  reason: string;
}

interface SuspendModalState {
  isOpen: boolean;
  item: AdminVerificationItem | null;
  reason: string;
}

interface UnsuspendModalState {
  isOpen: boolean;
  item: AdminVerificationItem | null;
  notes: string;
}

export function AdminVerificationQueue({
  initialItems = [],
}: {
  initialItems?: AdminVerificationItem[];
}) {
  // Live Data State
  const [items, setItems] = useState<AdminVerificationItem[]>(initialItems);
  const [stats, setStats] = useState<VerificationDashboardStats>({
    totalMembers: 0,
    verifiedMembers: 0,
    pendingVerification: 0,
    rejectedVerification: 0,
    suspendedMembers: 0,
  });

  // Query & Pagination Controls
  const [tab, setTab] = useState<TabType>('pending');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortByType>('created_at_desc');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Loading & Processing States
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Quick Direct WhatsApp Verification
  const [quickVerifyInput, setQuickVerifyInput] = useState('');
  const [isQuickVerifying, setIsQuickVerifying] = useState(false);

  // Details Drawer / Modal State
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberDetails, setMemberDetails] = useState<MemberDetailedVerificationView | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [adminNoteInput, setAdminNoteInput] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Action Modals State
  const [rejectModal, setRejectModal] = useState<RejectModalState>({
    isOpen: false,
    item: null,
    target: 'whatsapp',
    reason: '',
  });

  const [revokeModal, setRevokeModal] = useState<RevokeModalState>({
    isOpen: false,
    item: null,
    target: 'both',
    reason: '',
  });

  const [suspendModal, setSuspendModal] = useState<SuspendModalState>({
    isOpen: false,
    item: null,
    reason: '',
  });

  const [unsuspendModal, setUnsuspendModal] = useState<UnsuspendModalState>({
    isOpen: false,
    item: null,
    notes: '',
  });

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 on new search
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  // Load Dashboard Stats
  const loadStats = useCallback(async () => {
    try {
      const res = await getVerificationDashboardStatsAction();
      if (res.success && res.data) {
        setStats(res.data);
      }
    } catch (err: any) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  // Load Verification Queue Items
  const loadQueue = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getAdminVerificationQueueAction({
        tab,
        search: debouncedSearch,
        sortBy,
        page,
        pageSize,
      });

      if (res.success && res.data) {
        setItems(res.data.items);
        setTotalPages(res.data.totalPages || 1);
        setTotalCount(res.data.total || 0);
      } else {
        setFeedback({ message: res.message || 'Failed to load queue', type: 'error' });
      }
    } catch (err: any) {
      setFeedback({ message: err.message || 'Error fetching verification requests', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [tab, debouncedSearch, sortBy, page, pageSize]);

  // Initial and reactive data loads
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Refresh all data
  const handleRefreshAll = async () => {
    setFeedback(null);
    await Promise.all([loadStats(), loadQueue()]);
  };

  // Quick Direct WhatsApp Verification
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
        await Promise.all([loadStats(), loadQueue()]);
      } else {
        setFeedback({ message: res.message, type: 'error' });
      }
    } catch (err: any) {
      setFeedback({ message: err.message || 'Verification failed', type: 'error' });
    } finally {
      setIsQuickVerifying(false);
    }
  };

  // Open Details Drawer / Modal
  const handleOpenDetails = async (memberId: string) => {
    setSelectedMemberId(memberId);
    setIsLoadingDetails(true);
    setMemberDetails(null);
    try {
      const res = await getMemberVerificationDetailsAction(memberId);
      if (res.success && res.data) {
        setMemberDetails(res.data);
        setAdminNoteInput(res.data.profile.adminNotes || '');
      } else {
        setFeedback({ message: res.message || 'Failed to fetch member details', type: 'error' });
        setSelectedMemberId(null);
      }
    } catch (err: any) {
      setFeedback({ message: err.message || 'Failed to fetch member details', type: 'error' });
      setSelectedMemberId(null);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Save Admin Note
  const handleSaveAdminNote = async () => {
    if (!selectedMemberId) return;
    setIsSavingNote(true);
    try {
      const res = await adminUpdateMemberNotesAction(selectedMemberId, adminNoteInput);
      if (res.success) {
        setFeedback({ message: res.message, type: 'success' });
        // Update local member details state
        if (memberDetails) {
          setMemberDetails({
            ...memberDetails,
            profile: {
              ...memberDetails.profile,
              adminNotes: adminNoteInput,
            },
          });
        }
      } else {
        setFeedback({ message: res.message, type: 'error' });
      }
    } catch (err: any) {
      setFeedback({ message: err.message || 'Failed to save note', type: 'error' });
    } finally {
      setIsSavingNote(false);
    }
  };

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
          await Promise.all([loadStats(), loadQueue()]);
          if (selectedMemberId === targetUserId) {
            handleOpenDetails(targetUserId);
          }
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
          await Promise.all([loadStats(), loadQueue()]);
          if (selectedMemberId === targetUserId) {
            handleOpenDetails(targetUserId);
          }
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

  // Handle Verify Both (Single Click)
  const handleVerifyBoth = async (targetUserId: string) => {
    setProcessingId(`both-${targetUserId}`);
    setFeedback(null);

    startTransition(async () => {
      try {
        const res = await adminVerifyBothAction(targetUserId);
        if (res.success) {
          setFeedback({ message: res.message, type: 'success' });
          await Promise.all([loadStats(), loadQueue()]);
          if (selectedMemberId === targetUserId) {
            handleOpenDetails(targetUserId);
          }
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

  // Confirm Rejection
  const confirmRejection = async () => {
    if (!rejectModal.item) return;
    const { item, target, reason } = rejectModal;
    const cleanReason = reason.trim();
    if (!cleanReason) {
      setFeedback({ message: 'A rejection reason is strictly required.', type: 'error' });
      return;
    }

    setRejectModal((prev) => ({ ...prev, isOpen: false }));
    if (target === 'whatsapp') {
      await handleVerifyWhatsApp(item.id, 'rejected', cleanReason);
    } else {
      await handleVerifyEfootball(item.id, 'rejected', cleanReason);
    }
  };

  // Confirm Revocation
  const confirmRevocation = async () => {
    if (!revokeModal.item) return;
    const { item, target, reason } = revokeModal;
    const cleanReason = reason.trim();
    if (!cleanReason) {
      setFeedback({ message: 'A revocation reason is strictly required.', type: 'error' });
      return;
    }

    setProcessingId(`revoke-${item.id}`);
    setRevokeModal((prev) => ({ ...prev, isOpen: false }));
    startTransition(async () => {
      try {
        const res = await adminRevokeVerificationAction(item.id, target, cleanReason);
        if (res.success) {
          setFeedback({ message: res.message, type: 'success' });
          await Promise.all([loadStats(), loadQueue()]);
          if (selectedMemberId === item.id) {
            handleOpenDetails(item.id);
          }
        } else {
          setFeedback({ message: res.message, type: 'error' });
        }
      } catch (err: any) {
        setFeedback({ message: err.message || 'Revocation failed', type: 'error' });
      } finally {
        setProcessingId(null);
      }
    });
  };

  // Confirm Suspension
  const confirmSuspension = async () => {
    if (!suspendModal.item) return;
    const { item, reason } = suspendModal;
    const cleanReason = reason.trim();
    if (!cleanReason) {
      setFeedback({ message: 'A suspension reason is strictly required.', type: 'error' });
      return;
    }

    setProcessingId(`suspend-${item.id}`);
    setSuspendModal((prev) => ({ ...prev, isOpen: false }));
    startTransition(async () => {
      try {
        const res = await adminSuspendMemberAction(item.id, cleanReason);
        if (res.success) {
          setFeedback({ message: res.message, type: 'success' });
          await Promise.all([loadStats(), loadQueue()]);
          if (selectedMemberId === item.id) {
            handleOpenDetails(item.id);
          }
        } else {
          setFeedback({ message: res.message, type: 'error' });
        }
      } catch (err: any) {
        setFeedback({ message: err.message || 'Suspension failed', type: 'error' });
      } finally {
        setProcessingId(null);
      }
    });
  };

  // Confirm Unsuspension
  const confirmUnsuspension = async () => {
    if (!unsuspendModal.item) return;
    const { item, notes } = unsuspendModal;

    setProcessingId(`unsuspend-${item.id}`);
    setUnsuspendModal((prev) => ({ ...prev, isOpen: false }));
    startTransition(async () => {
      try {
        const res = await adminUnsuspendMemberAction(item.id, notes.trim() || undefined);
        if (res.success) {
          setFeedback({ message: res.message, type: 'success' });
          await Promise.all([loadStats(), loadQueue()]);
          if (selectedMemberId === item.id) {
            handleOpenDetails(item.id);
          }
        } else {
          setFeedback({ message: res.message, type: 'error' });
        }
      } catch (err: any) {
        setFeedback({ message: err.message || 'Unsuspension failed', type: 'error' });
      } finally {
        setProcessingId(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Live Verification Statistics Banner (Real Database Counts) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Members */}
        <div
          onClick={() => {
            setTab('all');
            setPage(1);
          }}
          className={cn(
            'p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between select-none',
            tab === 'all'
              ? 'bg-[#1818D4] border-white/60 shadow-lg ring-2 ring-white/40'
              : 'bg-[#1818D4]/60 border-white/15 hover:bg-[#1818D4]'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/70">
              Total Members
            </span>
            <User className="h-4 w-4 text-white/70" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white font-display mt-2">
            {stats.totalMembers}
          </div>
        </div>

        {/* Pending Verification */}
        <div
          onClick={() => {
            setTab('pending');
            setPage(1);
          }}
          className={cn(
            'p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between select-none',
            tab === 'pending'
              ? 'bg-[#FFFF00]/15 border-[#FFFF00] shadow-md shadow-[#FFFF00]/10 ring-2 ring-[#FFFF00]'
              : 'bg-[#1818D4]/60 border-white/15 hover:bg-[#1818D4]'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/70">
              Pending Review
            </span>
            <Clock className={cn('h-4 w-4', tab === 'pending' ? 'text-[#FFFF00]' : 'text-[#FFFF00]/80')} />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-[#FFFF00] font-display mt-2">
            {stats.pendingVerification}
          </div>
        </div>

        {/* Verified Members */}
        <div
          onClick={() => {
            setTab('verified');
            setPage(1);
          }}
          className={cn(
            'p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between select-none',
            tab === 'verified'
              ? 'bg-[#00C853]/15 border-[#00C853] shadow-md shadow-[#00C853]/10 ring-2 ring-[#00C853]'
              : 'bg-[#1818D4]/60 border-white/15 hover:bg-[#1818D4]'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/70">
              Verified Members
            </span>
            <ShieldCheck className="h-4 w-4 text-[#00C853]" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-[#00C853] font-display mt-2">
            {stats.verifiedMembers}
          </div>
        </div>

        {/* Rejected Requests */}
        <div
          onClick={() => {
            setTab('rejected');
            setPage(1);
          }}
          className={cn(
            'p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between select-none',
            tab === 'rejected'
              ? 'bg-amber-500/15 border-amber-400 shadow-md ring-2 ring-amber-400'
              : 'bg-[#1818D4]/60 border-white/15 hover:bg-[#1818D4]'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/70">
              Rejected Requests
            </span>
            <XCircle className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-300 font-display mt-2">
            {stats.rejectedVerification}
          </div>
        </div>

        {/* Suspended Members */}
        <div
          onClick={() => {
            setTab('suspended');
            setPage(1);
          }}
          className={cn(
            'p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between select-none col-span-2 sm:col-span-1',
            tab === 'suspended'
              ? 'bg-red-500/15 border-red-500 shadow-md ring-2 ring-red-500'
              : 'bg-[#1818D4]/60 border-white/15 hover:bg-[#1818D4]'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/70">
              Suspended
            </span>
            <Ban className="h-4 w-4 text-red-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-red-400 font-display mt-2">
            {stats.suspendedMembers}
          </div>
        </div>
      </div>

      {/* 2. Verification Queue Card */}
      <Card className="bg-[#1818D4] border border-white/20 rounded-[32px] shadow-xl text-white overflow-hidden">
        <CardHeader className="pb-4 border-b border-white/10 space-y-4">
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
                onClick={handleRefreshAll}
                disabled={isLoading || isPending}
                className="border-white/20 text-white hover:bg-white/10 rounded-full h-9 px-3 gap-1.5 font-bold text-xs cursor-pointer"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', (isLoading || isPending) && 'animate-spin')} />
                <span>Refresh Desk</span>
              </Button>
            </div>
          </div>

          {/* Quick Filter Tabs (The 5 Required Tabs) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-white/10 pt-1">
            <button
              onClick={() => {
                setTab('all');
                setPage(1);
              }}
              className={cn(
                'px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer',
                tab === 'all'
                  ? 'bg-white text-[#08088F] shadow'
                  : 'bg-[#0A0A7A] text-white/70 hover:text-white border border-white/10'
              )}
            >
              All Members ({stats.totalMembers})
            </button>
            <button
              onClick={() => {
                setTab('pending');
                setPage(1);
              }}
              className={cn(
                'px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer',
                tab === 'pending'
                  ? 'bg-[#FFFF00] text-[#08088F] shadow font-black'
                  : 'bg-[#0A0A7A] text-white/70 hover:text-white border border-white/10'
              )}
            >
              Pending Verification ({stats.pendingVerification})
            </button>
            <button
              onClick={() => {
                setTab('verified');
                setPage(1);
              }}
              className={cn(
                'px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer',
                tab === 'verified'
                  ? 'bg-[#00C853] text-[#08088F] shadow font-black'
                  : 'bg-[#0A0A7A] text-white/70 hover:text-white border border-white/10'
              )}
            >
              Verified Members ({stats.verifiedMembers})
            </button>
            <button
              onClick={() => {
                setTab('rejected');
                setPage(1);
              }}
              className={cn(
                'px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer',
                tab === 'rejected'
                  ? 'bg-amber-400 text-[#08088F] shadow font-black'
                  : 'bg-[#0A0A7A] text-white/70 hover:text-white border border-white/10'
              )}
            >
              Rejected Requests ({stats.rejectedVerification})
            </button>
            <button
              onClick={() => {
                setTab('suspended');
                setPage(1);
              }}
              className={cn(
                'px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer',
                tab === 'suspended'
                  ? 'bg-red-500 text-white shadow font-black'
                  : 'bg-[#0A0A7A] text-white/70 hover:text-white border border-white/10'
              )}
            >
              Suspended Members ({stats.suspendedMembers})
            </button>
          </div>

          {/* Search & Sorting Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, eFootball ID, or WhatsApp..."
                className="pl-9 pr-3 h-10 rounded-full bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 text-xs focus-visible:ring-[#FFFF00]"
              />
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <span className="text-[11px] font-bold text-white/60 flex items-center gap-1">
                <ArrowUpDown className="h-3 w-3" />
                Sort:
              </span>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as SortByType);
                  setPage(1);
                }}
                className="h-10 rounded-full bg-[#0A0A7A] border border-white/20 text-white text-xs px-3 focus:outline-none focus:ring-1 focus:ring-[#FFFF00] cursor-pointer"
              >
                <option value="created_at_desc" className="bg-[#0A0A7A] text-white">Newest Registered</option>
                <option value="created_at_asc" className="bg-[#0A0A7A] text-white">Oldest Registered</option>
                <option value="name_asc" className="bg-[#0A0A7A] text-white">Player Name (A-Z)</option>
                <option value="name_desc" className="bg-[#0A0A7A] text-white">Player Name (Z-A)</option>
              </select>
            </div>
          </div>

          {/* Quick Direct Verify Form */}
          <form
            onSubmit={handleQuickVerifyWhatsApp}
            className="pt-2 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
          >
            <div className="flex items-center gap-1.5 text-xs text-white/80 shrink-0 font-bold">
              <Phone className="h-3.5 w-3.5 text-[#00C853]" />
              <span>Direct WhatsApp Lookup:</span>
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
              <span>Instant Verify</span>
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
          ) : items.length === 0 ? (
            <div className="py-16 text-center rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-3">
              <CheckCircle2 className="h-10 w-10 text-[#00C853] mx-auto opacity-80" />
              <h3 className="font-bold text-base text-white">Queue Clear</h3>
              <p className="text-xs text-white/60 max-w-sm mx-auto">
                {tab === 'pending'
                  ? 'There are no pending WhatsApp or eFootball ID verification requests waiting for review.'
                  : tab === 'suspended'
                  ? 'There are currently no suspended members on the platform.'
                  : tab === 'rejected'
                  ? 'No rejected verification requests found.'
                  : 'No member records matched your selected filter or search query.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const isWaPending = item.whatsappVerificationStatus === 'pending';
                const isWaVerified = item.whatsappVerified;
                const isWaRejected = item.whatsappVerificationStatus === 'rejected';

                const isEfPending = item.efootballVerificationStatus === 'pending';
                const isEfVerified = item.efootballIdVerified;
                const isEfRejected = item.efootballVerificationStatus === 'rejected';

                const isSuspended = item.accountStatus === 'suspended';

                const isProcessingWa = processingId === `wa-${item.id}`;
                const isProcessingEf = processingId === `ef-${item.id}`;
                const isProcessingBoth = processingId === `both-${item.id}`;
                const isProcessingRevoke = processingId === `revoke-${item.id}`;
                const isProcessingSuspend = processingId === `suspend-${item.id}`;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'p-5 rounded-2xl bg-[#0A0A7A] border transition-all flex flex-col xl:flex-row xl:items-center justify-between gap-5',
                      isSuspended
                        ? 'border-red-500/40 bg-red-950/10'
                        : 'border-white/10 hover:border-white/25'
                    )}
                  >
                    {/* Column 1: Member Identity & Account Status */}
                    <div className="space-y-2 min-w-[240px]">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-[#1818D4] border border-white/20 flex items-center justify-center text-[#FFFF00] shrink-0 font-display text-base font-black">
                          {item.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-white text-sm truncate">{item.displayName}</h4>
                            {isSuspended ? (
                              <Badge className="bg-red-500/20 text-red-300 border border-red-500/40 text-[9px] font-black uppercase tracking-wider py-0">
                                Suspended
                              </Badge>
                            ) : isWaVerified && isEfVerified ? (
                              <Badge className="bg-[#00C853]/20 text-[#00E676] border border-[#00C853]/40 text-[9px] font-black uppercase tracking-wider py-0">
                                Fully Verified
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-[11px] text-white/60 flex items-center gap-1 truncate">
                            <Mail className="h-3 w-3 text-white/40 shrink-0" />
                            <span>{item.email || `ID: ${item.id.slice(0, 8)}...`}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-[10px] text-white/50 pl-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Joined {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                        {item.adminNotes && (
                          <span className="text-[#FFFF00] flex items-center gap-1 font-bold">
                            <FileText className="h-3 w-3" />
                            Notes logged
                          </span>
                        )}
                      </div>

                      {/* Suspension reason banner if suspended */}
                      {isSuspended && item.suspensionReason && (
                        <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/30 text-[10px] text-red-200">
                          <span className="font-bold text-red-300">Suspension Reason: </span>
                          <span>{item.suspensionReason}</span>
                        </div>
                      )}
                    </div>

                    {/* Column 2: eFootball ID Verification Details */}
                    <div className="flex-1 min-w-[210px] p-3.5 rounded-xl bg-[#1818D4]/70 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-white/60 flex items-center gap-1">
                          <Gamepad2 className="h-3 w-3 text-[#FFFF00]" />
                          eFootball ID
                        </span>
                        {isEfVerified ? (
                          <Badge className="bg-[#00C853]/20 text-[#00E676] border border-[#00C853]/30 text-[10px] font-bold py-0">
                            Verified
                          </Badge>
                        ) : isValidEfootballId(item.efootballId) ? (
                          <Badge className="bg-[#FFFF00]/20 text-[#FFFF00] border border-[#FFFF00]/30 text-[10px] font-bold py-0">
                            Format Valid
                          </Badge>
                        ) : isEfRejected ? (
                          <Badge className="bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-bold py-0">
                            Rejected
                          </Badge>
                        ) : (
                          <Badge className="bg-white/10 text-white/60 border border-white/20 text-[10px] font-bold py-0">
                            Format Pending
                          </Badge>
                        )}
                      </div>

                      <div className="font-mono text-xs sm:text-sm font-black text-white tracking-widest bg-[#0A0A7A] px-2.5 py-1.5 rounded border border-white/10 truncate">
                        {item.efootballId}
                      </div>

                      {item.efootballRejectionReason && (
                        <p className="text-[10px] text-red-300 italic truncate" title={item.efootballRejectionReason}>
                          Reason: {item.efootballRejectionReason}
                        </p>
                      )}

                      {/* eFootball ID Actions */}
                      <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                        {!isEfVerified ? (
                          <Button
                            size="sm"
                            disabled={isProcessingEf || isPending}
                            onClick={() => handleVerifyEfootball(item.id, 'verified')}
                            className="h-7 text-[10px] font-black uppercase tracking-wider bg-[#00C853] hover:bg-[#00B048] text-[#08088F] rounded-full px-2.5 gap-1 cursor-pointer"
                          >
                            {isProcessingEf ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3" />
                            )}
                            <span>Approve</span>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isProcessingRevoke || isPending}
                            onClick={() =>
                              setRevokeModal({
                                isOpen: true,
                                item,
                                target: 'efootball',
                                reason: '',
                              })
                            }
                            className="h-7 text-[10px] font-black uppercase tracking-wider border-amber-400/40 text-amber-300 hover:bg-amber-400/15 rounded-full px-2.5 gap-1 cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Revoke</span>
                          </Button>
                        )}

                        {!isEfRejected && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isProcessingEf || isPending}
                            onClick={() =>
                              setRejectModal({
                                isOpen: true,
                                item,
                                target: 'efootball',
                                reason: '',
                              })
                            }
                            className="h-7 text-[10px] font-black uppercase tracking-wider border-red-400/40 text-red-300 hover:bg-red-500/20 rounded-full px-2.5 gap-1 cursor-pointer"
                          >
                            <XCircle className="h-3 w-3" />
                            <span>Reject</span>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Column 3: WhatsApp Contact Verification Details */}
                    <div className="flex-1 min-w-[210px] p-3.5 rounded-xl bg-[#1818D4]/70 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-white/60 flex items-center gap-1">
                          <Phone className="h-3 w-3 text-[#00C853]" />
                          WhatsApp
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

                      <div className="font-mono text-xs sm:text-sm font-bold text-white bg-[#0A0A7A] px-2.5 py-1.5 rounded border border-white/10 truncate">
                        {item.whatsappNumber || 'Not Provided'}
                      </div>

                      {item.whatsappRejectionReason && (
                        <p className="text-[10px] text-red-300 italic truncate" title={item.whatsappRejectionReason}>
                          Reason: {item.whatsappRejectionReason}
                        </p>
                      )}

                      {/* WhatsApp Actions */}
                      <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                        {item.whatsappNumber && item.whatsappNumber !== 'Not Provided' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const clean = item.whatsappNumber.replace(/\D/g, '');
                              window.open(`https://wa.me/${clean}`, '_blank', 'noopener,noreferrer');
                            }}
                            className="h-7 text-[10px] font-black uppercase tracking-wider border-white/20 text-[#25D366] hover:bg-[#25D366]/20 rounded-full px-2 gap-1 cursor-pointer"
                          >
                            <MessageCircle className="h-3 w-3 text-[#25D366]" />
                            <span>Chat</span>
                          </Button>
                        )}

                        {!isWaVerified ? (
                          <Button
                            size="sm"
                            disabled={isProcessingWa || isPending || !item.whatsappNumber || item.whatsappNumber === 'Not Provided'}
                            onClick={() => handleVerifyWhatsApp(item.id, 'verified')}
                            className="h-7 text-[10px] font-black uppercase tracking-wider bg-[#00C853] hover:bg-[#00B048] text-[#08088F] rounded-full px-2.5 gap-1 cursor-pointer"
                          >
                            {isProcessingWa ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3" />
                            )}
                            <span>Approve</span>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isProcessingRevoke || isPending}
                            onClick={() =>
                              setRevokeModal({
                                isOpen: true,
                                item,
                                target: 'whatsapp',
                                reason: '',
                              })
                            }
                            className="h-7 text-[10px] font-black uppercase tracking-wider border-amber-400/40 text-amber-300 hover:bg-amber-400/15 rounded-full px-2.5 gap-1 cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Revoke</span>
                          </Button>
                        )}

                        {!isWaRejected && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isProcessingWa || isPending}
                            onClick={() =>
                              setRejectModal({
                                isOpen: true,
                                item,
                                target: 'whatsapp',
                                reason: '',
                              })
                            }
                            className="h-7 text-[10px] font-black uppercase tracking-wider border-red-400/40 text-red-300 hover:bg-red-500/20 rounded-full px-2.5 gap-1 cursor-pointer"
                          >
                            <XCircle className="h-3 w-3" />
                            <span>Reject</span>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Column 4: Quick Suite (Approve Both, View Details, Suspend/Unsuspend) */}
                    <div className="flex flex-row xl:flex-col items-center justify-end gap-2 shrink-0 pt-2 xl:pt-0 border-t xl:border-t-0 border-white/10">
                      {/* Dual verification single-click button if either is unverified */}
                      {(!isWaVerified || !isEfVerified) && (
                        <Button
                          size="sm"
                          disabled={isProcessingBoth || isPending}
                          onClick={() => handleVerifyBoth(item.id)}
                          className="h-8 text-[11px] font-black uppercase tracking-wider bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] rounded-full px-3 gap-1 shadow cursor-pointer whitespace-nowrap"
                        >
                          {isProcessingBoth ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          <span>Approve Both</span>
                        </Button>
                      )}

                      {/* View Details Drawer */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenDetails(item.id)}
                        className="h-8 text-[11px] font-black uppercase tracking-wider border-white/20 text-white hover:bg-white/10 rounded-full px-3 gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Eye className="h-3.5 w-3.5 text-[#FFFF00]" />
                        <span>View Details</span>
                      </Button>

                      {/* Suspend or Unsuspend Member */}
                      {isSuspended ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isProcessingSuspend || isPending}
                          onClick={() =>
                            setUnsuspendModal({
                              isOpen: true,
                              item,
                              notes: '',
                            })
                          }
                          className="h-8 text-[11px] font-black uppercase tracking-wider border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/20 rounded-full px-3 gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>Unsuspend</span>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isProcessingSuspend || isPending}
                          onClick={() =>
                            setSuspendModal({
                              isOpen: true,
                              item,
                              reason: '',
                            })
                          }
                          className="h-8 text-[11px] font-black uppercase tracking-wider text-red-300/80 hover:text-red-300 hover:bg-red-500/15 rounded-full px-3 gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          <span>Suspend</span>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-xs text-white/60">
                Showing {Math.min((page - 1) * pageSize + 1, totalCount)} to{' '}
                {Math.min(page * pageSize, totalCount)} of {totalCount} members
              </span>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 rounded-full border-white/20 text-white hover:bg-white/10 px-3 text-xs font-bold gap-1 cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </Button>

                <span className="text-xs font-bold px-2 py-1 rounded bg-[#0A0A7A] border border-white/10">
                  Page {page} of {totalPages}
                </span>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages || isLoading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 rounded-full border-white/20 text-white hover:bg-white/10 px-3 text-xs font-bold gap-1 cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Member Verification Details Slide-Over / Modal */}
      {selectedMemberId && (
        <div className="fixed inset-0 z-50 flex items-center justify-end">
          <div
            className="fixed inset-0 bg-[#08088F]/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setSelectedMemberId(null)}
          />
          <div className="relative w-full max-w-2xl h-full bg-[#1818D4] border-l border-white/20 shadow-2xl z-10 overflow-y-auto p-6 sm:p-8 space-y-6 text-white animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <Badge className="bg-[#0A0A7A] text-[#FFFF00] border border-white/20 text-[10px] font-black uppercase tracking-wider">
                  Member Details Desk
                </Badge>
              </div>
              <button
                onClick={() => setSelectedMemberId(null)}
                className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {isLoadingDetails || !memberDetails ? (
              <div className="py-24 text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#FFFF00] mx-auto" />
                <p className="text-xs text-white/70 font-bold uppercase tracking-wider">
                  Loading member verification history...
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Header identity */}
                <div className="p-5 rounded-2xl bg-[#0A0A7A] border border-white/15 flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-[#1818D4] border-2 border-[#FFFF00] flex items-center justify-center text-2xl font-black text-[#FFFF00] font-display shrink-0">
                    {memberDetails.profile.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-black text-white font-display uppercase tracking-wider truncate">
                        {memberDetails.profile.displayName}
                      </h3>
                      {memberDetails.profile.accountStatus === 'suspended' ? (
                        <Badge className="bg-red-500/20 text-red-300 border border-red-500/40 text-[9px] font-black uppercase">
                          Suspended
                        </Badge>
                      ) : (
                        <Badge className="bg-[#00C853]/20 text-[#00E676] border border-[#00C853]/40 text-[9px] font-black uppercase">
                          Active Account
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-white/70 flex items-center gap-1.5 truncate">
                      <Mail className="h-3.5 w-3.5 text-white/40 shrink-0" />
                      <span>{memberDetails.profile.email || 'Email unavailable'}</span>
                    </p>
                    <p className="text-[10px] text-white/50 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Registered {new Date(memberDetails.profile.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Identity & Verification Status Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* eFootball Handle */}
                  <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-white/60 flex items-center gap-1">
                        <Gamepad2 className="h-3.5 w-3.5 text-[#FFFF00]" />
                        eFootball ID
                      </span>
                      {memberDetails.profile.efootballIdVerified ? (
                        <Badge className="bg-[#00C853]/20 text-[#00E676] border border-[#00C853]/30 text-[9px] font-bold py-0">
                          Verified
                        </Badge>
                      ) : (
                        <Badge className="bg-[#FFFF00]/20 text-[#FFFF00] border border-[#FFFF00]/30 text-[9px] font-bold py-0">
                          Pending
                        </Badge>
                      )}
                    </div>
                    <div className="font-mono text-sm font-black text-white tracking-widest bg-[#1818D4] px-2.5 py-1.5 rounded border border-white/10">
                      {memberDetails.profile.efootballId}
                    </div>
                    {memberDetails.profile.efootballRejectionReason && (
                      <p className="text-[10px] text-red-300 italic">
                        Rejection: {memberDetails.profile.efootballRejectionReason}
                      </p>
                    )}
                  </div>

                  {/* WhatsApp Contact */}
                  <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-white/60 flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5 text-[#00C853]" />
                        WhatsApp Contact
                      </span>
                      {memberDetails.profile.whatsappVerified ? (
                        <Badge className="bg-[#00C853]/20 text-[#00E676] border border-[#00C853]/30 text-[9px] font-bold py-0">
                          Verified
                        </Badge>
                      ) : (
                        <Badge className="bg-[#FFFF00]/20 text-[#FFFF00] border border-[#FFFF00]/30 text-[9px] font-bold py-0">
                          Pending
                        </Badge>
                      )}
                    </div>
                    <div className="font-mono text-sm font-bold text-white bg-[#1818D4] px-2.5 py-1.5 rounded border border-white/10 flex items-center justify-between">
                      <span>{memberDetails.profile.whatsappNumber || 'Not Set'}</span>
                      {memberDetails.profile.whatsappNumber && (
                        <button
                          onClick={() => {
                            const clean = memberDetails.profile.whatsappNumber.replace(/\D/g, '');
                            window.open(`https://wa.me/${clean}`, '_blank', 'noopener,noreferrer');
                          }}
                          className="text-[#25D366] hover:underline text-[10px] font-bold flex items-center gap-1"
                        >
                          <MessageCircle className="h-3 w-3" />
                          Chat
                        </button>
                      )}
                    </div>
                    {memberDetails.profile.whatsappRejectionReason && (
                      <p className="text-[10px] text-red-300 italic">
                        Rejection: {memberDetails.profile.whatsappRejectionReason}
                      </p>
                    )}
                  </div>
                </div>

                {/* Registered Tournaments Section */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-white/80 flex items-center gap-1.5">
                    <Trophy className="h-4 w-4 text-[#FFFF00]" />
                    <span>Registered Tournaments ({memberDetails.tournaments.length})</span>
                  </h4>
                  {memberDetails.tournaments.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/10 text-xs text-white/50 text-center">
                      No tournament registrations recorded for this player.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {memberDetails.tournaments.map((t) => (
                        <div
                          key={t.id}
                          className="p-3 rounded-xl bg-[#0A0A7A] border border-white/10 flex items-center justify-between text-xs"
                        >
                          <span className="font-bold text-white">{t.tournamentName}</span>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-white/10 text-white/80 border-0 text-[10px] capitalize">
                              {t.status}
                            </Badge>
                            <span className="text-[10px] text-white/50">
                              {new Date(t.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Internal Admin Notes */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-white/80 flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-[#FFFF00]" />
                      <span>Internal Admin Notes (Private)</span>
                    </h4>
                  </div>
                  <textarea
                    rows={3}
                    value={adminNoteInput}
                    onChange={(e) => setAdminNoteInput(e.target.value)}
                    placeholder="Enter private compliance notes regarding this player..."
                    className="w-full rounded-2xl bg-[#0A0A7A] border border-white/20 p-3 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#FFFF00]"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleSaveAdminNote}
                      disabled={isSavingNote}
                      className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-full h-8 px-4 cursor-pointer gap-1.5"
                    >
                      {isSavingNote && <Loader2 className="h-3 w-3 animate-spin" />}
                      <span>Save Note</span>
                    </Button>
                  </div>
                </div>

                {/* Immutable Audit Trail Section */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-white/80 flex items-center gap-1.5">
                    <History className="h-4 w-4 text-[#FFFF00]" />
                    <span>Compliance Audit Log ({memberDetails.auditHistory.length})</span>
                  </h4>
                  {memberDetails.auditHistory.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/10 text-xs text-white/50 text-center">
                      No prior administrative audit events recorded for this user.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {memberDetails.auditHistory.map((audit) => (
                        <div
                          key={audit.id}
                          className="p-3 rounded-xl bg-[#0A0A7A] border border-white/10 space-y-1 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[11px] font-bold text-[#FFFF00]">
                              {audit.action}
                            </span>
                            <span className="text-[10px] text-white/50">
                              {new Date(audit.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {audit.reason && (
                            <p className="text-[11px] text-white/80">
                              <span className="text-white/50">Reason: </span>
                              {audit.reason}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Reject Verification Modal */}
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
                  Reject {rejectModal.target === 'whatsapp' ? 'WhatsApp Contact' : 'eFootball ID'}
                </h3>
                <p className="text-xs text-white/70">
                  Player: <strong className="text-white">{rejectModal.item.displayName}</strong>
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-white/80 block">
                Reason for Rejection (Visible to Player) <span className="text-red-400">*</span>
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
                      className="text-[10px] bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-full text-white/80 cursor-pointer"
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
                      className="text-[10px] bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-full text-white/80 cursor-pointer"
                    >
                      Invalid Format
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRejectModal((prev) => ({
                          ...prev,
                          reason: 'Sender WhatsApp profile does not match registered account.',
                        }))
                      }
                      className="text-[10px] bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-full text-white/80 cursor-pointer"
                    >
                      Wrong User
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
                      className="text-[10px] bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-full text-white/80 cursor-pointer"
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
                      className="text-[10px] bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-full text-white/80 cursor-pointer"
                    >
                      Name Mismatch
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRejectModal((prev) => ({
                          ...prev,
                          reason: 'Format does not meet Konami requirements (ABCD-123-456-789).',
                        }))
                      }
                      className="text-[10px] bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-full text-white/80 cursor-pointer"
                    >
                      Format Invalid
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
                disabled={!rejectModal.reason.trim()}
                className="bg-red-500 hover:bg-red-600 text-white rounded-full h-10 px-6 text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Revoke Verification Modal */}
      {revokeModal.isOpen && revokeModal.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#08088F]/85 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setRevokeModal((prev) => ({ ...prev, isOpen: false }))}
          />
          <div className="relative w-full max-w-md bg-[#1818D4] rounded-[32px] border border-amber-400/40 shadow-2xl p-6 sm:p-8 z-10 space-y-5 animate-in zoom-in-95 duration-200 text-white">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-300">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black font-display uppercase tracking-wider text-white">
                  Revoke Verification Status
                </h3>
                <p className="text-xs text-white/70">
                  Player: <strong className="text-white">{revokeModal.item.displayName}</strong>
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-white/70 block">
                Target Verification to Revoke
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRevokeModal((prev) => ({ ...prev, target: 'both' }))}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all',
                    revokeModal.target === 'both'
                      ? 'bg-amber-400 text-[#08088F]'
                      : 'bg-[#1818D4] text-white/70 hover:text-white'
                  )}
                >
                  Both
                </button>
                <button
                  type="button"
                  onClick={() => setRevokeModal((prev) => ({ ...prev, target: 'whatsapp' }))}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all',
                    revokeModal.target === 'whatsapp'
                      ? 'bg-amber-400 text-[#08088F]'
                      : 'bg-[#1818D4] text-white/70 hover:text-white'
                  )}
                >
                  WhatsApp Only
                </button>
                <button
                  type="button"
                  onClick={() => setRevokeModal((prev) => ({ ...prev, target: 'efootball' }))}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all',
                    revokeModal.target === 'efootball'
                      ? 'bg-amber-400 text-[#08088F]'
                      : 'bg-[#1818D4] text-white/70 hover:text-white'
                  )}
                >
                  eFootball ID Only
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-white/80 block">
                Mandatory Revocation Reason <span className="text-red-400">*</span>
              </label>
              <textarea
                value={revokeModal.reason}
                onChange={(e) => setRevokeModal((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="State clearly why verification is being revoked (e.g. In-game handle changed, WhatsApp reassigned, fraudulent match submission)..."
                rows={3}
                className="w-full rounded-2xl bg-[#0A0A7A] border border-white/20 p-3 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => setRevokeModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-white/70 hover:text-white hover:bg-white/10 rounded-full h-10 px-5 text-xs font-black uppercase cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmRevocation}
                disabled={!revokeModal.reason.trim()}
                className="bg-amber-500 hover:bg-amber-600 text-[#08088F] rounded-full h-10 px-6 text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                Confirm Revocation
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Suspend Member Modal */}
      {suspendModal.isOpen && suspendModal.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#08088F]/85 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setSuspendModal((prev) => ({ ...prev, isOpen: false }))}
          />
          <div className="relative w-full max-w-md bg-[#1818D4] rounded-[32px] border border-red-500/40 shadow-2xl p-6 sm:p-8 z-10 space-y-5 animate-in zoom-in-95 duration-200 text-white">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/20 text-red-400">
                <Ban className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black font-display uppercase tracking-wider text-white">
                  Suspend Member Account
                </h3>
                <p className="text-xs text-white/70">
                  Player: <strong className="text-white">{suspendModal.item.displayName}</strong>
                </p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-red-950/20 border border-red-500/30 text-xs text-red-200 space-y-1">
              <span className="font-bold text-red-300 block">Consequences of Suspension:</span>
              <p>
                The member will be blocked from registering for tournaments and participating in active matches. This action is permanently audited.
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-white/80 block">
                Mandatory Suspension Reason <span className="text-red-400">*</span>
              </label>
              <textarea
                value={suspendModal.reason}
                onChange={(e) => setSuspendModal((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="State the rule violation or reason for suspension (e.g. Unsportsmanlike conduct, match fraud, toxic behavior)..."
                rows={3}
                className="w-full rounded-2xl bg-[#0A0A7A] border border-white/20 p-3 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => setSuspendModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-white/70 hover:text-white hover:bg-white/10 rounded-full h-10 px-5 text-xs font-black uppercase cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmSuspension}
                disabled={!suspendModal.reason.trim()}
                className="bg-red-600 hover:bg-red-700 text-white rounded-full h-10 px-6 text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                Confirm Suspension
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Unsuspend Member Modal */}
      {unsuspendModal.isOpen && unsuspendModal.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#08088F]/85 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setUnsuspendModal((prev) => ({ ...prev, isOpen: false }))}
          />
          <div className="relative w-full max-w-md bg-[#1818D4] rounded-[32px] border border-emerald-500/40 shadow-2xl p-6 sm:p-8 z-10 space-y-5 animate-in zoom-in-95 duration-200 text-white">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black font-display uppercase tracking-wider text-white">
                  Restore Member to Active
                </h3>
                <p className="text-xs text-white/70">
                  Player: <strong className="text-white">{unsuspendModal.item.displayName}</strong>
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-white/80 block">
                Optional Admin Reinstatement Notes
              </label>
              <textarea
                value={unsuspendModal.notes}
                onChange={(e) => setUnsuspendModal((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="e.g. Player resolved appeal with tournament organizers."
                rows={2}
                className="w-full rounded-2xl bg-[#0A0A7A] border border-white/20 p-3 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => setUnsuspendModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-white/70 hover:text-white hover:bg-white/10 rounded-full h-10 px-5 text-xs font-black uppercase cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmUnsuspension}
                className="bg-[#00C853] hover:bg-[#00B048] text-[#08088F] rounded-full h-10 px-6 text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Confirm Reinstatement
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
