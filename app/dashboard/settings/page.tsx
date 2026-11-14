import React from 'react';
import { redirect } from 'next/navigation';
import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import PlayerDashboardHeader from '../PlayerDashboardHeader';
import PlayerDashboardSwipeWrapper from '@/components/dashboard/PlayerDashboardSwipeWrapper';
import PlayerSettingsClientView from '@/components/settings/PlayerSettingsClientView';
import { getPlayerProfile } from '@/services/playerDashboardService';
import { getPlayerPaymentMethods } from '@/services/walletService';
import { getPlayerTickets } from '@/services/ticketService';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Account Settings & Security | Player Hub',
  description: 'Manage your verified gamer identity, payment details, password security, support tickets, and contact administrator.',
};

export default async function PlayerSettingsPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect('/auth/login?error=unauthorized');
  }

  const supabase = await createClient();

  const [profile, paymentMethods, tickets] = await Promise.all([
    getPlayerProfile(supabase, user.id, user).catch(() => null),
    getPlayerPaymentMethods(user.id).catch(() => []),
    getPlayerTickets(user.id).catch(() => []),
  ]);

  const fullName = profile?.display_name || user.user_metadata?.full_name || 'Player';
  const email = user.email || '';
  const efootballId = profile?.efootball_id || user.user_metadata?.efootball_id;
  const isVerified = profile?.efootball_id_verified === true;
  const isEmailVerified = !!user.email_confirmed_at;
  const userCreatedAt = user.created_at || '';

  const safePaymentMethods = paymentMethods || [];
  const safeTickets = tickets || [];

  return (
    <div className="pb-16">
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <PlayerDashboardSwipeWrapper currentSection="settings">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6 max-w-5xl mx-auto">
            <div>
              <h1 className="text-3xl sm:text-4xl font-black text-white font-display uppercase tracking-wider">
                Account Settings
              </h1>
              <p className="text-xs sm:text-sm text-white/70 mt-1 max-w-2xl leading-relaxed">
                Configure your competitor credentials, bank and UPI payout channels, in-session security, and direct admin assistance.
              </p>
            </div>
          </div>

          <PlayerSettingsClientView
            initialProfile={profile}
            userEmail={email}
            isEmailVerified={isEmailVerified}
            userCreatedAt={userCreatedAt}
            paymentMethods={safePaymentMethods}
            tickets={safeTickets}
          />
        </PlayerDashboardSwipeWrapper>
      </main>
    </div>
  );
}
