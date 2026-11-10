import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import PlayerDashboardHeader from '../PlayerDashboardHeader';
import PlayerDashboardSwipeWrapper from '@/components/dashboard/PlayerDashboardSwipeWrapper';
import PlayerCareerClientView from '@/components/career/PlayerCareerClientView';
import { getPlayerProfile } from '@/services/playerDashboardService';
import { getPlayerCareerData, DEFAULT_CAREER_DATA } from '@/services/careerService';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Career & Achievements | Player Dashboard',
  description: 'View your competitive esports statistics, form guide, head-to-head records, and unlocked badges.',
};

export default async function PlayerCareerPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login?error=unauthorized');
  }

  const [profile, careerData] = await Promise.all([
    getPlayerProfile(supabase, user.id, user).catch(() => null),
    getPlayerCareerData(supabase, user.id).catch(() => DEFAULT_CAREER_DATA),
  ]);

  const fullName = profile?.display_name || user.user_metadata?.full_name || 'Player';
  const email = user.email || '';
  const efootballId = profile?.efootball_id || user.user_metadata?.efootball_id;
  const isVerified = profile?.efootball_id_verified === true;

  const safeCareerData = careerData || DEFAULT_CAREER_DATA;

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
        <PlayerDashboardSwipeWrapper currentSection="career">
          <div className="border-b border-white/10 pb-6">
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-[#FFFF00] font-black uppercase tracking-wider mb-3 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Back to Profile</span>
            </Link>
            <h1 className="text-3xl sm:text-4xl font-black text-white font-display uppercase tracking-wider">
              Player Career & Achievements
            </h1>
            <p className="text-xs sm:text-sm text-white/70 mt-1 max-w-2xl leading-relaxed">
              Track your lifetime tournament statistics, recent form momentum, head-to-head records, and unlocked trophies.
            </p>
          </div>

          <PlayerCareerClientView
            careerData={safeCareerData}
            displayName={fullName}
          />
        </PlayerDashboardSwipeWrapper>
      </main>
    </div>
  );
}
