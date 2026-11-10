'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedUser, requireFinancialAdmin } from '@/lib/auth/server';
import {
  savePlayerBankAccount,
  savePlayerUpiDetails,
  setPreferredPaymentMethod,
  requestPlayerPayout,
  distributeTournamentPrizes,
  updatePayoutStatus,
} from '@/services/walletService';
import { createAdminClient } from '@/lib/supabase/admin';
import { PaymentMethodType, PayoutStatus } from '@/types/wallet';

export interface ActionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server Action for players to securely save/update their Bank Account details.
 */
export async function saveBankAccountAction(params: {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifscCode: string;
  isPreferred?: boolean;
}): Promise<ActionResult> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    const res = await savePlayerBankAccount(user.id, params);
    if (!res.success) {
      return res;
    }

    revalidatePath('/dashboard/wallet');
    revalidatePath('/dashboard/profile');
    return { success: true };
  } catch (err: any) {
    console.error('saveBankAccountAction error:', err);
    return { success: false, error: err.message || 'Failed to save bank account details.' };
  }
}

/**
 * Server Action for players to securely save/update their UPI / Google Pay ID.
 */
export async function saveUpiDetailsAction(params: {
  upiId: string;
  confirmUpiId: string;
  isPreferred?: boolean;
}): Promise<ActionResult> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    const res = await savePlayerUpiDetails(user.id, params);
    if (!res.success) {
      return res;
    }

    revalidatePath('/dashboard/wallet');
    revalidatePath('/dashboard/profile');
    return { success: true };
  } catch (err: any) {
    console.error('saveUpiDetailsAction error:', err);
    return { success: false, error: err.message || 'Failed to save UPI details.' };
  }
}

/**
 * Server Action for players to toggle their preferred payment method.
 */
export async function setPreferredPaymentMethodAction(params: {
  paymentMethodType: PaymentMethodType;
}): Promise<ActionResult> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    const res = await setPreferredPaymentMethod(user.id, params.paymentMethodType);
    if (!res.success) {
      return res;
    }

    revalidatePath('/dashboard/wallet');
    revalidatePath('/dashboard/profile');
    return { success: true };
  } catch (err: any) {
    console.error('setPreferredPaymentMethodAction error:', err);
    return { success: false, error: err.message || 'Failed to update preferred payment method.' };
  }
}

/**
 * Server Action for players to request a manual prize payout.
 */
export async function requestPayoutAction(): Promise<ActionResult<{ payoutReference: string }>> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    const res = await requestPlayerPayout(user.id);
    if (!res.success) {
      return { success: false, error: res.error };
    }

    revalidatePath('/dashboard/wallet');
    revalidatePath('/admin/payouts');
    return { success: true, data: { payoutReference: res.payoutReference! } };
  } catch (err: any) {
    console.error('requestPayoutAction error:', err);
    return { success: false, error: err.message || 'Failed to submit payout request.' };
  }
}

/**
 * Server Action for administrators to distribute prizes for a completed tournament.
 */
export async function adminDistributePrizesAction(params: {
  tournamentId: string;
  customNotes?: string;
}): Promise<ActionResult<{ awardedCount: number }>> {
  try {
    const { user: adminUser } = await requireFinancialAdmin();
    const res = await distributeTournamentPrizes(params.tournamentId, adminUser.id, params.customNotes);

    if (!res.success) {
      return { success: false, error: res.error };
    }

    revalidatePath('/admin/payouts');
    revalidatePath('/dashboard/wallet');
    revalidatePath(`/tournaments/${params.tournamentId}`);
    return { success: true, data: { awardedCount: res.awardedCount! } };
  } catch (err: any) {
    console.error('adminDistributePrizesAction error:', err);
    return { success: false, error: err.message || 'Failed to distribute tournament prizes.' };
  }
}

/**
 * Server Action for administrators to update payout status (PROCESSING, PAID, REJECTED, FAILED).
 */
export async function adminUpdatePayoutStatusAction(params: {
  payoutId: string;
  newStatus: PayoutStatus;
  utrReference?: string;
  failureReason?: string;
  receiptUrl?: string;
}): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireFinancialAdmin();
    const res = await updatePayoutStatus({
      payoutId: params.payoutId,
      adminUserId: adminUser.id,
      newStatus: params.newStatus,
      utrReference: params.utrReference,
      failureReason: params.failureReason,
      receiptUrl: params.receiptUrl,
    });

    if (!res.success) {
      return { success: false, error: res.error };
    }

    revalidatePath('/admin/payouts');
    revalidatePath('/dashboard/wallet');
    revalidatePath('/dashboard/profile');
    return { success: true };
  } catch (err: any) {
    console.error('adminUpdatePayoutStatusAction error:', err);
    return { success: false, error: err.message || 'Failed to update payout status.' };
  }
}

/**
 * Server Action to mark player notifications as read.
 */
export async function markNotificationReadAction(notificationId: string): Promise<ActionResult> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const adminClient = createAdminClient();
    await (adminClient.from('player_notifications') as any)
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', user.id);

    revalidatePath('/dashboard/wallet');
    revalidatePath('/dashboard/profile');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
