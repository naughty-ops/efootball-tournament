import React from 'react';
import { requireAdmin } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import {
  getAllUnifiedTickets,
  getTicketOverviewStats,
  getOperationalAlerts,
  getTicketPerformanceMetrics,
} from '@/services/ticketService';
import AdminTicketsDesk from '@/components/admin/AdminTicketsDesk';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ticket Operations Centre | eFootball Admin',
  description: 'Manage player tickets, conflicting scores, and tournament disputes in one centralized operations hub.',
};

interface PageProps {
  searchParams?: Promise<{
    view?: string;
    status?: string;
    category?: string;
    priority?: string;
    search?: string;
    tournament?: string;
    sortBy?: 'newest' | 'oldest' | 'priority' | 'updated' | 'deadline';
    unassigned?: string;
    overdue?: string;
    page?: string;
  }>;
}

export default async function AdminTicketsPage({ searchParams }: PageProps) {
  const admin = await requireAdmin();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const supabase = await createClient();

  const page = parseInt(resolvedSearchParams.page || '1', 10) || 1;
  const pageSize = 12;

  const [ticketsResult, stats, alerts, performance, tournamentsRes] = await Promise.all([
    getAllUnifiedTickets({
      view: resolvedSearchParams.view,
      status: resolvedSearchParams.status,
      category: resolvedSearchParams.category,
      priority: resolvedSearchParams.priority,
      search: resolvedSearchParams.search,
      tournamentId: resolvedSearchParams.tournament,
      sortBy: resolvedSearchParams.sortBy || 'newest',
      unassigned: resolvedSearchParams.unassigned === 'true',
      overdue: resolvedSearchParams.overdue === 'true',
      currentAdminEmail: admin.user.email || undefined,
      page,
      pageSize,
    }),
    getTicketOverviewStats(),
    getOperationalAlerts(),
    getTicketPerformanceMetrics(),
    (supabase.from('tournaments') as any).select('id, name').order('created_at', { ascending: false }),
  ]);

  const tournaments = (tournamentsRes.data || []) as { id: string; name: string }[];

  return (
    <AdminTicketsDesk
      initialTickets={ticketsResult.tickets}
      totalTickets={ticketsResult.total}
      currentPage={ticketsResult.page}
      pageSize={ticketsResult.pageSize}
      totalPages={ticketsResult.totalPages}
      stats={stats}
      alerts={alerts}
      performance={performance}
      tournaments={tournaments}
      currentAdminEmail={admin.user.email || ''}
    />
  );
}
