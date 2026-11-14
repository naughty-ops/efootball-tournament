import React from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import PlayerDashboardHeader from '../PlayerDashboardHeader';
import PlayerNotificationsClientView from '@/components/notifications/PlayerNotificationsClientView';
import { getPlayerProfile } from '@/services/playerDashboardService';
import { getPlayerNotifications } from '@/services/notificationService';
import { getPlayerTickets } from '@/services/ticketService';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Alerts & Notifications | Player Dashboard',
  description: 'Stay updated on match kickoff reminders, score verification results, prize payouts, and support tickets.',
};

export default async function PlayerNotificationsPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect('/auth/login?error=unauthorized');
  }

  const supabase = await createClient();

  const [profile, notifications, tickets] = await Promise.all([
    getPlayerProfile(supabase, user.id, user).catch(() => null),
    getPlayerNotifications(supabase, user.id).catch(() => []),
    getPlayerTickets(user.id).catch(() => []),
  ]);

  const fullName = profile?.display_name || user.user_metadata?.full_name || 'Player';
  const email = user.email || '';
  const efootballId = profile?.efootball_id || user.user_metadata?.efootball_id;
  const isVerified = profile?.efootball_id_verified === true;

  const safeNotifications = notifications || [];
  const safeTickets = tickets || [];

  const openTicketsCount = safeTickets.filter(
    (t: any) => t.status === 'open' || t.status === 'in_progress'
  ).length;

  return (
    <div className="pb-16">
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <div className="border-b border-white/10 pb-6">
          <h1 className="text-3xl sm:text-4xl font-black text-white font-display uppercase tracking-wider">
            Alerts & Notifications
          </h1>
          <p className="text-xs sm:text-sm text-white/70 mt-1 max-w-2xl leading-relaxed">
            Stay updated with system announcements, tournament call-ups, match confirmations, and prize payouts.
          </p>
        </div>

        <PlayerNotificationsClientView
          initialNotifications={safeNotifications}
          openTicketsCount={openTicketsCount}
        />
      </main>
    </div>
  );
}
