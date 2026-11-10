import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  WalletOverview,
  WalletTransactionItem,
  PlayerPaymentMethod,
  DecryptedPaymentDetails,
  PrizeDistributionRecord,
  PayoutTransactionRecord,
  MonthlyEarningsPoint,
  PaymentMethodType,
  PayoutStatus,
  TransactionType,
  PlayerNotificationRecord,
  AdminFinancialOverviewStats,
  PerformanceAnalyticsData,
  PerformancePeriod,
  PerformanceDataPoint,
} from '@/types/wallet';
import {
  encryptSensitiveField,
  decryptSensitiveField,
  maskAccountNumber,
  isValidAccountNumber,
  isValidIfscCode,
  isValidUpiId,
} from '@/lib/wallet/crypto';

// Format helper
export function paiseToInr(paise: number | bigint): number {
  return Number(paise) / 100;
}

export function inrToPaise(inr: number): bigint {
  return BigInt(Math.round(inr * 100));
}

/**
 * Ensures a player wallet record exists for the given user ID.
 */
export async function getOrCreatePlayerWallet(userId: string): Promise<{ id: string; userId: string }> {
  const adminClient = createAdminClient();
  const now = new Date().toISOString();

  const { data: existing } = await (adminClient.from('player_wallets') as any)
    .select('id, user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    return { id: existing.id, userId: existing.user_id };
  }

  const { data: created, error } = await (adminClient.from('player_wallets') as any)
    .insert({ user_id: userId, created_at: now, updated_at: now })
    .select('id, user_id')
    .single();

  if (error || !created) {
    // If conflict due to race condition, re-query
    const { data: fallback } = await (adminClient.from('player_wallets') as any)
      .select('id, user_id')
      .eq('user_id', userId)
      .single();
    if (fallback) return { id: fallback.id, userId: fallback.user_id };
    throw new Error(`Failed to initialize wallet: ${error?.message || 'Unknown error'}`);
  }

  return { id: created.id, userId: created.user_id };
}

/**
 * Calculates authoritative financial overview figures from the database.
 * Never trusts frontend or client-supplied amounts.
 */
export async function getPlayerWalletOverview(userId: string): Promise<WalletOverview> {
  const adminClient = createAdminClient();

  // 1. Total awarded tournament prizes
  const { data: awardedPrizes } = await (adminClient.from('prize_distributions') as any)
    .select('prize_amount_paise')
    .eq('player_id', userId)
    .eq('status', 'awarded');

  let totalEarningsPaise = 0;
  if (awardedPrizes && awardedPrizes.length > 0) {
    totalEarningsPaise = awardedPrizes.reduce(
      (sum: number, row: any) => sum + Number(row.prize_amount_paise || 0),
      0
    );
  }

  // 2. Pending approval tournament prizes
  const { data: pendingPrizes } = await (adminClient.from('prize_distributions') as any)
    .select('prize_amount_paise')
    .eq('player_id', userId)
    .eq('status', 'pending_approval');

  let pendingEarningsPaise = 0;
  if (pendingPrizes && pendingPrizes.length > 0) {
    pendingEarningsPaise = pendingPrizes.reduce(
      (sum: number, row: any) => sum + Number(row.prize_amount_paise || 0),
      0
    );
  }

  // 3. Payout transactions breakdown (Available, Processing, Paid)
  const { data: allPayouts } = await (adminClient.from('payout_transactions') as any)
    .select(`
      id,
      amount_paise,
      amount_inr,
      payout_status,
      deadline_at,
      created_at,
      prize_distribution_id,
      prize_distributions:prize_distribution_id (
        id,
        position_title,
        tournaments:tournament_id (id, name)
      )
    `)
    .eq('player_id', userId)
    .order('deadline_at', { ascending: true, nullsFirst: false });

  let availablePayoutPaise = 0;
  let processingPayoutPaise = 0;
  let totalPaidPaise = 0;
  let nextExpectedPayout: WalletOverview['nextExpectedPayout'] = null;

  const now = new Date();

  if (allPayouts && allPayouts.length > 0) {
    for (const p of allPayouts) {
      const paise = Number(p.amount_paise || 0);
      if (p.payout_status === 'PAID') {
        totalPaidPaise += paise;
      } else if (p.payout_status === 'PROCESSING') {
        processingPayoutPaise += paise;
        if (!nextExpectedPayout) {
          const deadline = p.deadline_at || new Date(new Date(p.created_at).getTime() + 24 * 3600 * 1000).toISOString();
          const tName = p.prize_distributions?.tournaments?.name || 'Tournament Prize';
          nextExpectedPayout = {
            amountInr: Number(p.amount_inr || paiseToInr(paise)),
            deadlineAt: deadline,
            tournamentName: tName,
            status: p.payout_status,
            isOverdue: new Date(deadline).getTime() < now.getTime(),
          };
        }
      } else if (p.payout_status === 'APPROVED' || p.payout_status === 'PENDING' || p.payout_status === 'PENDING_APPROVAL') {
        availablePayoutPaise += paise;
        if (!nextExpectedPayout) {
          const deadline = p.deadline_at || new Date(new Date(p.created_at).getTime() + 24 * 3600 * 1000).toISOString();
          const tName = p.prize_distributions?.tournaments?.name || 'Tournament Prize';
          nextExpectedPayout = {
            amountInr: Number(p.amount_inr || paiseToInr(paise)),
            deadlineAt: deadline,
            tournamentName: tName,
            status: p.payout_status,
            isOverdue: new Date(deadline).getTime() < now.getTime(),
          };
        }
      }
    }
  }

  // Unpaid rewards = Awarded prize money - Total Paid
  const unpaidRewardsPaise = Math.max(0, totalEarningsPaise - totalPaidPaise);

  return {
    totalEarningsPaise,
    totalEarningsInr: paiseToInr(totalEarningsPaise),
    pendingEarningsPaise,
    pendingEarningsInr: paiseToInr(pendingEarningsPaise),
    availablePayoutPaise,
    availablePayoutInr: paiseToInr(availablePayoutPaise),
    processingPayoutPaise,
    processingPayoutInr: paiseToInr(processingPayoutPaise),
    totalPaidPaise,
    totalPaidInr: paiseToInr(totalPaidPaise),
    unpaidRewardsPaise,
    unpaidRewardsInr: paiseToInr(unpaidRewardsPaise),
    nextExpectedPayout,
  };
}

/**
 * Retrieves paginated transactions from the immutable ledger for a player.
 */
export async function getPlayerWalletTransactions(
  userId: string,
  options?: {
    search?: string;
    type?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<{ transactions: WalletTransactionItem[]; totalCount: number }> {
  const adminClient = createAdminClient();
  const page = Math.max(1, options?.page || 1);
  const pageSize = Math.max(1, Math.min(100, options?.pageSize || 20));
  const offset = (page - 1) * pageSize;

  let query = (adminClient.from('wallet_transactions') as any)
    .select(
      `
      id,
      transaction_ref,
      wallet_id,
      user_id,
      transaction_type,
      amount_paise,
      amount_inr,
      status,
      reference_type,
      reference_id,
      tournament_id,
      description,
      idempotency_key,
      created_at,
      tournaments:tournament_id (id, name)
    `,
      { count: 'exact' }
    )
    .eq('user_id', userId);

  if (options?.type && options.type !== 'all') {
    query = query.eq('transaction_type', options.type);
  }

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  if (options?.search && options.search.trim()) {
    const term = `%${options.search.trim()}%`;
    query = query.or(`description.ilike.${term},transaction_ref.ilike.${term}`);
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

  const { data, count, error } = await query;
  if (error) {
    console.error('Error fetching wallet transactions:', error);
    return { transactions: [], totalCount: 0 };
  }

  const transactions: WalletTransactionItem[] = (data || []).map((row: any) => ({
    id: row.id,
    transactionRef: row.transaction_ref,
    walletId: row.wallet_id,
    userId: row.user_id,
    transactionType: row.transaction_type,
    amountPaise: Number(row.amount_paise),
    amountInr: Number(row.amount_inr),
    status: row.status,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    tournamentId: row.tournament_id,
    tournamentName: row.tournaments?.name || null,
    description: row.description,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  }));

  return { transactions, totalCount: count || 0 };
}

/**
 * Aggregates monthly earnings and payouts for the performance chart.
 */
export async function getPlayerMonthlyEarnings(userId: string): Promise<MonthlyEarningsPoint[]> {
  const adminClient = createAdminClient();

  const { data, error } = await (adminClient.from('wallet_transactions') as any)
    .select('transaction_type, amount_inr, status, created_at')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('created_at', { ascending: true });

  if (error || !data || data.length === 0) {
    return [];
  }

  const monthMap = new Map<string, { month: string; yearMonth: string; prizesInr: number; payoutsInr: number }>();

  for (const row of data) {
    const d = new Date(row.created_at);
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const month = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    if (!monthMap.has(yearMonth)) {
      monthMap.set(yearMonth, { month, yearMonth, prizesInr: 0, payoutsInr: 0 });
    }

    const current = monthMap.get(yearMonth)!;
    const amount = Number(row.amount_inr || 0);

    if (row.transaction_type === 'TOURNAMENT_PRIZE' || row.transaction_type === 'BONUS_REWARD') {
      current.prizesInr += amount;
    } else if (row.transaction_type === 'PAYOUT_COMPLETED') {
      current.payoutsInr += amount;
    }
  }

  return Array.from(monthMap.values()).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

/**
 * Calculates authoritative, interactive performance analytics for Day, Week, and Month.
 * Uses 100% real database ledger transactions without fabricated data.
 */
export async function getPlayerPerformanceAnalytics(
  userId: string,
  timeframe: PerformancePeriod = 'month'
): Promise<PerformanceAnalyticsData> {
  const adminClient = createAdminClient();

  const { data: rows } = await (adminClient.from('wallet_transactions') as any)
    .select('transaction_type, amount_inr, status, created_at')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('created_at', { ascending: true });

  const txs = rows || [];
  const now = new Date();

  if (timeframe === 'day') {
    const todayStr = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const hourlyMap = new Map<number, { prizesInr: number; payoutsInr: number }>();
    for (let h = 0; h < 24; h++) {
      hourlyMap.set(h, { prizesInr: 0, payoutsInr: 0 });
    }

    let todayPrizes = 0;
    let todayPayouts = 0;
    let yesterdayPrizes = 0;

    for (const tx of txs) {
      const d = new Date(tx.created_at);
      const dateStr = d.toISOString().slice(0, 10);
      const amt = Number(tx.amount_inr || 0);

      if (dateStr === todayStr) {
        const hour = d.getHours();
        const bucket = hourlyMap.get(hour) || { prizesInr: 0, payoutsInr: 0 };
        if (tx.transaction_type === 'TOURNAMENT_PRIZE' || tx.transaction_type === 'BONUS_REWARD') {
          bucket.prizesInr += amt;
          todayPrizes += amt;
        } else if (tx.transaction_type === 'PAYOUT_COMPLETED') {
          bucket.payoutsInr += amt;
          todayPayouts += amt;
        }
        hourlyMap.set(hour, bucket);
      } else if (dateStr === yesterdayStr) {
        if (tx.transaction_type === 'TOURNAMENT_PRIZE' || tx.transaction_type === 'BONUS_REWARD') {
          yesterdayPrizes += amt;
        }
      }
    }

    const dataPoints: PerformanceDataPoint[] = [];
    for (let h = 0; h < 24; h++) {
      const b = hourlyMap.get(h)!;
      dataPoints.push({
        key: `hour-${h}`,
        label: `${String(h).padStart(2, '0')}:00`,
        prizesInr: b.prizesInr,
        payoutsInr: b.payoutsInr,
      });
    }

    let comparison = null;
    if (yesterdayPrizes > 0) {
      const diff = todayPrizes - yesterdayPrizes;
      const pct = (diff / yesterdayPrizes) * 100;
      comparison = {
        previousEarningsInr: yesterdayPrizes,
        percentageChange: Number(pct.toFixed(1)),
        isPositive: diff >= 0,
        comparisonLabel: 'vs yesterday',
      };
    }

    return {
      timeframe: 'day',
      totalEarningsInr: todayPrizes,
      totalPayoutsInr: todayPayouts,
      dataPoints,
      comparison,
    };
  }

  if (timeframe === 'week') {
    const days: { dateStr: string; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
      days.push({ dateStr, label });
    }

    const dayMap = new Map<string, { prizesInr: number; payoutsInr: number }>();
    for (const d of days) {
      dayMap.set(d.dateStr, { prizesInr: 0, payoutsInr: 0 });
    }

    const prevWeekStart = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
    const prevWeekEnd = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

    let weekPrizes = 0;
    let weekPayouts = 0;
    let prevWeekPrizes = 0;

    for (const tx of txs) {
      const txDate = new Date(tx.created_at);
      const dateStr = txDate.toISOString().slice(0, 10);
      const amt = Number(tx.amount_inr || 0);

      if (dayMap.has(dateStr)) {
        const bucket = dayMap.get(dateStr)!;
        if (tx.transaction_type === 'TOURNAMENT_PRIZE' || tx.transaction_type === 'BONUS_REWARD') {
          bucket.prizesInr += amt;
          weekPrizes += amt;
        } else if (tx.transaction_type === 'PAYOUT_COMPLETED') {
          bucket.payoutsInr += amt;
          weekPayouts += amt;
        }
      } else if (txDate >= prevWeekStart && txDate < prevWeekEnd) {
        if (tx.transaction_type === 'TOURNAMENT_PRIZE' || tx.transaction_type === 'BONUS_REWARD') {
          prevWeekPrizes += amt;
        }
      }
    }

    const dataPoints: PerformanceDataPoint[] = days.map((d) => {
      const b = dayMap.get(d.dateStr)!;
      return {
        key: d.dateStr,
        label: d.label,
        prizesInr: b.prizesInr,
        payoutsInr: b.payoutsInr,
      };
    });

    let comparison = null;
    if (prevWeekPrizes > 0) {
      const diff = weekPrizes - prevWeekPrizes;
      const pct = (diff / prevWeekPrizes) * 100;
      comparison = {
        previousEarningsInr: prevWeekPrizes,
        percentageChange: Number(pct.toFixed(1)),
        isPositive: diff >= 0,
        comparisonLabel: 'vs previous week',
      };
    }

    return {
      timeframe: 'week',
      totalEarningsInr: weekPrizes,
      totalPayoutsInr: weekPayouts,
      dataPoints,
      comparison,
    };
  }

  // Month timeframe: Last 30 days
  const days: { dateStr: string; label: string }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    days.push({ dateStr, label });
  }

  const monthDayMap = new Map<string, { prizesInr: number; payoutsInr: number }>();
  for (const d of days) {
    monthDayMap.set(d.dateStr, { prizesInr: 0, payoutsInr: 0 });
  }

  const prevMonthStart = new Date(now.getTime() - 60 * 24 * 3600 * 1000);
  const prevMonthEnd = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

  let monthPrizes = 0;
  let monthPayouts = 0;
  let prevMonthPrizes = 0;

  for (const tx of txs) {
    const txDate = new Date(tx.created_at);
    const dateStr = txDate.toISOString().slice(0, 10);
    const amt = Number(tx.amount_inr || 0);

    if (monthDayMap.has(dateStr)) {
      const bucket = monthDayMap.get(dateStr)!;
      if (tx.transaction_type === 'TOURNAMENT_PRIZE' || tx.transaction_type === 'BONUS_REWARD') {
        bucket.prizesInr += amt;
        monthPrizes += amt;
      } else if (tx.transaction_type === 'PAYOUT_COMPLETED') {
        bucket.payoutsInr += amt;
        monthPayouts += amt;
      }
    } else if (txDate >= prevMonthStart && txDate < prevMonthEnd) {
      if (tx.transaction_type === 'TOURNAMENT_PRIZE' || tx.transaction_type === 'BONUS_REWARD') {
        prevMonthPrizes += amt;
      }
    }
  }

  const dataPoints: PerformanceDataPoint[] = days.map((d) => {
    const b = monthDayMap.get(d.dateStr)!;
    return {
      key: d.dateStr,
      label: d.label,
      prizesInr: b.prizesInr,
      payoutsInr: b.payoutsInr,
    };
  });

  let comparison = null;
  if (prevMonthPrizes > 0) {
    const diff = monthPrizes - prevMonthPrizes;
    const pct = (diff / prevMonthPrizes) * 100;
    comparison = {
      previousEarningsInr: prevMonthPrizes,
      percentageChange: Number(pct.toFixed(1)),
      isPositive: diff >= 0,
      comparisonLabel: 'vs previous month',
    };
  }

  return {
    timeframe: 'month',
    totalEarningsInr: monthPrizes,
    totalPayoutsInr: monthPayouts,
    dataPoints,
    comparison,
  };
}

/**
 * Retrieves player payment methods with masked account numbers.
 * Plaintext and encrypted account numbers are never returned here.
 */
export async function getPlayerPaymentMethods(userId: string): Promise<PlayerPaymentMethod[]> {
  const adminClient = createAdminClient();

  const { data, error } = await (adminClient.from('player_payment_methods') as any)
    .select('id, user_id, payment_method_type, account_holder_name, bank_name, masked_account_number, ifsc_code, upi_id, is_preferred, created_at, updated_at')
    .eq('user_id', userId)
    .order('is_preferred', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((m: any) => ({
    id: m.id,
    userId: m.user_id,
    paymentMethodType: m.payment_method_type,
    accountHolderName: m.account_holder_name,
    bankName: m.bank_name,
    maskedAccountNumber: m.masked_account_number,
    ifscCode: m.ifsc_code,
    upiId: m.upi_id,
    isPreferred: Boolean(m.is_preferred),
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  }));
}

/**
 * Saves or updates Bank Account details for a player.
 * Encrypts account number server-side using AES-256-GCM.
 */
export async function savePlayerBankAccount(
  userId: string,
  params: {
    accountHolderName: string;
    bankName: string;
    accountNumber: string;
    confirmAccountNumber: string;
    ifscCode: string;
    isPreferred?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  const holder = params.accountHolderName?.trim();
  const bank = params.bankName?.trim();
  const acc = params.accountNumber?.replace(/[\s-]/g, '');
  const confirmAcc = params.confirmAccountNumber?.replace(/[\s-]/g, '');
  const ifsc = params.ifscCode?.trim().toUpperCase();

  if (!holder || holder.length < 2) {
    return { success: false, error: 'Valid Account Holder Name is required (minimum 2 characters).' };
  }
  if (!bank || bank.length < 2) {
    return { success: false, error: 'Valid Bank Name is required.' };
  }
  if (!acc || !isValidAccountNumber(acc)) {
    return { success: false, error: 'Valid Bank Account Number is required (9 to 18 digits).' };
  }
  if (acc !== confirmAcc) {
    return { success: false, error: 'Account numbers do not match. Please verify and re-enter.' };
  }
  if (!ifsc || !isValidIfscCode(ifsc)) {
    return { success: false, error: 'Invalid IFSC code format. Expected 11 characters (e.g. SBIN0001234).' };
  }

  const encryptedAccount = encryptSensitiveField(acc);
  const maskedAccount = maskAccountNumber(acc);
  const isPreferred = params.isPreferred ?? false;
  const now = new Date().toISOString();
  const adminClient = createAdminClient();

  if (isPreferred) {
    await (adminClient.from('player_payment_methods') as any)
      .update({ is_preferred: false, updated_at: now })
      .eq('user_id', userId);
  }

  const { error } = await (adminClient.from('player_payment_methods') as any).upsert(
    {
      user_id: userId,
      payment_method_type: 'bank_account',
      account_holder_name: holder,
      bank_name: bank,
      encrypted_account_number: encryptedAccount,
      masked_account_number: maskedAccount,
      ifsc_code: ifsc,
      is_preferred: isPreferred,
      updated_at: now,
    },
    { onConflict: 'user_id,payment_method_type' }
  );

  if (error) {
    console.error('Failed to save bank account:', error);
    return { success: false, error: 'Failed to save bank account details.' };
  }

  // Audit log (never records plaintext or encrypted account number)
  await (adminClient.from('financial_audit_logs') as any).insert({
    actor_id: userId,
    action: 'SAVE_BANK_ACCOUNT',
    target_type: 'player_payment_methods',
    target_id: userId,
    new_state: {
      payment_method_type: 'bank_account',
      bank_name: bank,
      masked_account_number: maskedAccount,
      ifsc_code: ifsc,
      is_preferred: isPreferred,
    },
  });

  return { success: true };
}

/**
 * Saves or updates UPI / Google Pay details for a player.
 */
export async function savePlayerUpiDetails(
  userId: string,
  params: {
    upiId: string;
    confirmUpiId: string;
    isPreferred?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  const upi = params.upiId?.trim().toLowerCase();
  const confirmUpi = params.confirmUpiId?.trim().toLowerCase();

  if (!upi || !isValidUpiId(upi)) {
    return { success: false, error: 'Invalid UPI ID format. Expected format: username@bank (e.g. player@okaxis).' };
  }
  if (upi !== confirmUpi) {
    return { success: false, error: 'UPI IDs do not match. Please verify and re-enter.' };
  }

  const isPreferred = params.isPreferred ?? false;
  const now = new Date().toISOString();
  const adminClient = createAdminClient();

  if (isPreferred) {
    await (adminClient.from('player_payment_methods') as any)
      .update({ is_preferred: false, updated_at: now })
      .eq('user_id', userId);
  }

  const { error } = await (adminClient.from('player_payment_methods') as any).upsert(
    {
      user_id: userId,
      payment_method_type: 'upi',
      upi_id: upi,
      is_preferred: isPreferred,
      updated_at: now,
    },
    { onConflict: 'user_id,payment_method_type' }
  );

  if (error) {
    console.error('Failed to save UPI details:', error);
    return { success: false, error: 'Failed to save UPI details.' };
  }

  // Audit log
  await (adminClient.from('financial_audit_logs') as any).insert({
    actor_id: userId,
    action: 'SAVE_UPI_DETAILS',
    target_type: 'player_payment_methods',
    target_id: userId,
    new_state: {
      payment_method_type: 'upi',
      upi_id: upi,
      is_preferred: isPreferred,
    },
  });

  return { success: true };
}

/**
 * Switches the player's preferred payout method between Bank Account and UPI.
 */
export async function setPreferredPaymentMethod(
  userId: string,
  paymentMethodType: PaymentMethodType
): Promise<{ success: boolean; error?: string }> {
  const adminClient = createAdminClient();
  const now = new Date().toISOString();

  // Reset all
  await (adminClient.from('player_payment_methods') as any)
    .update({ is_preferred: false, updated_at: now })
    .eq('user_id', userId);

  // Set selected
  const { error } = await (adminClient.from('player_payment_methods') as any)
    .update({ is_preferred: true, updated_at: now })
    .eq('user_id', userId)
    .eq('payment_method_type', paymentMethodType);

  if (error) {
    return { success: false, error: 'Failed to update preferred payment method.' };
  }

  await (adminClient.from('financial_audit_logs') as any).insert({
    actor_id: userId,
    action: 'SET_PREFERRED_PAYMENT_METHOD',
    target_type: 'player_payment_methods',
    target_id: userId,
    new_state: { preferred_method: paymentMethodType },
  });

  return { success: true };
}

/**
 * Retrieves player's payout history with 24-hour SLA tracking and payment details.
 */
export async function getPlayerPayouts(userId: string): Promise<PayoutTransactionRecord[]> {
  const adminClient = createAdminClient();

  const { data, error } = await (adminClient.from('payout_transactions') as any)
    .select(`
      id,
      payout_reference,
      player_id,
      prize_distribution_id,
      amount_paise,
      amount_inr,
      payment_method_id,
      payment_method_type,
      payout_status,
      utr_reference,
      processed_by,
      paid_at,
      eligible_at,
      deadline_at,
      receipt_url,
      receipt_reference,
      failure_reason,
      created_at,
      updated_at
    `)
    .eq('player_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  // Gather prize distribution ids to fetch tournament names and positions
  const distIds = data.map((r: any) => r.prize_distribution_id).filter(Boolean);
  const tournamentMap = new Map<string, { name: string; positionTitle: string }>();

  if (distIds.length > 0) {
    const { data: dists } = await (adminClient.from('prize_distributions') as any)
      .select('id, position_title, tournament_id, tournaments:tournament_id (id, name)')
      .in('id', distIds);

    if (dists) {
      for (const d of dists) {
        tournamentMap.set(d.id, {
          name: d.tournaments?.name || 'Tournament',
          positionTitle: d.position_title || 'Winner',
        });
      }
    }
  }

  // Gather payment methods to show masked bank/UPI
  const pmIds = data.map((r: any) => r.payment_method_id).filter(Boolean);
  const pmMap = new Map<string, any>();
  if (pmIds.length > 0) {
    const { data: pms } = await (adminClient.from('player_payment_methods') as any)
      .select('id, payment_method_type, account_holder_name, bank_name, masked_account_number, ifsc_code, upi_id')
      .in('id', pmIds);
    if (pms) {
      for (const pm of pms) {
        pmMap.set(pm.id, pm);
      }
    }
  }

  return data.map((row: any) => {
    const distInfo = row.prize_distribution_id ? tournamentMap.get(row.prize_distribution_id) : null;
    const pm = row.payment_method_id ? pmMap.get(row.payment_method_id) : null;

    let paymentDetails: DecryptedPaymentDetails | null = null;
    if (pm) {
      paymentDetails = {
        id: pm.id,
        paymentMethodType: pm.payment_method_type,
        accountHolderName: pm.account_holder_name,
        bankName: pm.bank_name,
        maskedAccountNumber: pm.masked_account_number,
        ifscCode: pm.ifsc_code,
        upiId: pm.upi_id,
        isPreferred: false,
      };
    }

    return {
      id: row.id,
      payoutReference: row.payout_reference,
      playerId: row.player_id,
      prizeDistributionId: row.prize_distribution_id,
      tournamentName: distInfo?.name || null,
      positionTitle: distInfo?.positionTitle || null,
      amountPaise: Number(row.amount_paise),
      amountInr: Number(row.amount_inr),
      paymentMethodId: row.payment_method_id,
      paymentMethodType: row.payment_method_type,
      payoutStatus: row.payout_status,
      utrReference: null, // Admin details / UTR kept internal and not shared to users
      processedBy: null, // Admin user ID kept internal
      paidAt: row.paid_at,
      eligibleAt: row.eligible_at || row.created_at,
      deadlineAt: row.deadline_at || new Date(new Date(row.created_at).getTime() + 24 * 3600 * 1000).toISOString(),
      receiptUrl: row.receipt_url,
      receiptReference: row.receipt_reference,
      failureReason: row.failure_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      paymentDetails,
    };
  });
}

/**
 * Player requests a manual prize payout.
 * Under the new Direct Payout architecture, manual requests are disabled:
 * Payouts are automatically scheduled and disbursed by administrators within 24 hours of prize eligibility.
 */
export async function requestPlayerPayout(userId: string): Promise<{ success: boolean; error?: string; payoutReference?: string }> {
  return {
    success: false,
    error: 'Manual withdrawal requests are disabled. Payouts are automatically scheduled and disbursed directly by administrators to your verified payment method within 24 hours of prize eligibility.',
  };
}

/**
 * ============================================================================
 * ADMIN SERVICES (PRIZE DISTRIBUTION & DIRECT PAYOUT OPERATIONS)
 * ============================================================================
 */

export async function getAdminFinancialOverview(): Promise<AdminFinancialOverviewStats> {
  const adminClient = createAdminClient();
  const now = new Date();

  const [awardedRes, pendingRes, payoutsRes] = await Promise.all([
    (adminClient.from('prize_distributions') as any).select('prize_amount_paise').eq('status', 'awarded'),
    (adminClient.from('prize_distributions') as any).select('prize_amount_paise').eq('status', 'pending_approval'),
    (adminClient.from('payout_transactions') as any).select('amount_paise, payout_status, deadline_at, created_at'),
  ]);

  let totalPrizeAwardedPaise = 0;
  if (awardedRes.data) {
    totalPrizeAwardedPaise = awardedRes.data.reduce(
      (sum: number, r: any) => sum + Number(r.prize_amount_paise || 0),
      0
    );
  }

  let pendingApprovalPaise = 0;
  if (pendingRes.data) {
    pendingApprovalPaise = pendingRes.data.reduce(
      (sum: number, r: any) => sum + Number(r.prize_amount_paise || 0),
      0
    );
  }

  let totalPaidPaise = 0;
  let approvedUnpaidPaise = 0;
  let processingPayoutsPaise = 0;
  let pendingPayoutsCount = 0;
  let processingPayoutsCount = 0;
  let paidPayoutsCount = 0;
  let rejectedPayoutsCount = 0;
  let failedPayoutsCount = 0;
  let overduePayoutsCount = 0;
  let dueSoonPayoutsCount = 0;
  let urgentPayoutsCount = 0;

  if (payoutsRes.data) {
    for (const p of payoutsRes.data) {
      const paise = Number(p.amount_paise || 0);
      const deadline = p.deadline_at ? new Date(p.deadline_at) : new Date(new Date(p.created_at).getTime() + 24 * 3600 * 1000);
      const msRemaining = deadline.getTime() - now.getTime();

      if (p.payout_status === 'PAID') {
        totalPaidPaise += paise;
        paidPayoutsCount++;
      } else if (p.payout_status === 'PROCESSING') {
        processingPayoutsPaise += paise;
        processingPayoutsCount++;
        if (msRemaining < 0) {
          overduePayoutsCount++;
        } else if (msRemaining <= 3600 * 1000) {
          urgentPayoutsCount++;
        } else if (msRemaining <= 6 * 3600 * 1000) {
          dueSoonPayoutsCount++;
        }
      } else if (p.payout_status === 'APPROVED' || p.payout_status === 'PENDING' || p.payout_status === 'PENDING_APPROVAL') {
        approvedUnpaidPaise += paise;
        pendingPayoutsCount++;
        if (msRemaining < 0) {
          overduePayoutsCount++;
        } else if (msRemaining <= 3600 * 1000) {
          urgentPayoutsCount++;
        } else if (msRemaining <= 6 * 3600 * 1000) {
          dueSoonPayoutsCount++;
        }
      } else if (p.payout_status === 'REJECTED') {
        rejectedPayoutsCount++;
      } else if (p.payout_status === 'FAILED') {
        failedPayoutsCount++;
        if (msRemaining < 0) {
          overduePayoutsCount++;
        }
      }
    }
  }

  const totalOutstandingPaise = Math.max(0, totalPrizeAwardedPaise - totalPaidPaise);

  return {
    totalPrizeAwardedPaise,
    totalPrizeAwardedInr: paiseToInr(totalPrizeAwardedPaise),
    pendingApprovalPaise,
    pendingApprovalInr: paiseToInr(pendingApprovalPaise),
    approvedUnpaidPaise,
    approvedUnpaidInr: paiseToInr(approvedUnpaidPaise),
    processingPayoutsPaise,
    processingPayoutsInr: paiseToInr(processingPayoutsPaise),
    totalPaidPaise,
    totalPaidInr: paiseToInr(totalPaidPaise),
    failedPayoutsCount,
    overduePayoutsCount,
    totalOutstandingPaise,
    totalOutstandingInr: paiseToInr(totalOutstandingPaise),
    pendingPayoutsCount,
    processingPayoutsCount,
    paidPayoutsCount,
    rejectedPayoutsCount,
    dueSoonPayoutsCount,
    urgentPayoutsCount,
  };
}

/**
 * Retrieves tournaments ready for prize distribution (completed tournaments with winners).
 */
export async function getTournamentsForPrizeDistribution(): Promise<any[]> {
  const adminClient = createAdminClient();

  const { data, error } = await (adminClient.from('tournaments') as any)
    .select(`
      id,
      name,
      status,
      format,
      prize_pool_paise,
      first_place_prize_paise,
      second_place_prize_paise,
      third_place_prize_paise,
      prize_distribution,
      champion_id,
      runner_up_id,
      third_place_id,
      completed_at,
      created_at
    `)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  // Auto-heal missing runner_up_id or champion_id from concluded final matches
  const missingPodiumTournaments = data.filter((t: any) => !t.runner_up_id || !t.champion_id);
  if (missingPodiumTournaments.length > 0) {
    const tIds = missingPodiumTournaments.map((t: any) => t.id);
    const { data: finalMatches } = await (adminClient.from('matches') as any)
      .select('id, tournament_id, participant_a, participant_b, winner_id, status')
      .in('tournament_id', tIds)
      .is('next_match_id', null)
      .is('group_id', null)
      .in('status', ['completed', 'walkover']);

    if (finalMatches && finalMatches.length > 0) {
      for (const fm of finalMatches) {
        const t = data.find((x: any) => x.id === fm.tournament_id);
        if (t) {
          const winId = fm.winner_id || t.champion_id;
          if (winId) {
            const runnerUpId = fm.participant_a === winId ? fm.participant_b : fm.participant_a;
            if (!t.champion_id) t.champion_id = winId;
            if (!t.runner_up_id && runnerUpId) t.runner_up_id = runnerUpId;

            // Persist healed IDs back to the database
            await (adminClient.from('tournaments') as any)
              .update({
                champion_id: t.champion_id,
                runner_up_id: t.runner_up_id,
                updated_at: new Date().toISOString(),
              })
              .eq('id', t.id);
          }
        }
      }
    }
  }

  // Gather participant IDs
  const allParticipantIds = [
    ...new Set(
      data.flatMap((t: any) => [t.champion_id, t.runner_up_id, t.third_place_id]).filter(Boolean)
    ),
  ];

  const participantMap = new Map<string, any>();
  if (allParticipantIds.length > 0) {
    const { data: participants } = await (adminClient.from('participants') as any)
      .select('id, username, real_name, user_id')
      .in('id', allParticipantIds);
    if (participants) {
      for (const p of participants) {
        participantMap.set(p.id, p);
      }
    }
  }

  // Check which tournaments already have distributions
  const tournamentIds = data.map((t: any) => t.id);
  const { data: existingDistributions } = await (adminClient.from('prize_distributions') as any)
    .select('tournament_id, position, status')
    .in('tournament_id', tournamentIds);

  const distributedMap = new Map<string, Set<number>>();
  if (existingDistributions) {
    for (const d of existingDistributions) {
      if (d.status === 'awarded') {
        const set = distributedMap.get(d.tournament_id) || new Set<number>();
        set.add(Number(d.position));
        distributedMap.set(d.tournament_id, set);
      }
    }
  }

  return data.map((t: any) => {
    const champion = t.champion_id ? participantMap.get(t.champion_id) || null : null;
    const runner_up = t.runner_up_id ? participantMap.get(t.runner_up_id) || null : null;
    const third_place = t.third_place_id ? participantMap.get(t.third_place_id) || null : null;

    const firstPrize = Number(t.first_place_prize_paise || t.prize_distribution?.first?.paise || 0);
    const secondPrize = Number(t.second_place_prize_paise || t.prize_distribution?.second?.paise || 0);
    const thirdPrize = Number(t.third_place_prize_paise || t.prize_distribution?.third?.paise || 0);

    let eligibleCount = 0;
    if (firstPrize > 0 && champion?.user_id) eligibleCount++;
    if (secondPrize > 0 && runner_up?.user_id) eligibleCount++;
    if (thirdPrize > 0 && third_place?.user_id) eligibleCount++;

    // Fallback if user_id not resolved yet, count positions with configured prizes
    if (eligibleCount === 0) {
      if (firstPrize > 0) eligibleCount++;
      if (secondPrize > 0) eligibleCount++;
      if (thirdPrize > 0) eligibleCount++;
    }

    const awardedPositions = distributedMap.get(t.id) || new Set<number>();
    const distributedCount = awardedPositions.size;
    const hasDistributedPrizes = eligibleCount > 0 ? distributedCount >= eligibleCount : distributedCount > 0;
    const isPartiallyDistributed = distributedCount > 0 && distributedCount < eligibleCount;

    return {
      ...t,
      first_place_prize_paise: firstPrize,
      second_place_prize_paise: secondPrize,
      third_place_prize_paise: thirdPrize,
      champion,
      runner_up,
      third_place,
      eligibleCount,
      distributedCount,
      hasDistributedPrizes,
      isPartiallyDistributed,
    };
  });
}

/**
 * Distributes prizes for a tournament atomically and creates ledger transactions.
 * Strictly prevents duplicate distributions per position.
 */
export async function distributeTournamentPrizes(
  tournamentId: string,
  adminUserId: string,
  customNotes?: string
): Promise<{ success: boolean; error?: string; awardedCount?: number }> {
  const adminClient = createAdminClient();

  // 1. Fetch tournament
  const { data: tournament, error: tourError } = await (adminClient.from('tournaments') as any)
    .select(`
      id,
      name,
      status,
      first_place_prize_paise,
      second_place_prize_paise,
      third_place_prize_paise,
      prize_distribution,
      champion_id,
      runner_up_id,
      third_place_id,
      format
    `)
    .eq('id', tournamentId)
    .single();

  if (tourError || !tournament) {
    return { success: false, error: 'Tournament not found.' };
  }

  if (tournament.status !== 'completed') {
    return { success: false, error: 'Cannot distribute prizes: Tournament is not in COMPLETED status.' };
  }

  // Auto-heal missing runner_up_id or champion_id from final match if needed
  if (!tournament.runner_up_id || !tournament.champion_id) {
    const { data: finalMatches } = await (adminClient.from('matches') as any)
      .select('id, participant_a, participant_b, winner_id, status')
      .eq('tournament_id', tournamentId)
      .is('next_match_id', null)
      .is('group_id', null)
      .in('status', ['completed', 'walkover'])
      .limit(1);

    if (finalMatches && finalMatches.length > 0) {
      const fm = finalMatches[0];
      const winId = fm.winner_id || tournament.champion_id;
      if (winId) {
        const runnerUpId = fm.participant_a === winId ? fm.participant_b : fm.participant_a;
        if (!tournament.champion_id) tournament.champion_id = winId;
        if (!tournament.runner_up_id && runnerUpId) tournament.runner_up_id = runnerUpId;

        await (adminClient.from('tournaments') as any)
          .update({
            champion_id: tournament.champion_id,
            runner_up_id: tournament.runner_up_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tournamentId);
      }
    }
  }

  // Fetch participant winner records directly
  const participantIds = [tournament.champion_id, tournament.runner_up_id, tournament.third_place_id].filter(Boolean);
  const { data: participants } = await (adminClient.from('participants') as any)
    .select('id, username, real_name, user_id')
    .in('id', participantIds);

  const partMap = new Map((participants || []).map((p: any) => [p.id, p]));
  const champion = tournament.champion_id ? partMap.get(tournament.champion_id) : null;
  const runner_up = tournament.runner_up_id ? partMap.get(tournament.runner_up_id) : null;
  const third_place = tournament.third_place_id ? partMap.get(tournament.third_place_id) : null;

  // 2. Check duplicate distribution protection per position
  const { data: existingDistributions } = await (adminClient.from('prize_distributions') as any)
    .select('id, position')
    .eq('tournament_id', tournamentId)
    .eq('status', 'awarded');

  const awardedPositions = new Set<number>(
    (existingDistributions || []).map((d: any) => Number(d.position))
  );

  // Read prizes with fallback to prize_distribution JSONB
  const firstPrize = Number(
    tournament.first_place_prize_paise ||
    tournament.prize_distribution?.first?.paise ||
    0
  );
  const secondPrize = Number(
    tournament.second_place_prize_paise ||
    tournament.prize_distribution?.second?.paise ||
    0
  );
  const thirdPrize = Number(
    tournament.third_place_prize_paise ||
    tournament.prize_distribution?.third?.paise ||
    0
  );

  // 3. Compile winners list
  interface WinnerSlot {
    position: number;
    positionTitle: string;
    prizePaise: number;
    participant: {
      id: string;
      user_id: string;
      username?: string;
      real_name?: string;
    };
  }

  const candidateSlots = [
    {
      position: 1,
      positionTitle: 'Champion (1st Place)',
      prizePaise: firstPrize,
      participant: champion,
    },
    {
      position: 2,
      positionTitle: 'Runner-up (2nd Place)',
      prizePaise: secondPrize,
      participant: runner_up,
    },
    {
      position: 3,
      positionTitle: '3rd Place',
      prizePaise: thirdPrize,
      participant: third_place,
    },
  ];

  const eligibleSlots = candidateSlots.filter(
    (w): w is WinnerSlot => Boolean(w.prizePaise > 0 && w.participant && (w.participant as any).user_id)
  );

  // Filter out positions that have already been awarded
  const winnersToAward: WinnerSlot[] = eligibleSlots.filter(
    (w) => !awardedPositions.has(w.position)
  );

  if (eligibleSlots.length === 0) {
    return {
      success: false,
      error: 'No prize winners with linked user accounts found. Ensure prize amounts and participant winners are configured.',
    };
  }

  if (winnersToAward.length === 0) {
    return {
      success: false,
      error: `All configured prize positions (${awardedPositions.size}) for "${tournament.name}" have already been awarded. Duplicate distribution is strictly blocked.`,
    };
  }

  let awardedCount = 0;
  const now = new Date().toISOString();
  const dateStr = now.slice(0, 10).replace(/-/g, '');

  for (const slot of winnersToAward) {
    const winnerUserId = slot.participant.user_id;
    const prizePaise = slot.prizePaise;
    const prizeInr = paiseToInr(prizePaise);
    const distRef = `PRZ-${dateStr}-${tournamentId.slice(0, 4).toUpperCase()}-P${slot.position}`;

    // Ensure wallet exists
    const wallet = await getOrCreatePlayerWallet(winnerUserId);

    // Insert Prize Distribution record
    const { data: distRecord, error: distErr } = await (adminClient.from('prize_distributions') as any)
      .insert({
        distribution_reference: distRef,
        tournament_id: tournamentId,
        player_id: winnerUserId,
        participant_id: slot.participant.id,
        position: slot.position,
        position_title: slot.positionTitle,
        prize_amount_paise: prizePaise,
        prize_amount_inr: prizeInr,
        status: 'awarded',
        approved_by: adminUserId,
        approved_at: now,
        notes: customNotes || `Prize awarded for ${slot.positionTitle} in ${tournament.name}`,
      })
      .select('id')
      .single();

    if (distErr || !distRecord) {
      console.error(`Error inserting prize distribution for position ${slot.position}:`, distErr);
      continue;
    }

    // Insert Authoritative Ledger Transaction
    const txRef = `TX-${dateStr}-${distRecord.id.slice(0, 8).toUpperCase()}`;
    const idempotencyKey = `dist-${distRecord.id}`;

    await (adminClient.from('wallet_transactions') as any).insert({
      transaction_ref: txRef,
      wallet_id: wallet.id,
      user_id: winnerUserId,
      transaction_type: 'TOURNAMENT_PRIZE',
      amount_paise: prizePaise,
      amount_inr: prizeInr,
      status: 'completed',
      reference_type: 'prize_distribution',
      reference_id: distRecord.id,
      tournament_id: tournamentId,
      description: `Tournament Prize: ${slot.positionTitle} - ${tournament.name}`,
      idempotency_key: idempotencyKey,
      created_at: now,
    });

    // Automatically provision Direct Payout with 24-hour SLA
    const { data: pmData } = await (adminClient.from('player_payment_methods') as any)
      .select('id, payment_method_type, is_preferred')
      .eq('user_id', winnerUserId)
      .order('is_preferred', { ascending: false })
      .limit(1);
    const preferredPm = pmData && pmData.length > 0 ? pmData[0] : null;

    const eligibleAt = now;
    const deadlineAt = new Date(new Date(now).getTime() + 24 * 3600 * 1000).toISOString();
    const payoutRef = `PAY-${dateStr}-${distRecord.id.slice(0, 4).toUpperCase()}-P${slot.position}`;

    await (adminClient.from('payout_transactions') as any).insert({
      payout_reference: payoutRef,
      player_id: winnerUserId,
      prize_distribution_id: distRecord.id,
      amount_paise: prizePaise,
      amount_inr: prizeInr,
      payment_method_id: preferredPm ? preferredPm.id : null,
      payment_method_type: preferredPm ? preferredPm.payment_method_type : null,
      payout_status: 'APPROVED',
      eligible_at: eligibleAt,
      deadline_at: deadlineAt,
      created_at: now,
      updated_at: now,
    });

    // Notify Player with 24h SLA details
    await (adminClient.from('player_notifications') as any).insert({
      user_id: winnerUserId,
      title: 'Tournament Prize Confirmed! 🏆',
      message: `Congratulations! You won ₹${prizeInr.toLocaleString('en-IN')} for ${slot.positionTitle} in "${tournament.name}". Payout SLA started: administrator transfer scheduled within 24 hours to your registered payment method.`,
      type: 'financial',
      action_url: '/dashboard/wallet',
    });

    awardedCount++;
  }

  // Audit log
  await (adminClient.from('financial_audit_logs') as any).insert({
    actor_id: adminUserId,
    action: 'DISTRIBUTE_TOURNAMENT_PRIZES',
    target_type: 'tournaments',
    target_id: tournamentId,
    new_state: {
      tournament_id: tournamentId,
      tournament_name: tournament.name,
      awarded_count: awardedCount,
    },
  });

  return { success: true, awardedCount };
}

/**
 * Retrieves admin payouts queue with decrypted payment details for manual payout execution.
 * Prioritizes overdue payouts and upcoming 24h SLA deadlines.
 */
export async function getAdminPayoutsList(options?: {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ payouts: PayoutTransactionRecord[]; totalCount: number }> {
  const adminClient = createAdminClient();
  const page = Math.max(1, options?.page || 1);
  const pageSize = Math.max(1, Math.min(100, options?.pageSize || 20));
  const offset = (page - 1) * pageSize;
  const nowIso = new Date().toISOString();

  let query = (adminClient.from('payout_transactions') as any)
    .select(
      `
      id,
      payout_reference,
      player_id,
      prize_distribution_id,
      amount_paise,
      amount_inr,
      payment_method_id,
      payment_method_type,
      payout_status,
      utr_reference,
      processed_by,
      paid_at,
      eligible_at,
      deadline_at,
      receipt_url,
      receipt_reference,
      failure_reason,
      created_at,
      updated_at
      `,
      { count: 'exact' }
    );

  if (options?.status && options.status !== 'all') {
    if (options.status === 'overdue') {
      query = query
        .lt('deadline_at', nowIso)
        .not('payout_status', 'in', '("PAID","REJECTED")');
    } else {
      query = query.eq('payout_status', options.status);
    }
  }

  // Prioritize SLA: Order by deadline_at ascending so imminent & overdue items appear at the top
  query = query.order('deadline_at', { ascending: true, nullsFirst: false }).range(offset, offset + pageSize - 1);

  const { data, count, error } = await query;
  if (error || !data) {
    console.error('Error fetching admin payouts:', error);
    return { payouts: [], totalCount: 0 };
  }

  // Fetch player profiles
  const playerIds = [...new Set(data.map((r: any) => r.player_id).filter(Boolean))];
  const profileMap = new Map<string, any>();
  if (playerIds.length > 0) {
    const { data: profiles } = await (adminClient.from('profiles') as any)
      .select('id, display_name, email, efootball_id')
      .in('id', playerIds);
    if (profiles) {
      for (const p of profiles) {
        profileMap.set(p.id, p);
      }
    }
  }

  // Fetch tournament and prize distribution metadata
  const distIds = [...new Set(data.map((r: any) => r.prize_distribution_id).filter(Boolean))];
  const distMap = new Map<string, { tournamentName: string; positionTitle: string }>();
  if (distIds.length > 0) {
    const { data: dists } = await (adminClient.from('prize_distributions') as any)
      .select('id, position_title, tournament_id, tournaments:tournament_id (id, name)')
      .in('id', distIds);
    if (dists) {
      for (const d of dists) {
        distMap.set(d.id, {
          tournamentName: d.tournaments?.name || 'Tournament',
          positionTitle: d.position_title || 'Prize Winner',
        });
      }
    }
  }

  // Fetch payment methods with decrypted details for manual bank transfer execution
  const paymentMethodIds = [...new Set(data.map((r: any) => r.payment_method_id).filter(Boolean))];
  const paymentMethodMap = new Map<string, any>();
  if (paymentMethodIds.length > 0) {
    const { data: pms } = await (adminClient.from('player_payment_methods') as any)
      .select('id, payment_method_type, account_holder_name, bank_name, encrypted_account_number, masked_account_number, ifsc_code, upi_id, is_preferred')
      .in('id', paymentMethodIds);
    if (pms) {
      for (const pm of pms) {
        paymentMethodMap.set(pm.id, pm);
      }
    }
  }

  const payouts: PayoutTransactionRecord[] = data.map((row: any) => {
    let decryptedDetails: DecryptedPaymentDetails | null = null;
    const pm = row.payment_method_id ? paymentMethodMap.get(row.payment_method_id) : null;

    if (pm) {
      let plaintextAccount: string | null = null;
      if (pm.encrypted_account_number) {
        try {
          plaintextAccount = decryptSensitiveField(pm.encrypted_account_number);
        } catch {
          plaintextAccount = null;
        }
      }

      decryptedDetails = {
        id: pm.id,
        paymentMethodType: pm.payment_method_type,
        accountHolderName: pm.account_holder_name,
        bankName: pm.bank_name,
        accountNumber: plaintextAccount,
        maskedAccountNumber: pm.masked_account_number || (plaintextAccount ? maskAccountNumber(plaintextAccount) : null),
        ifscCode: pm.ifsc_code,
        upiId: pm.upi_id,
        isPreferred: Boolean(pm.is_preferred),
      };
    }

    const prof = profileMap.get(row.player_id);
    const distInfo = row.prize_distribution_id ? distMap.get(row.prize_distribution_id) : null;

    return {
      id: row.id,
      payoutReference: row.payout_reference,
      playerId: row.player_id,
      playerName: prof?.display_name || 'Player',
      playerEmail: prof?.email || null,
      prizeDistributionId: row.prize_distribution_id,
      tournamentName: distInfo?.tournamentName || null,
      positionTitle: distInfo?.positionTitle || null,
      amountPaise: Number(row.amount_paise),
      amountInr: Number(row.amount_inr),
      paymentMethodId: row.payment_method_id,
      paymentMethodType: row.payment_method_type,
      payoutStatus: row.payout_status,
      utrReference: null, // Admin details / UTR kept internal and not shared to users
      processedBy: null, // Admin user ID kept internal
      paidAt: row.paid_at,
      eligibleAt: row.eligible_at || row.created_at,
      deadlineAt: row.deadline_at || new Date(new Date(row.created_at).getTime() + 24 * 3600 * 1000).toISOString(),
      receiptUrl: row.receipt_url,
      receiptReference: row.receipt_reference,
      failureReason: row.failure_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      paymentDetails: decryptedDetails,
    };
  });

  return { payouts, totalCount: count || 0 };
}

/**
 * Updates payout status by an authorized financial administrator.
 * When status is set to PAID, requires UTR reference and inserts PAYOUT_COMPLETED into ledger.
 */
export async function updatePayoutStatus(params: {
  payoutId: string;
  adminUserId: string;
  newStatus: PayoutStatus;
  utrReference?: string;
  failureReason?: string;
  receiptUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  const adminClient = createAdminClient();
  const now = new Date().toISOString();

  // 1. Fetch current payout
  const { data: payout, error: fetchErr } = await (adminClient.from('payout_transactions') as any)
    .select(`
      id,
      payout_reference,
      player_id,
      amount_paise,
      amount_inr,
      payout_status,
      payment_method_type,
      prize_distribution_id,
      prize_distributions:prize_distribution_id (
        id,
        position_title,
        tournaments:tournament_id (id, name)
      )
    `)
    .eq('id', params.payoutId)
    .single();

  if (fetchErr || !payout) {
    return { success: false, error: 'Payout transaction record not found.' };
  }

  const tournamentName = payout.prize_distributions?.tournaments?.name || 'Tournament Prize';

  // 2. Validate transitions
  if (params.newStatus === 'PAID') {
    const utr = params.utrReference?.trim();
    if (!utr || utr.length < 4) {
      return { success: false, error: 'UTR / Transaction Reference is required to mark a payout as PAID.' };
    }

    const { error: updateErr } = await (adminClient.from('payout_transactions') as any)
      .update({
        payout_status: 'PAID',
        utr_reference: utr,
        receipt_url: params.receiptUrl || null,
        processed_by: params.adminUserId,
        paid_at: now,
        updated_at: now,
      })
      .eq('id', params.payoutId);

    if (updateErr) {
      return { success: false, error: 'Failed to record payout completion.' };
    }

    // Insert PAYOUT_COMPLETED transaction into financial ledger
    const wallet = await getOrCreatePlayerWallet(payout.player_id);
    const dateStr = now.slice(0, 10).replace(/-/g, '');
    const txRef = `TX-PAY-${dateStr}-${payout.id.slice(0, 8).toUpperCase()}`;

    await (adminClient.from('wallet_transactions') as any).insert({
      transaction_ref: txRef,
      wallet_id: wallet.id,
      user_id: payout.player_id,
      transaction_type: 'PAYOUT_COMPLETED',
      amount_paise: payout.amount_paise,
      amount_inr: payout.amount_inr,
      status: 'completed',
      reference_type: 'payout',
      reference_id: payout.id,
      description: `Prize Payout via ${payout.payment_method_type === 'upi' ? 'Google Pay / UPI' : 'Bank Transfer'}`,
      idempotency_key: `payout-paid-${payout.id}`,
      created_at: now,
    });

    // Notify player
    await (adminClient.from('player_notifications') as any).insert({
      user_id: payout.player_id,
      title: 'Prize Payout Completed! 💸',
      message: `Your tournament prize payout of ₹${Number(payout.amount_inr).toLocaleString('en-IN')} for "${tournamentName}" has been successfully transferred to your registered ${payout.payment_method_type === 'upi' ? 'Google Pay / UPI' : 'Bank'} destination.`,
      type: 'financial',
      action_url: '/dashboard/wallet',
    });
  } else if (params.newStatus === 'PROCESSING') {
    await (adminClient.from('payout_transactions') as any)
      .update({
        payout_status: 'PROCESSING',
        processed_by: params.adminUserId,
        updated_at: now,
      })
      .eq('id', params.payoutId);

    await (adminClient.from('player_notifications') as any).insert({
      user_id: payout.player_id,
      title: 'Payout Processing Initiated',
      message: `Your prize payout of ₹${Number(payout.amount_inr).toLocaleString('en-IN')} for "${tournamentName}" is currently being transferred by our finance team.`,
      type: 'financial',
      action_url: '/dashboard/wallet',
    });
  } else if (params.newStatus === 'REJECTED' || params.newStatus === 'FAILED') {
    const reason = params.failureReason?.trim();
    if (!reason) {
      return { success: false, error: 'A mandatory explanation reason is required when rejecting or failing a payout.' };
    }

    await (adminClient.from('payout_transactions') as any)
      .update({
        payout_status: params.newStatus,
        failure_reason: reason,
        processed_by: params.adminUserId,
        updated_at: now,
      })
      .eq('id', params.payoutId);

    // Unpaid liability remains preserved because no PAYOUT_COMPLETED transaction was added
    await (adminClient.from('player_notifications') as any).insert({
      user_id: payout.player_id,
      title: `Payout ${params.newStatus === 'REJECTED' ? 'Rejected' : 'Failed'}`,
      message: `Your payout transfer (${payout.payout_reference}) for "${tournamentName}" could not be completed. Reason: ${reason}. Your balance remains preserved in your wallet; our administrator will review.`,
      type: 'financial',
      action_url: '/dashboard/wallet',
    });
  } else if (params.newStatus === 'APPROVED') {
    // Retry / reset to approved
    await (adminClient.from('payout_transactions') as any)
      .update({
        payout_status: 'APPROVED',
        processed_by: params.adminUserId,
        updated_at: now,
      })
      .eq('id', params.payoutId);
  }

  // Audit log
  await (adminClient.from('financial_audit_logs') as any).insert({
    actor_id: params.adminUserId,
    action: `UPDATE_PAYOUT_STATUS_${params.newStatus}`,
    target_type: 'payout_transactions',
    target_id: params.payoutId,
    previous_state: { status: payout.payout_status },
    new_state: {
      status: params.newStatus,
      utr_reference: params.utrReference || null,
      failure_reason: params.failureReason || null,
    },
  });

  return { success: true };
}
