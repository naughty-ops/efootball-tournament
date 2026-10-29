'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { profileUpdateSchema, type ProfileUpdateInput } from '@/lib/validations';
import { selfRegisterTournament } from '@/services/playerDashboardService';

export type ActionResponse = {
  success: boolean;
  message: string;
  data?: any;
};

/**
 * Register the authenticated user for an open tournament
 */
export async function registerForTournamentAction(
  tournamentId: string,
  options?: { rulesAccepted?: boolean } | boolean
): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return {
        success: false,
        message: 'You must be signed in to register for tournaments.',
      };
    }

    const result = await selfRegisterTournament(supabase, user.id, tournamentId, { rulesAccepted: true });

    if (result.success) {
      revalidatePath(`/tournaments/${tournamentId}`);
      revalidatePath(`/t/${tournamentId}`);
      revalidatePath('/dashboard');
      revalidatePath('/dashboard/tournaments');
      revalidatePath('/tournaments');
    }

    return {
      success: result.success,
      message: result.message,
      data: { participantId: result.participantId },
    };
  } catch (err: any) {
    console.error('Error in registerForTournamentAction:', err);
    return {
      success: false,
      message: err.message || 'An unexpected error occurred during registration.',
    };
  }
}

/**
 * Cancel own registration before tournament starts
 */
export async function cancelRegistrationAction(tournamentId: string): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return {
        success: false,
        message: 'You must be signed in to manage registrations.',
      };
    }

    // Check tournament status
    const { data: tourney } = await (supabase.from('tournaments') as any)
      .select('status')
      .eq('id', tournamentId)
      .single();

    if (!tourney || tourney.status !== 'registration') {
      return {
        success: false,
        message: 'Registrations cannot be cancelled after the tournament begins or closes.',
      };
    }

    const { error: delErr } = await (supabase.from('participants') as any)
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('user_id', user.id);

    if (delErr) {
      return {
        success: false,
        message: delErr.message || 'Failed to cancel registration.',
      };
    }

    revalidatePath(`/tournaments/${tournamentId}`);
    revalidatePath(`/t/${tournamentId}`);
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/tournaments');
    revalidatePath('/tournaments');

    return {
      success: true,
      message: 'Registration successfully withdrawn.',
    };
  } catch (err: any) {
    console.error('Error in cancelRegistrationAction:', err);
    return {
      success: false,
      message: err.message || 'An unexpected error occurred.',
    };
  }
}

/**
 * Updates player profile details (Full Name, eFootball ID, WhatsApp Number).
 * Persists changes to Supabase Auth metadata and profiles table.
 */
export async function updatePlayerProfileAction(
  input: { fullName?: string; efootballId?: string; whatsappNumber?: string }
): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return {
        success: false,
        message: 'You must be signed in to update your profile.',
      };
    }

    const currentMeta = user.user_metadata || {};
    const fullNameToValidate = input.fullName !== undefined ? input.fullName.trim() : (currentMeta.full_name || 'Player');
    const efootballIdToValidate = input.efootballId !== undefined ? input.efootballId.trim() : (currentMeta.efootball_id || '');
    const whatsappNumberToValidate = input.whatsappNumber !== undefined ? input.whatsappNumber.trim() : (currentMeta.whatsapp_number || '');

    // Validate using profileUpdateSchema
    const parseResult = profileUpdateSchema.safeParse({
      fullName: fullNameToValidate,
      efootballId: efootballIdToValidate,
      whatsappNumber: whatsappNumberToValidate,
    });

    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      return {
        success: false,
        message: firstIssue?.message || 'Invalid profile information. Please check your inputs.',
      };
    }

    const { fullName: validatedName, efootballId: validatedEfootballId, whatsappNumber: validatedWhatsapp } = parseResult.data;

    const whatsappChanged = validatedWhatsapp !== currentMeta.whatsapp_number;
    const nowIso = new Date().toISOString();

    const updatedMetadata = {
      ...currentMeta,
      full_name: validatedName,
      name: validatedName,
      efootball_id: validatedEfootballId,
      efootball_id_verified: true, // eid verified by format
      efootball_verification_status: 'verified',
      whatsapp_number: validatedWhatsapp,
      ...(whatsappChanged ? {
        whatsapp_verified: false,
        whatsapp_verification_status: 'not_submitted',
        whatsapp_verification_requested_at: null,
      } : {}),
      updated_at: nowIso,
    };

    // 1. Update Supabase Auth user metadata
    const { error: updateAuthErr } = await supabase.auth.updateUser({
      data: updatedMetadata,
    });

    if (updateAuthErr) {
      console.error('Error updating user metadata:', updateAuthErr);
      return {
        success: false,
        message: updateAuthErr.message || 'Failed to update profile.',
      };
    }

    // 2. Update profiles table if available
    try {
      await (supabase.from('profiles') as any).upsert({
        id: user.id,
        email: user.email,
        display_name: validatedName,
        efootball_id: validatedEfootballId,
        efootball_id_verified: true,
        efootball_verification_status: 'verified',
        whatsapp_number: validatedWhatsapp,
        ...(whatsappChanged ? {
          whatsapp_verified: false,
          whatsapp_verification_status: 'not_submitted',
        } : {}),
        updated_at: nowIso,
      }, { onConflict: 'id' });
    } catch {
      // Non-fatal if profiles table migration not yet run
    }

    revalidatePath('/dashboard/profile');
    revalidatePath('/dashboard');
    revalidatePath('/admin/dashboard');

    return {
      success: true,
      message: 'Profile details saved successfully!',
      data: {
        profile: {
          display_name: validatedName,
          efootball_id: validatedEfootballId,
          efootball_id_verified: true,
          efootball_verification_status: 'verified',
          whatsapp_number: validatedWhatsapp,
          whatsapp_verified: whatsappChanged ? false : (currentMeta.whatsapp_verified === true),
          whatsapp_verification_status: whatsappChanged ? 'not_submitted' : (currentMeta.whatsapp_verification_status || 'not_submitted'),
        },
      },
    };
  } catch (err: any) {
    console.error('Error in updatePlayerProfileAction:', err);
    return {
      success: false,
      message: err.message || 'An unexpected error occurred while saving profile.',
    };
  }
}
