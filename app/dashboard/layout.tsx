import React from 'react';
import { redirect } from 'next/navigation';
import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { getPlayerProfile } from '@/services/playerDashboardService';
import PlayerDashboardHeader from './PlayerDashboardHeader';

export default async function PlayerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect('/auth/login?error=unauthorized');
  }

  const supabase = await createClient();
  const profile = await getPlayerProfile(supabase, user.id, user).catch(() => null);

  const fullName = profile?.display_name || user.user_metadata?.full_name || 'Player';
  const email = user.email || '';
  const efootballId = profile?.efootball_id || user.user_metadata?.efootball_id;
  const isVerified = profile?.efootball_id_verified === true;

  return (
    <div className="min-h-screen bg-[#08088F] text-white flex flex-col selection:bg-[#FFFF00] selection:text-[#08088F]">
      {/* Persistent Shell Navigation Header: Never unmounts or flickers across tab switches */}
      <PlayerDashboardHeader
        userId={user.id}
        userEmail={email}
        displayName={fullName}
        efootballId={efootballId !== 'Not Set' ? efootballId : undefined}
        isVerified={isVerified}
        avatarUrl={profile?.avatar_url || '/avatars/default-avatar.svg'}
      />

      {/* Main Dynamic Viewport */}
      <div className="flex-1 w-full relative app-view-transition">
        {children}
      </div>
    </div>
  );
}
