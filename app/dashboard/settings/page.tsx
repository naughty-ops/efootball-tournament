import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login?error=unauthorized');
  }

  const [profile, paymentMethods, tickets] = await Promise.all([
    getPlayerProfile(supabase, user.id, user),
    getPlayerPaymentMethods(user.id),
    getPlayerTickets(user.id),
  ]);

  const fullName = profile?.display_name || user.user_metadata?.full_name || 'Player';
  const email = user.email || '';
  const efootballId = profile?.efootball_id || user.user_metadata?.efootball_id;
  const isVerified = profile?.efootball_id_verified === true;
  const isEmailVerified = !!user.email_confirmed_at;
  const userCreatedAt = user.created_at || '';

  return (
    <div className="min-h-screen bg-[#08088F] text-white pb-16">
      <PlayerDashboardHeader
        userEmail={email}
        displayName={fullName}
        efootballId={efootballId}
        isVerified={isVerified}
        avatarUrl={profile?.avatar_url || '/avatars/default-avatar.svg'}
      />

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
            paymentMethods={paymentMethods}
            tickets={tickets}
          />
        </PlayerDashboardSwipeWrapper>
      </main>
    </div>
  );
}
