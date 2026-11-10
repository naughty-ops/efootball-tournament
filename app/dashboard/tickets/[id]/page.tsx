import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUnifiedTicketById, getTicketMessages } from '@/services/ticketService';
import PlayerTicketConversationView from '@/components/dashboard/PlayerTicketConversationView';
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
    return { title: 'Ticket Not Found | eFootball Hub' };
  }
  return {
    title: `Ticket ${ticket.ticket_number} | eFootball Support`,
    description: `Track resolution and conversation for ticket ${ticket.ticket_number}`,
  };
}

export default async function PlayerTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login?error=unauthorized');
  }

  const { id } = await params;
  const ticket = await getUnifiedTicketById(id);

  if (!ticket) {
    notFound();
  }

  // Strict ownership check: Player must be ticket owner or participant
  const isTicketOwner = ticket.user_id === user.id;
  let isParticipant = false;

  if (!isTicketOwner && ticket.source === 'dispute') {
    const { data: p } = await (supabase.from('participants') as any)
      .select('id')
      .eq('user_id', user.id)
      .in('id', [ticket.player_id, ticket.opponent_id].filter(Boolean));
    if (p && p.length > 0) {
      isParticipant = true;
    }
  }

  if (!isTicketOwner && !isParticipant) {
    redirect('/dashboard/tickets?error=unauthorized');
  }

  const isDispute = ticket.source === 'dispute';

  // NEVER include internal notes for players!
  const messages = await getTicketMessages(ticket.id, isDispute, false);

  return (
    <PlayerTicketConversationView
      ticket={ticket}
      messages={messages}
    />
  );
}
