import React from 'react';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/server';
import { getUnifiedTicketById, getTicketMessages, getTicketAuditLogs } from '@/services/ticketService';
import AdminTicketDetailView from '@/components/admin/AdminTicketDetailView';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ticket = await getUnifiedTicketById(id);
  if (!ticket) {
    return { title: 'Ticket Not Found | eFootball Admin' };
  }
  return {
    title: `${ticket.ticket_number} — ${ticket.subject} | eFootball Operations`,
    description: `Investigation console for ticket ${ticket.ticket_number}`,
  };
}

export default async function AdminTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;

  const ticket = await getUnifiedTicketById(id);
  if (!ticket) {
    notFound();
  }

  const isDispute = ticket.source === 'dispute';

  // Admins are authorized to view full conversation history including internal notes
  const [messages, auditLogs] = await Promise.all([
    getTicketMessages(ticket.id, isDispute, true),
    getTicketAuditLogs(ticket.id, isDispute),
  ]);

  return (
    <AdminTicketDetailView
      ticket={ticket}
      messages={messages}
      auditLogs={auditLogs}
      adminEmail={admin.user.email || ''}
    />
  );
}
