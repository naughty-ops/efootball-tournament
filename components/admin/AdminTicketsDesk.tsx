'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ShieldAlert,
  Search,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Trophy,
  RotateCcw,
  UserCheck,
  Ticket,
  BarChart3,
  Flame,
  AlertCircle,
  CheckSquare,
  Square,
  Users,
  Swords,
  Timer,
  TrendingUp,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/utils';
import type {
  UnifiedTicket,
  TicketOverviewStats,
  OperationalAlerts,
  TicketPerformanceMetrics,
  TicketStatus,
  TicketPriority,
  TicketView,
} from '@/types/tickets';
import {
  updateTicketStatusAction,
  updateTicketPriorityAction,
  assignTicketAction,
  bulkAssignTicketsAction,
  bulkUpdateTicketPriorityAction,
  bulkUpdateTicketStatusAction,
} from '@/app/actions/ticketActions';

interface AdminTicketsDeskProps {
  initialTickets: UnifiedTicket[];
  totalTickets: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  stats: TicketOverviewStats;
  alerts?: OperationalAlerts;
  performance?: TicketPerformanceMetrics;
  tournaments: { id: string; name: string }[];
  currentAdminEmail: string;
}

export default function AdminTicketsDesk({
  initialTickets,
  totalTickets,
  currentPage,
  pageSize,
  totalPages,
  stats,
  alerts,
  performance,
  tournaments,
  currentAdminEmail,
}: AdminTicketsDeskProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // URL state helpers
  const activeView = (searchParams.get('view') || 'all') as TicketView;
  const activeStatus = searchParams.get('status') || 'all';
  const activeCategory = searchParams.get('category') || 'all';
  const activePriority = searchParams.get('priority') || 'all';
  const activeSearch = searchParams.get('search') || '';
  const activeTournament = searchParams.get('tournament') || 'all';
  const activeSort = searchParams.get('sortBy') || 'newest';
  const activeUnassigned = searchParams.get('unassigned') === 'true';
  const activeOverdue = searchParams.get('overdue') === 'true';

  const [searchInput, setSearchInput] = useState(activeSearch);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showMetrics, setShowMetrics] = useState(false);

  // Bulk Selection State
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const [bulkModalType, setBulkModalType] = useState<'assign' | 'priority' | 'status' | null>(null);
  const [bulkStatus, setBulkStatus] = useState<TicketStatus>('under_investigation');
  const [bulkPriority, setBulkPriority] = useState<TicketPriority>('high');
  const [bulkAssignEmail, setBulkAssignEmail] = useState<string>(currentAdminEmail);

  // Quick Action Modal State (Single ticket)
  const [quickActionTicket, setQuickActionTicket] = useState<UnifiedTicket | null>(null);
  const [modalType, setModalType] = useState<'status' | 'priority' | 'assign' | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<TicketStatus>('under_investigation');
  const [selectedPriority, setSelectedPriority] = useState<TicketPriority>('high');
  const [assignEmail, setAssignEmail] = useState<string>(currentAdminEmail);

  const updateFilters = (newParams: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([key, val]) => {
      if (val === null || val === 'all' || val === '') {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    });
    // Reset to page 1 on filter change
    if (!newParams.page) {
      params.set('page', '1');
    }
    startTransition(() => {
      router.push(`/admin/tickets?${params.toString()}`);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ search: searchInput.trim() });
  };

  // Bulk Selection Handlers
  const toggleSelectAll = () => {
    if (selectedTicketIds.size === initialTickets.length && initialTickets.length > 0) {
      setSelectedTicketIds(new Set());
    } else {
      setSelectedTicketIds(new Set(initialTickets.map((t) => t.id)));
    }
  };

  const toggleSelectTicket = (id: string) => {
    const next = new Set(selectedTicketIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTicketIds(next);
  };

  const getSelectedTicketObjects = () => {
    return initialTickets
      .filter((t) => selectedTicketIds.has(t.id))
      .map((t) => ({ id: t.id, source: t.source }));
  };

  // Bulk Operations Submit Handlers
  const handleBulkAssignSubmit = async () => {
    const tickets = getSelectedTicketObjects();
    if (tickets.length === 0) return;
    try {
      const res = await bulkAssignTicketsAction({
        tickets,
        adminId: bulkAssignEmail ? 'admin' : null,
        adminEmail: bulkAssignEmail || null,
        explanation: `Bulk assigned to ${bulkAssignEmail || 'unassigned'}`,
      });
      if (res.success) {
        setActionFeedback({ type: 'success', message: res.message || 'Bulk assignment complete.' });
        setSelectedTicketIds(new Set());
        setBulkModalType(null);
        router.refresh();
      } else {
        setActionFeedback({ type: 'error', message: res.error || 'Failed to bulk assign.' });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message });
    }
  };

  const handleBulkPrioritySubmit = async () => {
    const tickets = getSelectedTicketObjects();
    if (tickets.length === 0) return;
    try {
      const res = await bulkUpdateTicketPriorityAction({
        tickets,
        priority: bulkPriority,
        explanation: `Bulk priority changed to ${bulkPriority}`,
      });
      if (res.success) {
        setActionFeedback({ type: 'success', message: res.message || 'Bulk priority updated.' });
        setSelectedTicketIds(new Set());
        setBulkModalType(null);
        router.refresh();
      } else {
        setActionFeedback({ type: 'error', message: res.error || 'Failed to bulk update priority.' });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message });
    }
  };

  const handleBulkStatusSubmit = async () => {
    const tickets = getSelectedTicketObjects();
    if (tickets.length === 0) return;
    try {
      const res = await bulkUpdateTicketStatusAction({
        tickets,
        status: bulkStatus,
        explanation: `Bulk status updated to ${bulkStatus}`,
      });
      if (res.success) {
        setActionFeedback({ type: 'success', message: res.message || 'Bulk status updated.' });
        setSelectedTicketIds(new Set());
        setBulkModalType(null);
        router.refresh();
      } else {
        setActionFeedback({ type: 'error', message: res.error || 'Failed to bulk update status.' });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message });
    }
  };

  // Single Quick Action Handlers
  const handleQuickStatusSubmit = async () => {
    if (!quickActionTicket) return;
    try {
      const res = await updateTicketStatusAction({
        ticketId: quickActionTicket.id,
        source: quickActionTicket.source,
        status: selectedStatus,
        explanation: `Status updated via Quick Action to ${selectedStatus}`,
      });
      if (res.success) {
        setActionFeedback({ type: 'success', message: res.message || 'Status updated.' });
        setQuickActionTicket(null);
        router.refresh();
      } else {
        setActionFeedback({ type: 'error', message: res.error || 'Failed to update status.' });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message });
    }
  };

  const handleQuickPrioritySubmit = async () => {
    if (!quickActionTicket) return;
    try {
      const res = await updateTicketPriorityAction({
        ticketId: quickActionTicket.id,
        source: quickActionTicket.source,
        priority: selectedPriority,
        explanation: `Priority updated via Quick Action to ${selectedPriority}`,
      });
      if (res.success) {
        setActionFeedback({ type: 'success', message: res.message || 'Priority updated.' });
        setQuickActionTicket(null);
        router.refresh();
      } else {
        setActionFeedback({ type: 'error', message: res.error || 'Failed to update priority.' });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message });
    }
  };

  const handleQuickAssignSubmit = async () => {
    if (!quickActionTicket) return;
    try {
      const res = await assignTicketAction({
        ticketId: quickActionTicket.id,
        source: quickActionTicket.source,
        adminId: assignEmail ? 'admin' : null,
        adminEmail: assignEmail || null,
        explanation: assignEmail ? `Assigned to ${assignEmail}` : 'Unassigned',
      });
      if (res.success) {
        setActionFeedback({ type: 'success', message: res.message || 'Assignment updated.' });
        setQuickActionTicket(null);
        router.refresh();
      } else {
        setActionFeedback({ type: 'error', message: res.error || 'Failed to assign.' });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message });
    }
  };

  // View Switcher options
  const viewTabs: { key: TicketView; label: string; count?: number | null }[] = [
    { key: 'all', label: 'All Tickets', count: stats.totalTickets },
    { key: 'my_assigned', label: 'My Assigned' },
    { key: 'unassigned', label: 'Unassigned', count: stats.unassigned },
    { key: 'urgent', label: 'Urgent', count: stats.urgent },
    { key: 'disputes', label: 'Match Disputes' },
    { key: 'support', label: 'Player Support' },
    { key: 'awaiting_player', label: 'Awaiting Player', count: stats.waitingForPlayer },
    { key: 'overdue', label: 'Overdue', count: stats.overdueCount },
    { key: 'resolved', label: 'Resolved', count: stats.resolved },
    { key: 'rejected', label: 'Rejected', count: stats.rejected },
  ];

  return (
    <div className="space-y-6 text-white pb-16">
      {/* Top Header & Console Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFFF00] text-[#08088F] text-[11px] font-black uppercase tracking-widest mb-2">
            <Ticket className="h-3.5 w-3.5" />
            <span>Ticket Operations Centre</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white font-display uppercase tracking-wider">
            Ticket Operations Centre
          </h1>
          <p className="text-xs sm:text-sm text-white/70 mt-1">
            Operational workspace for triage, dispute adjudication, SLA tracking, and resolution
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => setShowMetrics(!showMetrics)}
            variant="outline"
            size="sm"
            className={`rounded-full border-white/20 text-xs font-bold gap-1.5 transition-colors cursor-pointer ${
              showMetrics ? 'bg-[#FFFF00] text-[#08088F]' : 'bg-[#0A0A7A] hover:bg-white/10 text-white'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>SLA & Metrics</span>
          </Button>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-full border-white/20 bg-[#0A0A7A] hover:bg-white/10 text-white text-xs font-bold"
          >
            <Link href="/admin/dashboard">
              <ChevronLeft className="h-4 w-4 mr-1" />
              <span>Dashboard</span>
            </Link>
          </Button>

          <Button
            onClick={() => router.refresh()}
            variant="outline"
            size="sm"
            className="rounded-full border-white/20 bg-[#0A0A7A] hover:bg-white/10 text-white text-xs font-bold gap-1.5 cursor-pointer"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold animate-in fade-in ${
            actionFeedback.type === 'success'
              ? 'bg-[#00C853]/20 border border-[#00C853]/40 text-[#00C853]'
              : 'bg-[#FF3B30]/20 border border-[#FF3B30]/40 text-[#FF3B30]'
          }`}
        >
          <span>{actionFeedback.message}</span>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-white/60 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* SLA & PERFORMANCE METRICS DRAWER */}
      {showMetrics && performance && (
        <Card className="bg-[#1818D4] border border-[#FFFF00]/40 rounded-[28px] p-6 shadow-2xl animate-in slide-in-from-top-4 duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-white/15 mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-[#FFFF00]" />
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Accountability & SLA Performance Metrics
              </h3>
            </div>
            <span className="text-[11px] text-[#FFFF00] font-mono font-bold">Realtime Telemetry</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-2xl bg-[#0A0A7A] border border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">First Response</span>
              <p className="text-xl font-black text-[#FFFF00] mt-1 font-mono">
                {performance.avgFirstResponseMinutes !== null ? `${performance.avgFirstResponseMinutes}m` : 'N/A'}
              </p>
              <span className="text-[10px] text-white/60">Target: &lt; 30m</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0A0A7A] border border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">Avg Resolution</span>
              <p className="text-xl font-black text-[#00C853] mt-1 font-mono">
                {performance.avgResolutionHours !== null ? `${performance.avgResolutionHours}h` : 'N/A'}
              </p>
              <span className="text-[10px] text-white/60">Target: &lt; 24h</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0A0A7A] border border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">Dispute Resolution</span>
              <p className="text-xl font-black text-[#FF9500] mt-1 font-mono">
                {performance.avgDisputeResolutionHours !== null ? `${performance.avgDisputeResolutionHours}h` : 'N/A'}
              </p>
              <span className="text-[10px] text-white/60">Strict SLA: 2h</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0A0A7A] border border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">Reopened Rate</span>
              <p className="text-xl font-black text-white mt-1 font-mono">
                {performance.reopenedPercentage}%
              </p>
              <span className="text-[10px] text-white/60">Threshold: &lt; 5%</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0A0A7A] border border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">Overdue Rate</span>
              <p className={`text-xl font-black mt-1 font-mono ${performance.overduePercentage > 0 ? 'text-[#FF3B30]' : 'text-[#00C853]'}`}>
                {performance.overduePercentage}%
              </p>
              <span className="text-[10px] text-white/60">Strict 0% Target</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0A0A7A] border border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">Active Operators</span>
              <p className="text-xl font-black text-[#38BDF8] mt-1 font-mono">
                {performance.resolvedByAdmin.length || 1}
              </p>
              <span className="text-[10px] text-white/60">Team Resolution</span>
            </div>
          </div>
        </Card>
      )}

      {/* 7 CLICKABLE KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* 1. Total Tickets */}
        <button
          onClick={() => updateFilters({ view: 'all', status: null, priority: null, unassigned: null })}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer focus:outline-none ${
            activeView === 'all' && activeStatus === 'all' && !activeUnassigned
              ? 'bg-[#1818D4] border-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.3)]'
              : 'bg-[#1818D4]/70 border-white/15 hover:border-white/30'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">Total Tickets</span>
          <div className="mt-1 text-2xl font-black text-white font-display">{stats.totalTickets}</div>
          <span className="text-[10px] text-[#FFFF00] font-bold">All Submissions</span>
        </button>

        {/* 2. Open Tickets */}
        <button
          onClick={() => updateFilters({ view: 'all', status: 'open', priority: null, unassigned: null })}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer focus:outline-none ${
            activeStatus === 'open'
              ? 'bg-[#1818D4] border-[#38BDF8] shadow-[0_0_15px_rgba(56,189,248,0.3)]'
              : 'bg-[#1818D4]/70 border-white/15 hover:border-white/30'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">Open Tickets</span>
          <div className="mt-1 text-2xl font-black text-[#38BDF8] font-display">{stats.totalOpen}</div>
          <span className="text-[10px] text-[#38BDF8]/80 font-bold">Unresolved</span>
        </button>

        {/* 3. Unassigned */}
        <button
          onClick={() => updateFilters({ view: 'unassigned', status: null, priority: null, unassigned: 'true' })}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer focus:outline-none ${
            activeView === 'unassigned' || activeUnassigned
              ? 'bg-[#1818D4] border-[#FF9500] shadow-[0_0_15px_rgba(255,149,0,0.3)]'
              : 'bg-[#1818D4]/70 border-white/15 hover:border-white/30'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">Unassigned</span>
          <div className="mt-1 text-2xl font-black text-[#FF9500] font-display">{stats.unassigned}</div>
          <span className="text-[10px] text-[#FF9500]/80 font-bold">Needs Triage</span>
        </button>

        {/* 4. Urgent */}
        <button
          onClick={() => updateFilters({ view: 'urgent', priority: 'urgent', status: null, unassigned: null })}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer focus:outline-none ${
            activeView === 'urgent' || activePriority === 'urgent'
              ? 'bg-[#1818D4] border-[#FF3B30] shadow-[0_0_15px_rgba(255,59,48,0.3)]'
              : 'bg-[#1818D4]/70 border-white/15 hover:border-white/30'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#FF3B30] animate-pulse" /> Urgent
          </span>
          <div className="mt-1 text-2xl font-black text-[#FF3B30] font-display">{stats.urgent}</div>
          <span className="text-[10px] text-[#FF3B30]/80 font-bold">Critical SLA</span>
        </button>

        {/* 5. Awaiting Player */}
        <button
          onClick={() => updateFilters({ view: 'awaiting_player', status: 'waiting_for_player', priority: null, unassigned: null })}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer focus:outline-none ${
            activeView === 'awaiting_player' || activeStatus === 'waiting_for_player'
              ? 'bg-[#1818D4] border-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.3)]'
              : 'bg-[#1818D4]/70 border-white/15 hover:border-white/30'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">Awaiting Player</span>
          <div className="mt-1 text-2xl font-black text-[#FFFF00] font-display">{stats.waitingForPlayer}</div>
          <span className="text-[10px] text-[#FFFF00]/80 font-bold">Evidence Pending</span>
        </button>

        {/* 6. Under Investigation */}
        <button
          onClick={() => updateFilters({ view: null, status: 'under_investigation', priority: null, unassigned: null })}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer focus:outline-none ${
            activeStatus === 'under_investigation'
              ? 'bg-[#1818D4] border-[#38BDF8] shadow-[0_0_15px_rgba(56,189,248,0.3)]'
              : 'bg-[#1818D4]/70 border-white/15 hover:border-white/30'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">Investigation</span>
          <div className="mt-1 text-2xl font-black text-[#38BDF8] font-display">{stats.underInvestigation}</div>
          <span className="text-[10px] text-[#38BDF8]/80 font-bold">Active In-Depth</span>
        </button>

        {/* 7. Resolved */}
        <button
          onClick={() => updateFilters({ view: 'resolved', status: 'resolved', priority: null, unassigned: null })}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer focus:outline-none ${
            activeView === 'resolved' || activeStatus === 'resolved'
              ? 'bg-[#1818D4] border-[#00C853] shadow-[0_0_15px_rgba(0,200,83,0.3)]'
              : 'bg-[#1818D4]/70 border-white/15 hover:border-white/30'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">Resolved</span>
          <div className="mt-1 text-2xl font-black text-[#00C853] font-display">{stats.resolved}</div>
          <span className="text-[10px] text-[#00C853]/80 font-bold">Closed</span>
        </button>
      </div>

      {/* OPERATIONAL ALERTS BANNER */}
      {alerts && (alerts.criticalUnresolved > 0 || alerts.overdueCount > 0 || alerts.unassignedCount > 0 || alerts.disputesNeedingAction > 0) && (
        <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/20 flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#FFFF00] font-black uppercase tracking-wider text-[11px] shrink-0">
            <Flame className="h-4 w-4 text-[#FF3B30] animate-pulse" />
            <span>Operational Alerts:</span>
          </div>

          {alerts.criticalUnresolved > 0 && (
            <button
              onClick={() => updateFilters({ view: 'urgent', priority: 'urgent' })}
              className="px-2.5 py-1 rounded-full bg-[#FF3B30]/20 border border-[#FF3B30]/40 text-[#FF3B30] hover:bg-[#FF3B30]/30 font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#FF3B30]" />
              <span>{alerts.criticalUnresolved} Critical Unresolved</span>
            </button>
          )}

          {alerts.overdueCount > 0 && (
            <button
              onClick={() => updateFilters({ view: 'overdue', overdue: 'true' })}
              className="px-2.5 py-1 rounded-full bg-[#FF3B30]/20 border border-[#FF3B30]/40 text-[#FF3B30] hover:bg-[#FF3B30]/30 font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Clock className="h-3 w-3" />
              <span>{alerts.overdueCount} Overdue SLA</span>
            </button>
          )}

          {alerts.approachingDeadline > 0 && (
            <button
              onClick={() => updateFilters({ sortBy: 'deadline' })}
              className="px-2.5 py-1 rounded-full bg-[#FF9500]/20 border border-[#FF9500]/40 text-[#FF9500] hover:bg-[#FF9500]/30 font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Timer className="h-3 w-3" />
              <span>{alerts.approachingDeadline} Approaching Deadline</span>
            </button>
          )}

          {alerts.unassignedCount > 0 && (
            <button
              onClick={() => updateFilters({ view: 'unassigned', unassigned: 'true' })}
              className="px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white/90 hover:bg-white/20 font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Users className="h-3 w-3 text-[#FFFF00]" />
              <span>{alerts.unassignedCount} Unassigned Triage</span>
            </button>
          )}

          {alerts.disputesNeedingAction > 0 && (
            <button
              onClick={() => updateFilters({ view: 'disputes' })}
              className="px-2.5 py-1 rounded-full bg-[#FF168B]/20 border border-[#FF168B]/40 text-[#FF168B] hover:bg-[#FF168B]/30 font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Swords className="h-3 w-3" />
              <span>{alerts.disputesNeedingAction} Match Disputes</span>
            </button>
          )}

          {alerts.newPlayerResponses > 0 && (
            <button
              onClick={() => updateFilters({ status: 'pending_review' })}
              className="px-2.5 py-1 rounded-full bg-[#38BDF8]/20 border border-[#38BDF8]/40 text-[#38BDF8] hover:bg-[#38BDF8]/30 font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <MessageSquare className="h-3 w-3" />
              <span>{alerts.newPlayerResponses} Player Replies</span>
            </button>
          )}
        </div>
      )}

      {/* VIEW SWITCHER TABS BAR */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-white/10">
        {viewTabs.map((tab) => {
          const isActive = activeView === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => updateFilters({ view: tab.key === 'all' ? null : tab.key, status: null, unassigned: null, overdue: null })}
              className={`shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#FFFF00] text-[#08088F] shadow-[0_0_15px_rgba(255,255,0,0.3)]'
                  : 'bg-[#0A0A7A] text-white/70 hover:text-white hover:bg-white/10 border border-white/10'
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    isActive ? 'bg-[#08088F] text-[#FFFF00]' : 'bg-white/15 text-white'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* SEARCH & FILTERS BAR */}
      <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] p-4 shadow-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="lg:col-span-2 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by Ticket ID, Player Name, Email, Match..."
              className="pl-10 h-10 text-xs bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 rounded-2xl"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  updateFilters({ search: null });
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            )}
          </form>

          {/* Category Dropdown */}
          <div>
            <select
              value={activeCategory}
              onChange={(e) => updateFilters({ category: e.target.value })}
              className="w-full h-10 px-3 text-xs bg-[#0A0A7A] border border-white/20 text-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#FFFF00]"
            >
              <option value="all">All Categories</option>
              <option value="match_dispute">Match Dispute</option>
              <option value="match_not_started">Match Not Started</option>
              <option value="score_disagreement">Score Disagreement</option>
              <option value="screenshot_evidence">Screenshot Evidence</option>
              <option value="player_complaint">Player Complaint</option>
              <option value="tournament_issue">Tournament Issue</option>
              <option value="technical_support">Technical Support</option>
              <option value="other">Other Inquiry</option>
            </select>
          </div>

          {/* Priority Dropdown */}
          <div>
            <select
              value={activePriority}
              onChange={(e) => updateFilters({ priority: e.target.value })}
              className="w-full h-10 px-3 text-xs bg-[#0A0A7A] border border-white/20 text-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#FFFF00]"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">🔴 Urgent</option>
              <option value="high">🟠 High</option>
              <option value="normal">🟡 Normal</option>
              <option value="low">⚪ Low</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div>
            <select
              value={activeSort}
              onChange={(e) => updateFilters({ sortBy: e.target.value })}
              className="w-full h-10 px-3 text-xs bg-[#0A0A7A] border border-white/20 text-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#FFFF00]"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="oldest">Sort: Oldest First</option>
              <option value="priority">Sort: Highest Priority</option>
              <option value="updated">Sort: Recently Updated</option>
              <option value="deadline">Sort: Response Deadline</option>
            </select>
          </div>
        </div>

        {/* Secondary Filter Badges */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/10 text-xs">
          <span className="text-white/50 text-[11px] font-bold uppercase tracking-wider">Quick Filters:</span>

          <button
            onClick={() => updateFilters({ unassigned: activeUnassigned ? null : 'true' })}
            className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
              activeUnassigned
                ? 'bg-[#FF9500] text-black font-black'
                : 'bg-[#0A0A7A] text-white/70 hover:bg-white/10'
            }`}
          >
            Unassigned Only
          </button>

          <button
            onClick={() => updateFilters({ overdue: activeOverdue ? null : 'true' })}
            className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
              activeOverdue
                ? 'bg-[#FF3B30] text-white font-black'
                : 'bg-[#0A0A7A] text-white/70 hover:bg-white/10'
            }`}
          >
            Overdue Only
          </button>

          {tournaments.length > 0 && (
            <select
              value={activeTournament}
              onChange={(e) => updateFilters({ tournament: e.target.value })}
              className="h-7 px-2.5 text-[11px] bg-[#0A0A7A] border border-white/20 text-white rounded-full focus:outline-none"
            >
              <option value="all">Filter by Tournament (All)</option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}

          {(activeView !== 'all' ||
            activeStatus !== 'all' ||
            activeCategory !== 'all' ||
            activePriority !== 'all' ||
            activeSearch ||
            activeTournament !== 'all' ||
            activeUnassigned ||
            activeOverdue) && (
            <button
              onClick={() => {
                setSearchInput('');
                router.push('/admin/tickets');
              }}
              className="ml-auto text-xs text-[#FFFF00] hover:underline font-bold"
            >
              Reset All Filters
            </button>
          )}
        </div>
      </Card>

      {/* BULK ACTIONS FLOATING TOOLBAR */}
      {selectedTicketIds.size > 0 && (
        <div className="sticky top-20 z-40 p-4 rounded-2xl bg-[#08088F] border-2 border-[#FFFF00] shadow-2xl flex flex-wrap items-center justify-between gap-3 text-white animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <Badge className="bg-[#FFFF00] text-[#08088F] font-black uppercase text-xs px-3 py-1">
              {selectedTicketIds.size} Selected
            </Badge>
            <span className="text-xs text-white/80">
              Bulk actions apply to all highlighted tickets
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setBulkModalType('assign')}
              size="sm"
              variant="outline"
              className="rounded-full border-white/30 bg-[#0A0A7A] text-white text-xs font-bold hover:bg-white/10"
            >
              <UserCheck className="h-3.5 w-3.5 mr-1 text-[#00C853]" />
              Assign Admin
            </Button>

            <Button
              onClick={() => setBulkModalType('priority')}
              size="sm"
              variant="outline"
              className="rounded-full border-white/30 bg-[#0A0A7A] text-white text-xs font-bold hover:bg-white/10"
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1 text-[#FF9500]" />
              Set Priority
            </Button>

            <Button
              onClick={() => setBulkModalType('status')}
              size="sm"
              variant="outline"
              className="rounded-full border-white/30 bg-[#0A0A7A] text-white text-xs font-bold hover:bg-white/10"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-[#38BDF8]" />
              Set Status
            </Button>

            <Button
              onClick={() => setSelectedTicketIds(new Set())}
              size="sm"
              variant="ghost"
              className="rounded-full text-white/70 hover:text-white text-xs"
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* ADVANCED TICKETS TABLE */}
      <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] overflow-hidden shadow-2xl">
        {initialTickets.length === 0 ? (
          <div className="py-16 text-center text-white/60 space-y-3">
            <CheckCircle2 className="h-10 w-10 text-[#00C853] mx-auto opacity-80" />
            <h3 className="text-base font-bold text-white">No tickets match your filter criteria</h3>
            <p className="text-xs text-white/60 max-w-sm mx-auto">
              Try selecting a different view tab or resetting search filters to display tickets.
            </p>
            <Button
              onClick={() => {
                setSearchInput('');
                router.push('/admin/tickets');
              }}
              variant="outline"
              size="sm"
              className="rounded-full border-white/20 text-white hover:bg-white/10"
            >
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#0A0A7A]/70 border-b border-white/10 text-[11px] uppercase tracking-wider text-white/60 font-black">
                  <th className="py-3.5 px-3 w-10">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-white/60 hover:text-white cursor-pointer"
                      title="Select all on this page"
                    >
                      {selectedTicketIds.size === initialTickets.length && initialTickets.length > 0 ? (
                        <CheckSquare className="h-4 w-4 text-[#FFFF00]" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3.5 px-3 font-black">Ticket / Source</th>
                  <th className="py-3.5 px-3 font-black">Player</th>
                  <th className="py-3.5 px-3 font-black">Category & Subject</th>
                  <th className="py-3.5 px-3 font-black">Priority</th>
                  <th className="py-3.5 px-3 font-black">Status</th>
                  <th className="py-3.5 px-3 font-black">Assigned</th>
                  <th className="py-3.5 px-3 font-black">Age & Deadline</th>
                  <th className="py-3.5 px-3 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {initialTickets.map((t) => {
                  const isSelected = selectedTicketIds.has(t.id);
                  const isUrgent = t.priority === 'urgent';
                  const isHigh = t.priority === 'high';

                  let statusBadge = 'bg-white/10 text-white';
                  if (t.status === 'open') statusBadge = 'bg-[#3434FF] text-white';
                  else if (t.status === 'pending_review') statusBadge = 'bg-[#FF9500]/20 text-[#FF9500] border border-[#FF9500]/40';
                  else if (t.status === 'under_investigation') statusBadge = 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40';
                  else if (t.status === 'waiting_for_player') statusBadge = 'bg-[#FFFF00]/20 text-[#FFFF00] border border-[#FFFF00]/40';
                  else if (t.status === 'resolved') statusBadge = 'bg-[#00C853]/20 text-[#00C853] border border-[#00C853]/40';
                  else if (t.status === 'rejected') statusBadge = 'bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/40';

                  return (
                    <tr
                      key={t.id}
                      className={`hover:bg-white/5 transition-colors ${isSelected ? 'bg-white/10' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="py-4 px-3">
                        <button
                          type="button"
                          onClick={() => toggleSelectTicket(t.id)}
                          className="text-white/60 hover:text-white cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-[#FFFF00]" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>

                      {/* Ticket Number & Source */}
                      <td className="py-4 px-3 font-mono">
                        <Link
                          href={`/admin/tickets/${t.id}`}
                          className="font-bold text-[#FFFF00] hover:underline flex items-center gap-1.5"
                        >
                          <span>{t.ticket_number}</span>
                        </Link>
                        <div className="flex items-center gap-1 mt-1">
                          {t.source === 'dispute' ? (
                            <span className="px-1.5 py-0.2 rounded bg-[#FF168B]/30 text-[#FF168B] text-[9px] font-black uppercase tracking-wider">
                              Dispute
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded bg-[#38BDF8]/30 text-[#38BDF8] text-[9px] font-black uppercase tracking-wider">
                              Support
                            </span>
                          )}
                          {t.evidence_url && (
                            <span className="px-1.5 py-0.2 rounded bg-[#00C853]/30 text-[#00C853] text-[9px] font-black uppercase">
                              Proof
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Player with Avatar */}
                      <td className="py-4 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-xl bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00] font-black text-xs shrink-0 overflow-hidden relative">
                            {t.avatar_url ? (
                              <Image src={t.avatar_url} alt={t.player_name} fill className="object-cover" />
                            ) : (
                              <span>{t.player_name.slice(0, 2).toUpperCase()}</span>
                            )}
                          </div>
                          <div className="overflow-hidden">
                            <div className="font-bold text-white text-xs truncate max-w-[120px]">{t.player_name}</div>
                            {t.efootball_id ? (
                              <div className="text-[10px] text-white/60 font-mono truncate max-w-[120px]">
                                ID: {t.efootball_id}
                              </div>
                            ) : t.player_email ? (
                              <div className="text-[10px] text-white/50 truncate max-w-[120px]">{t.player_email}</div>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      {/* Subject & Category */}
                      <td className="py-4 px-3 max-w-xs">
                        <Link href={`/admin/tickets/${t.id}`} className="hover:underline">
                          <p className="font-bold text-white truncate text-xs">{t.subject}</p>
                          <p className="text-[11px] text-white/60 line-clamp-1 mt-0.5">{t.description}</p>
                        </Link>
                        <div className="flex items-center gap-1.5 mt-1 text-[10px]">
                          <span className="uppercase font-bold text-white/50 tracking-wider">
                            🏷️ {t.category.replace(/_/g, ' ')}
                          </span>
                          {t.tournament_name && (
                            <span className="text-[#FFFF00]/80 font-bold truncate max-w-[110px]">
                              • 🏆 {t.tournament_name}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="py-4 px-3">
                        <button
                          onClick={() => {
                            setQuickActionTicket(t);
                            setSelectedPriority(t.priority);
                            setModalType('priority');
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider cursor-pointer hover:opacity-80 ${
                            isUrgent
                              ? 'bg-[#FF3B30] text-white shadow-sm'
                              : isHigh
                              ? 'bg-[#FF9500] text-black font-bold'
                              : 'bg-white/10 text-white/80'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isUrgent ? 'bg-white' : isHigh ? 'bg-black' : 'bg-[#FFFF00]'
                            }`}
                          />
                          <span>{t.priority}</span>
                        </button>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-3">
                        <button
                          onClick={() => {
                            setQuickActionTicket(t);
                            setSelectedStatus(t.status);
                            setModalType('status');
                          }}
                          className="cursor-pointer hover:opacity-80"
                        >
                          <Badge className={`${statusBadge} text-[10px] font-bold uppercase tracking-wider px-2.5 py-1`}>
                            {t.status.replace(/_/g, ' ')}
                          </Badge>
                        </button>
                      </td>

                      {/* Assigned Admin */}
                      <td className="py-4 px-3 text-xs">
                        {t.assigned_admin_id ? (
                          <button
                            onClick={() => {
                              setQuickActionTicket(t);
                              setModalType('assign');
                            }}
                            className="flex items-center gap-1 text-[#00C853] hover:underline font-bold cursor-pointer"
                          >
                            <UserCheck className="h-3 w-3" />
                            <span className="truncate max-w-[90px]">Assigned</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setQuickActionTicket(t);
                              setModalType('assign');
                            }}
                            className="text-[#FF9500] hover:underline text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <span>+ Assign</span>
                          </button>
                        )}
                      </td>

                      {/* Age & Response Deadline */}
                      <td className="py-4 px-3 whitespace-nowrap text-[11px]">
                        <div className="text-white font-medium">{t.ticket_age_str}</div>
                        <div className="mt-0.5">
                          {t.deadline_status === 'overdue' ? (
                            <span className="text-[#FF3B30] font-bold flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> Overdue
                            </span>
                          ) : t.deadline_status === 'approaching' ? (
                            <span className="text-[#FF9500] font-bold flex items-center gap-1">
                              <Timer className="h-3 w-3" /> Due Soon
                            </span>
                          ) : (
                            <span className="text-white/40 text-[10px]">Within SLA</span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-3 text-right">
                        <Button
                          asChild
                          size="sm"
                          className="rounded-full bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] font-black text-xs uppercase tracking-wider h-8 px-3.5 cursor-pointer"
                        >
                          <Link href={`/admin/tickets/${t.id}`}>
                            <span>Investigate</span>
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-[#0A0A7A]/40 text-xs">
            <span className="text-white/60">
              Showing Page <span className="font-bold text-white">{currentPage}</span> of{' '}
              <span className="font-bold text-white">{totalPages}</span> ({totalTickets} tickets)
            </span>

            <div className="flex items-center gap-2">
              <Button
                disabled={currentPage <= 1}
                onClick={() => updateFilters({ page: String(currentPage - 1) })}
                variant="outline"
                size="sm"
                className="rounded-full border-white/20 bg-[#0A0A7A] text-white hover:bg-white/10 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                disabled={currentPage >= totalPages}
                onClick={() => updateFilters({ page: String(currentPage + 1) })}
                variant="outline"
                size="sm"
                className="rounded-full border-white/20 bg-[#0A0A7A] text-white hover:bg-white/10 disabled:opacity-40 cursor-pointer"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* BULK ACTION MODAL */}
      {bulkModalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-[#0A0A7A] border border-white/20 rounded-[28px] max-w-md w-full p-6 space-y-4 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="text-base font-black font-display uppercase tracking-wider text-[#FFFF00]">
                  {bulkModalType === 'assign' && 'Bulk Assign Administrator'}
                  {bulkModalType === 'priority' && 'Bulk Change Priority'}
                  {bulkModalType === 'status' && 'Bulk Change Status'}
                </h3>
                <p className="text-xs text-white/70 mt-0.5">
                  Modifying {selectedTicketIds.size} selected tickets
                </p>
              </div>
              <button
                onClick={() => setBulkModalType(null)}
                className="text-white/60 hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {bulkModalType === 'assign' && (
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-white/70">
                  Assign To Admin Email:
                </label>
                <Input
                  value={bulkAssignEmail}
                  onChange={(e) => setBulkAssignEmail(e.target.value)}
                  placeholder="admin@domain.com"
                  className="h-11 text-xs bg-[#1818D4] border-white/20 text-white rounded-2xl"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkModalType(null)}
                    className="rounded-full border-white/20 text-white cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBulkAssignSubmit}
                    className="rounded-full bg-[#FFFF00] text-[#08088F] font-black uppercase text-xs cursor-pointer"
                  >
                    Apply Bulk Assignment
                  </Button>
                </div>
              </div>
            )}

            {bulkModalType === 'priority' && (
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-white/70">
                  Set Priority For All Selected:
                </label>
                <select
                  value={bulkPriority}
                  onChange={(e) => setBulkPriority(e.target.value as TicketPriority)}
                  className="w-full h-11 px-3 text-xs bg-[#1818D4] border border-white/20 text-white rounded-2xl focus:outline-none"
                >
                  <option value="urgent">🔴 Urgent</option>
                  <option value="high">🟠 High</option>
                  <option value="normal">🟡 Normal</option>
                  <option value="low">⚪ Low</option>
                </select>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkModalType(null)}
                    className="rounded-full border-white/20 text-white cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBulkPrioritySubmit}
                    className="rounded-full bg-[#FFFF00] text-[#08088F] font-black uppercase text-xs cursor-pointer"
                  >
                    Apply Priority
                  </Button>
                </div>
              </div>
            )}

            {bulkModalType === 'status' && (
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-white/70">
                  Set Status For All Selected:
                </label>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as TicketStatus)}
                  className="w-full h-11 px-3 text-xs bg-[#1818D4] border border-white/20 text-white rounded-2xl focus:outline-none"
                >
                  <option value="open">OPEN</option>
                  <option value="pending_review">PENDING REVIEW</option>
                  <option value="under_investigation">UNDER INVESTIGATION</option>
                  <option value="waiting_for_player">WAITING FOR PLAYER</option>
                  <option value="resolved">RESOLVED</option>
                  <option value="rejected">REJECTED</option>
                  <option value="closed">CLOSED</option>
                </select>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkModalType(null)}
                    className="rounded-full border-white/20 text-white cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBulkStatusSubmit}
                    className="rounded-full bg-[#FFFF00] text-[#08088F] font-black uppercase text-xs cursor-pointer"
                  >
                    Apply Status
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SINGLE QUICK ACTION MODAL */}
      {quickActionTicket && modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-[#0A0A7A] border border-white/20 rounded-[28px] max-w-md w-full p-6 space-y-4 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="text-base font-black font-display uppercase tracking-wider">
                  {modalType === 'status' && 'Update Ticket Status'}
                  {modalType === 'priority' && 'Change Ticket Priority'}
                  {modalType === 'assign' && 'Assign Administrator'}
                </h3>
                <p className="text-xs text-[#FFFF00] font-mono mt-0.5">
                  Ref: {quickActionTicket.ticket_number}
                </p>
              </div>
              <button
                onClick={() => {
                  setQuickActionTicket(null);
                  setModalType(null);
                }}
                className="text-white/60 hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {modalType === 'status' && (
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-white/70">
                  Select New Status:
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as TicketStatus)}
                  className="w-full h-11 px-3 text-xs bg-[#1818D4] border border-white/20 text-white rounded-2xl focus:outline-none"
                >
                  <option value="open">OPEN</option>
                  <option value="pending_review">PENDING REVIEW</option>
                  <option value="under_investigation">UNDER INVESTIGATION</option>
                  <option value="waiting_for_player">WAITING FOR PLAYER</option>
                  <option value="resolved">RESOLVED</option>
                  <option value="rejected">REJECTED</option>
                  <option value="closed">CLOSED</option>
                </select>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQuickActionTicket(null)}
                    className="rounded-full border-white/20 text-white cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleQuickStatusSubmit}
                    className="rounded-full bg-[#FFFF00] text-[#08088F] font-black uppercase text-xs cursor-pointer"
                  >
                    Save Status
                  </Button>
                </div>
              </div>
            )}

            {modalType === 'priority' && (
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-white/70">
                  Select New Priority:
                </label>
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value as TicketPriority)}
                  className="w-full h-11 px-3 text-xs bg-[#1818D4] border border-white/20 text-white rounded-2xl focus:outline-none"
                >
                  <option value="urgent">🔴 Urgent</option>
                  <option value="high">🟠 High</option>
                  <option value="normal">🟡 Normal</option>
                  <option value="low">⚪ Low</option>
                </select>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQuickActionTicket(null)}
                    className="rounded-full border-white/20 text-white cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleQuickPrioritySubmit}
                    className="rounded-full bg-[#FFFF00] text-[#08088F] font-black uppercase text-xs cursor-pointer"
                  >
                    Save Priority
                  </Button>
                </div>
              </div>
            )}

            {modalType === 'assign' && (
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-white/70">
                  Assignee Email:
                </label>
                <Input
                  value={assignEmail}
                  onChange={(e) => setAssignEmail(e.target.value)}
                  placeholder="admin@domain.com"
                  className="h-11 text-xs bg-[#1818D4] border-white/20 text-white rounded-2xl"
                />

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQuickActionTicket(null)}
                    className="rounded-full border-white/20 text-white cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleQuickAssignSubmit}
                    className="rounded-full bg-[#FFFF00] text-[#08088F] font-black uppercase text-xs cursor-pointer"
                  >
                    Save Assignee
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
