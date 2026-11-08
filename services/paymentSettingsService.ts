import type { SupabaseClient } from '@supabase/supabase-js';
import type { ManualPaymentSettings } from '@/types/database';

type AnySupabaseClient = SupabaseClient<any, any, any> | any;

export const DEFAULT_MANUAL_PAYMENT_SETTINGS: ManualPaymentSettings = {
  admin_whatsapp_number: '+919207516227',
  upi_id: 'efootball@upi',
  account_holder_name: 'eFootball Tournament Admin',
  bank_name: 'State Bank of India',
  account_number: '',
  ifsc_code: '',
  instructions: 'Send payment via UPI or Bank Transfer. Then click "Pay via WhatsApp" to share the payment screenshot and your Registration ID with the admin.',
  verification_notice: 'Manual payment verification takes between 10 to 30 minutes during active hours. Once verified, your slot will be confirmed automatically.',
};

/**
 * Fetch manual payment settings from public.site_settings
 */
export async function getManualPaymentSettings(
  supabase: AnySupabaseClient
): Promise<ManualPaymentSettings> {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'payment_settings')
      .maybeSingle();

    if (error || !data || !data.value) {
      return DEFAULT_MANUAL_PAYMENT_SETTINGS;
    }

    return {
      ...DEFAULT_MANUAL_PAYMENT_SETTINGS,
      ...(data.value as Partial<ManualPaymentSettings>),
    };
  } catch (err) {
    console.error('Error fetching manual payment settings:', err);
    return DEFAULT_MANUAL_PAYMENT_SETTINGS;
  }
}

/**
 * Update manual payment settings in public.site_settings (requires admin privileges)
 */
export async function updateManualPaymentSettings(
  supabase: AnySupabaseClient,
  settings: ManualPaymentSettings
): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await (supabase.from('site_settings') as any).upsert({
      key: 'payment_settings',
      value: settings,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      return { success: false, message: error.message || 'Failed to update payment settings.' };
    }

    return { success: true, message: 'Manual payment settings updated successfully.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error updating payment settings.';
    return { success: false, message: msg };
  }
}
