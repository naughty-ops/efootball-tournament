import React from 'react';
import { requireAdmin, requireFinancialAdmin } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import {
  getAdminFinancialOverview,
  getAdminPayoutsList,
  getTournamentsForPrizeDistribution,
} from '@/services/walletService';
import AdminPayoutsDesk from '@/components/admin/payouts/AdminPayoutsDesk';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Prize & Payout Management | eFootball Admin',
  description: 'Manage verified tournament prize distributions and manual bank/UPI payout settlements.',
};

export default async function AdminPayoutsPage() {
  await requireFinancialAdmin();
  const supabase = await createClient();

  const [overview, payoutsResult, completedTournaments] = await Promise.all([
    getAdminFinancialOverview(supabase),
    getAdminPayoutsList({ page: 1, pageSize: 100 }, supabase),
    getTournamentsForPrizeDistribution(supabase),
  ]);

  return (
    <div className="space-y-6">
      <AdminPayoutsDesk
        overview={overview}
        payouts={payoutsResult.payouts}
        completedTournaments={completedTournaments}
      />
    </div>
  );
}
