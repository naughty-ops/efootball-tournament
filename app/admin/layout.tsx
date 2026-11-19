import React from 'react';
import { notFound } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import AdminLayoutClient from '@/components/admin/AdminLayoutClient';
import { getTicketOverviewStats } from '@/services/ticketService';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin Dashboard | eFootball Tournament',
  description: 'Administrative portal for managing tournaments, fixtures, and settings.',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Leverages request-cached getAuthenticatedUser (1 single auth + database admin check across the request)
  const { user, isAdmin, adminRole } = await getAuthenticatedUser();

  // Enforce database-authoritative administrator authorization.
  // Cloak portal: Unauthorized visitors receive a 404 Page Offside error rather than exposing administrative existence.
  if (!user || !isAdmin || !adminRole) {
    notFound();
  }

  let ticketStats = { totalOpen: 0, urgent: 0 };
  try {
    const supabase = await createClient();
    ticketStats = await getTicketOverviewStats(supabase);
  } catch (err) {
    console.error('Failed to load ticket stats in admin layout:', err);
  }

  return (
    <AdminLayoutClient
      adminEmail={user.email}
      adminRole={adminRole}
      unresolvedTicketCount={ticketStats.totalOpen}
      hasUrgentTickets={ticketStats.urgent > 0}
    >
      {children}
    </AdminLayoutClient>
  );
}
