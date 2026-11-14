import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth/server';
import AdminLayoutClient from '@/components/admin/AdminLayoutClient';
import { getTicketOverviewStats } from '@/services/ticketService';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin Dashboard | eFootball Tournament',
  description: 'Administrative portal for managing tournaments, fixtures, and settings.',
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Leverages request-cached getAuthenticatedUser (1 single auth + database admin check across the request)
  const { user, isAdmin, adminRole } = await getAuthenticatedUser();

  // 1. Enforce active authentication
  if (!user) {
    redirect('/login');
  }

  // 2. Enforce database-authoritative administrator authorization
  // Any valid active administrator role (streamer, moderator, admin, super_admin) is permitted into the portal
  if (!isAdmin || !adminRole) {
    redirect('/dashboard?error=admin_unauthorized');
  }

  let ticketStats = { totalOpen: 0, urgent: 0 };
  try {
    ticketStats = await getTicketOverviewStats();
  } catch (err) {
    console.error('Failed to load ticket stats in admin layout:', err);
  }

  return (
    <AdminLayoutClient
      adminEmail={user.email}
      unresolvedTicketCount={ticketStats.totalOpen}
      hasUrgentTickets={ticketStats.urgent > 0}
    >
      {children}
    </AdminLayoutClient>
  );
}
