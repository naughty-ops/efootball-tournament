'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedUser, requireFinancialAdmin } from '@/lib/auth/server';
import {
  savePlayerBankAccount,
  savePlayerUpiDetails,
  setPreferredPaymentMethod,
  requestPlayerPayout,
  requestPlayerWalletRedemption,
  distributeTournamentPrizes,
  updatePayoutStatus,
  getWalletPaymentSettings,
  updateWalletPaymentSettings,
  createWalletDepositRequest,
  adminApproveDeposit,
  adminRejectDeposit,
  getPlayerWalletOverview,
} from '@/services/walletService';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PaymentMethodType, PayoutStatus, WalletPaymentSettings, WalletDepositRecord } from '@/types/wallet';

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

    const supabase = await createClient();
    const res = await savePlayerBankAccount(user.id, params, supabase);
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

    const supabase = await createClient();
    const res = await savePlayerUpiDetails(user.id, params, supabase);
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

    const supabase = await createClient();
    const res = await setPreferredPaymentMethod(user.id, params.paymentMethodType, supabase);
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
 * Server Action for players to request an amount to redeem from their available wallet balance.
 * Atomically locks funds and generates an official Redemption Support Ticket (24h SLA).
 */
export async function requestRedeemAmountAction(params: {
  amountInr: number;
  paymentMethodId?: string;
  upiId?: string;
  notes?: string;
}): Promise<
  ActionResult<{
    ticketId: string;
    ticketNumber: string;
    payoutReference: string;
    amountInr: number;
    destination: string;
    newAvailableBalanceInr: number;
  }>
> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    if (!params.amountInr || params.amountInr < 10) {
      return { success: false, error: 'Minimum redemption amount is ₹10.' };
    }

    const res = await requestPlayerWalletRedemption(user.id, params);
    if (!res.success) {
      return { success: false, error: res.error };
    }

    revalidatePath('/dashboard/wallet');
    revalidatePath('/dashboard/tickets');
    revalidatePath('/admin/payouts');
    revalidatePath('/admin/tickets');

    return {
      success: true,
      data: {
        ticketId: res.ticketId!,
        ticketNumber: res.ticketNumber!,
        payoutReference: res.payoutReference!,
        amountInr: res.amountInr!,
        destination: res.destination!,
        newAvailableBalanceInr: res.newAvailableBalanceInr!,
      },
    };
  } catch (err: any) {
    console.error('requestRedeemAmountAction error:', err);
    return { success: false, error: err.message || 'Failed to submit redemption request.' };
  }
}

/**
 * Server Action for players to request a manual prize payout.
 */
export async function requestPayoutAction(params?: {
  amountInr?: number;
  paymentMethodId?: string;
  upiId?: string;
  notes?: string;
}): Promise<ActionResult<{ payoutReference: string; ticketNumber?: string; ticketId?: string }>> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    const res = await requestPlayerPayout(user.id, params);
    if (!res.success) {
      return { success: false, error: res.error };
    }

    revalidatePath('/dashboard/wallet');
    revalidatePath('/dashboard/tickets');
    revalidatePath('/admin/payouts');
    revalidatePath('/admin/tickets');
    return {
      success: true,
      data: {
        payoutReference: res.payoutReference!,
        ticketNumber: res.ticketNumber,
        ticketId: res.ticketId,
      },
    };
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

    const supabase = await createClient();
    await (supabase.from('player_notifications') as any)
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

/**
 * Server Action for players to submit a manual UPI deposit request with screenshot proof and UTR.
 */
export async function submitWalletDepositAction(formData: FormData): Promise<ActionResult<{ depositId: string; depositRef: string }>> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    const amountInrStr = formData.get('amountInr') as string;
    const utrReference = formData.get('utrReference') as string;
    const playerNotes = (formData.get('playerNotes') as string) || '';
    const file = formData.get('screenshot') as File | null;

    if (!amountInrStr) {
      return { success: false, error: 'Deposit amount is required.' };
    }

    const amountInr = Number(amountInrStr);
    if (!Number.isFinite(amountInr) || amountInr <= 0) {
      return { success: false, error: 'Please enter a valid numeric deposit amount.' };
    }

    if (!utrReference || !utrReference.trim()) {
      return { success: false, error: '12-digit UTR / UPI Transaction Reference ID is required.' };
    }

    if (!file || file.size === 0) {
      return { success: false, error: 'Payment screenshot proof is mandatory.' };
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return { success: false, error: 'Unsupported file format. Please upload a JPG, PNG, or WEBP image.' };
    }

    // Validate file size (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return { success: false, error: 'Screenshot file size exceeds 5MB limit. Please upload a smaller image.' };
    }

    // Generate unique storage path
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
    const cleanExt = ['jpg', 'jpeg', 'png', 'webp'].includes(fileExt) ? fileExt : 'png';
    const timestamp = Date.now();
    const randomHex = Math.random().toString(36).substring(2, 8);
    const storagePath = `${user.id}/${timestamp}_${randomHex}.${cleanExt}`;

    // Upload to private Supabase Storage bucket 'payment-proofs'
    // Strategy: Try admin client first (bypasses RLS); if service key unavailable,
    // fall back to authenticated user's client (path matches user_id, satisfying RLS).
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Prefer admin client upload (service role bypasses RLS)
    const adminClient = createAdminClient();
    let uploadError: any = null;

    const { error: adminUploadError } = await adminClient.storage
      .from('payment-proofs')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (adminUploadError) {
      // Admin client failed — fall back to authenticated user's client.
      // The storage path starts with user.id so it satisfies the per-user RLS policy.
      console.warn('Admin storage upload failed, falling back to user-session upload:', adminUploadError.message);
      const userSupabase = await createClient();
      const { error: userUploadError } = await userSupabase.storage
        .from('payment-proofs')
        .upload(storagePath, buffer, {
          contentType: file.type,
          upsert: false,
        });
      uploadError = userUploadError;
    }

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return { success: false, error: `Failed to upload payment proof screenshot: ${uploadError.message}` };
    }

    // Create deposit request in database
    const depositRes = await createWalletDepositRequest({
      userId: user.id,
      amountInr,
      utrReference: utrReference.trim(),
      proofImagePath: storagePath,
      playerNotes,
    });

    if (!depositRes.success) {
      return { success: false, error: depositRes.error };
    }

    revalidatePath('/dashboard/wallet');
    revalidatePath('/admin/wallet');

    return {
      success: true,
      data: {
        depositId: depositRes.depositId!,
        depositRef: depositRes.depositRef!,
      },
    };
  } catch (err: any) {
    console.error('submitWalletDepositAction error:', err);
    return { success: false, error: err.message || 'Failed to submit deposit request.' };
  }
}

/**
 * Server Action to fetch active wallet payment settings (QR code, UPI ID, Phone, limits).
 */
export async function getWalletPaymentSettingsAction(): Promise<ActionResult<WalletPaymentSettings>> {
  try {
    const settings = await getWalletPaymentSettings();
    return { success: true, data: settings };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to load payment settings' };
  }
}

/**
 * Server Action for admins to update UPI payment configuration.
 */
export async function updateWalletPaymentSettingsAction(
  settings: Partial<WalletPaymentSettings>
): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireFinancialAdmin();
    const res = await updateWalletPaymentSettings(settings, adminUser.id);
    if (!res.success) {
      return { success: false, error: res.error };
    }

    revalidatePath('/admin/wallet');
    revalidatePath('/dashboard/wallet');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update payment configuration' };
  }
}

/**
 * Server Action for admins to upload or replace the active UPI QR code image.
 */
export async function uploadAdminQrCodeAction(formData: FormData): Promise<ActionResult<{ publicUrl: string }>> {
  try {
    const { user: adminUser } = await requireFinancialAdmin();
    const file = formData.get('file') as File | null;

    if (!file || file.size === 0) {
      return { success: false, error: 'No QR image file provided.' };
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      return { success: false, error: 'Supported formats: PNG, JPG, WEBP, SVG.' };
    }

    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: 'File size exceeds 5MB limit.' };
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
    const fileName = `admin_upi_qr_${Date.now()}.${fileExt}`;
    const storagePath = `qr/${fileName}`;

    const adminClient = createAdminClient();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadErr } = await adminClient.storage
      .from('payment-assets')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadErr) {
      return { success: false, error: `Upload failed: ${uploadErr.message}` };
    }

    const { data: publicData } = adminClient.storage
      .from('payment-assets')
      .getPublicUrl(storagePath);

    const publicUrl = publicData.publicUrl;

    // Automatically update wallet_payment_settings with new QR URL
    await updateWalletPaymentSettings({ upiQrImageUrl: publicUrl }, adminUser.id);

    revalidatePath('/admin/wallet');
    revalidatePath('/dashboard/wallet');

    return { success: true, data: { publicUrl } };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to upload QR code image' };
  }
}

/**
 * Server Action for admins to approve a pending deposit request.
 */
export async function adminApproveDepositAction(params: {
  depositId: string;
  adminNotes?: string;
}): Promise<ActionResult<{ newBalancePaise?: number; transactionRef?: string }>> {
  try {
    const { user: adminUser } = await requireFinancialAdmin();
    const res = await adminApproveDeposit({
      depositId: params.depositId,
      adminUserId: adminUser.id,
      adminNotes: params.adminNotes,
    });

    if (!res.success) {
      return { success: false, error: res.error };
    }

    revalidatePath('/admin/wallet');
    revalidatePath('/dashboard/wallet');
    return { success: true, data: res };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to approve deposit request' };
  }
}

/**
 * Server Action for admins to reject a pending deposit request.
 */
export async function adminRejectDepositAction(params: {
  depositId: string;
  rejectionReason: string;
}): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireFinancialAdmin();
    const res = await adminRejectDeposit({
      depositId: params.depositId,
      adminUserId: adminUser.id,
      rejectionReason: params.rejectionReason,
    });

    if (!res.success) {
      return { success: false, error: res.error };
    }

    revalidatePath('/admin/wallet');
    revalidatePath('/dashboard/wallet');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to reject deposit request' };
  }
}

/**
 * Server Action to fetch the authenticated player's wallet balance & status.
 */
export async function getPlayerWalletBalanceAction(): Promise<ActionResult<{
  availableBalancePaise: number;
  availableBalanceInr: number;
  lockedBalancePaise: number;
  lockedBalanceInr: number;
  walletStatus: string;
}>> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    const overview = await getPlayerWalletOverview(user.id);
    return {
      success: true,
      data: {
        availableBalancePaise: overview.availableBalancePaise,
        availableBalanceInr: overview.availableBalanceInr,
        lockedBalancePaise: overview.lockedBalancePaise,
        lockedBalanceInr: overview.lockedBalanceInr,
        walletStatus: overview.walletStatus,
      },
    };
  } catch (err: any) {
    console.error('getPlayerWalletBalanceAction error:', err);
    return { success: false, error: err.message || 'Failed to fetch wallet balance.' };
  }
}

