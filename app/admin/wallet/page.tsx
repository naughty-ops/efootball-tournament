import React from 'react';
import { requireFinancialAdmin } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import {
  getAdminWalletDeposits,
  getWalletPaymentSettings,
} from '@/services/walletService';
import AdminWalletDesk from '@/components/admin/wallet/AdminWalletDesk';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Wallet & Deposits Desk | eFootball Admin',
  description: 'Verify incoming player UPI deposits against merchant banking receipts, credit balances, and configure payment QR endpoints.',
};

export default async function AdminWalletPage() {
  await requireFinancialAdmin();
  const supabase = await createClient();

  const [depositsData, settings] = await Promise.all([
    getAdminWalletDeposits({ page: 1, pageSize: 100 }, supabase),
    getWalletPaymentSettings(supabase),
  ]);

  return (
    <div className="space-y-6">
      <AdminWalletDesk
        initialDeposits={depositsData.deposits}
        initialSettings={settings}
        summary={depositsData.summary}
      />
    </div>
  );
}
