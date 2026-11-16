import React from 'react';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import AdminTopNav from '@/components/admin/AdminTopNav';
import AdminOneVsOneDesk from '@/components/admin/one-vs-one/AdminOneVsOneDesk';
import {
  getAdminArenaOverview,
  getAllOneVsOneCardsForAdmin,
  getAllOneVsOneSettlementsForAdmin,
  getOneVsOneCreditRecoveryTickets,
} from '@/services/oneVsOneService';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '1 VS 1 Arena Management | Admin Portal',
  description: 'Manage 1v1 challenge entry tiers, monitor live matchmaking queues, and resolve player match disputes.',
};

export default async function AdminOneVsOnePage() {
  let adminUser: any = null;
  try {
    const authResult = await requireAdmin();
    adminUser = authResult.user;
  } catch {
    redirect('/login?error=admin_unauthorized');
  }

  const supabase = await createClient();

  const [overview, cardsResult, matchesQuery, disputesQuery, settlementsResult, creditTicketsResult] = await Promise.all([
    getAdminArenaOverview(supabase),
    getAllOneVsOneCardsForAdmin(supabase),
    supabase
      .from('one_vs_one_matches')
      .select(`
        *,
        card:one_vs_one_cards(*)
      `)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('one_vs_one_disputes')
      .select(`
        *,
        match:one_vs_one_matches(
          id,
          match_code,
          status,
          players:one_vs_one_match_players(
            id,
            user_id,
            player_position,
            profile:profiles(id, display_name, efootball_id)
          )
        )
      `)
      .in('status', ['open', 'under_review'])
      .order('created_at', { ascending: false }),
    getAllOneVsOneSettlementsForAdmin(supabase, { limit: 100 }),
    getOneVsOneCreditRecoveryTickets(supabase),
  ]);

  const cards = cardsResult.data || [];
  const recentMatches = (matchesQuery.data || []).map((m: any) => ({
    ...m,
    players: [],
  }));
  const openDisputes = disputesQuery.data || [];
  const settlements = settlementsResult.data || [];
  const creditTickets = creditTicketsResult.data || [];

  return (
    <div className="min-h-screen bg-[#050515] text-white">
      <AdminTopNav adminEmail={adminUser?.email} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black font-display uppercase tracking-wider text-white">
            1 VS 1 Arena Control Center
          </h1>
          <p className="text-xs sm:text-sm text-white/60 mt-1 max-w-2xl">
            Live fixture monitoring, dynamic entry card configuration, settlement recovery desk, and dispute resolution.
          </p>
        </div>

        <AdminOneVsOneDesk
          overview={overview}
          cards={cards}
          recentMatches={recentMatches}
          openDisputes={openDisputes}
          settlements={settlements}
          creditTickets={creditTickets}
        />
      </main>
    </div>
  );
}
