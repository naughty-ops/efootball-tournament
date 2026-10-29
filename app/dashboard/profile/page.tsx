import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Swords } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import PlayerDashboardHeader from '../PlayerDashboardHeader';
import PlayerProfileForm from './PlayerProfileForm';
import { getPlayerProfile } from '@/services/playerDashboardService';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My Profile | Player Dashboard',
  description: 'Manage your verified in-game gamer handle, WhatsApp notifications, and account credentials.',
};

export default async function PlayerProfilePage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login?error=unauthorized');
  }

  const profile = await getPlayerProfile(supabase, user.id, user);
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
      />

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-white font-display uppercase tracking-wider">
              My Profile
            </h1>
            <p className="text-xs sm:text-sm text-white/70 mt-1 max-w-2xl leading-relaxed">
              Manage your competitor identity, eFootball handle verification, and account security.
            </p>
          </div>

          <Button
            asChild
            className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-full h-11 px-6 shadow-lg gap-2 shrink-0 cursor-pointer"
          >
            <Link href="/dashboard/matches">
              <Swords className="h-4 w-4 text-[#08088F]" />
              <span>My Matches</span>
            </Link>
          </Button>
        </div>

        <PlayerProfileForm
          initialProfile={profile}
          userEmail={email}
          isEmailVerified={isEmailVerified}
          userCreatedAt={userCreatedAt}
        />
      </main>
    </div>
  );
}
