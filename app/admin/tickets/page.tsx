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

  const isDefaultView =
    !resolvedSearchParams.view &&
    !resolvedSearchParams.status &&
    !resolvedSearchParams.category &&
    !resolvedSearchParams.priority &&
    !resolvedSearchParams.search &&
    !resolvedSearchParams.tournament &&
    (!resolvedSearchParams.sortBy || resolvedSearchParams.sortBy === 'newest') &&
    !resolvedSearchParams.unassigned &&
    !resolvedSearchParams.overdue &&
    page === 1;

  let ticketsResult: Awaited<ReturnType<typeof getAllUnifiedTickets>>;
  let alerts: Awaited<ReturnType<typeof getOperationalAlerts>>;
  let stats: Awaited<ReturnType<typeof getTicketOverviewStats>>;
  let performance: Awaited<ReturnType<typeof getTicketPerformanceMetrics>>;
  let tournamentsRes: any;

  if (isDefaultView) {
    // Optimized single-fetch path: In the default view, one query for the top 200 newest tickets
    // satisfies BOTH the desk display (first 12) AND the operational alerts computation.
    // This completely eliminates redundant dual fetches of unified tickets.
    const [allTickets, fetchedStats, fetchedPerf, tRes] = await Promise.all([
      getAllUnifiedTickets({ pageSize: 200, page: 1 }),
      getTicketOverviewStats(),
      getTicketPerformanceMetrics(),
      (supabase.from('tournaments') as any).select('id, name').order('created_at', { ascending: false }),
    ]);

    stats = fetchedStats;
    performance = fetchedPerf;
    tournamentsRes = tRes;
    alerts = await getOperationalAlerts(allTickets.tickets);

    ticketsResult = {
      tickets: allTickets.tickets.slice(0, pageSize),
      total: allTickets.total,
      page: 1,
      pageSize,
      totalPages: Math.ceil(allTickets.total / pageSize) || 1,
    };
  } else {
    // Filtered/search path: Fetch specific filtered page and alerts in parallel
    const [tResult, allTicketsForAlerts, fetchedStats, fetchedPerf, tRes] = await Promise.all([
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
      getAllUnifiedTickets({ pageSize: 200, page: 1 }),
      getTicketOverviewStats(),
      getTicketPerformanceMetrics(),
      (supabase.from('tournaments') as any).select('id, name').order('created_at', { ascending: false }),
    ]);

    ticketsResult = tResult;
    stats = fetchedStats;
    performance = fetchedPerf;
    tournamentsRes = tRes;
    alerts = await getOperationalAlerts(allTicketsForAlerts.tickets);
  }

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
