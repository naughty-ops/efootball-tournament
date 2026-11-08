'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '@/lib/auth/server';
import { tournamentSchema, isEligibleTournamentName, type TournamentInput } from '@/lib/validations';
import { ALLOWED_STATUS_TRANSITIONS } from '@/services/tournamentService';
import type { TournamentStatus, TournamentFormat } from '@/types/database';

export type ActionResponse<T = any> = {
  success: boolean;
  message: string;
  data?: T;
};

function computePaiseAmount(rupees?: number | null, explicitPaise?: number | null): number {
  if (typeof explicitPaise === 'number' && Number.isFinite(explicitPaise) && explicitPaise >= 0) {
    return Math.floor(explicitPaise);
  }
  if (typeof rupees === 'number' && Number.isFinite(rupees) && rupees >= 0) {
    return Math.round(rupees * 100);
  }
  return 0;
}

/**
 * Validates tournament name eligibility and verifies that no other tournament
 * already exists with the same name (case-insensitive and trimmed).
 */
export async function checkTournamentNameAvailabilityAction(
  name: string,
  excludeId?: string
): Promise<{ available: boolean; error?: string }> {
  const eligibility = isEligibleTournamentName(name);
  if (!eligibility.eligible) {
    return { available: false, error: eligibility.error };
  }

  const trimmed = name.trim();
  const supabase = await createClient();

  let query = (supabase.from('tournaments') as any)
    .select('id, name')
    .ilike('name', trimmed);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data: matches, error } = await query;
  if (error) {
    console.error('Error checking tournament name availability:', error);
    return { available: false, error: 'Database error validating tournament name.' };
  }

  const hasExactCollision = (matches || []).some(
    (t: any) => t.name.trim().toLowerCase() === trimmed.toLowerCase()
  );

  if (hasExactCollision) {
    return {
      available: false,
      error: `A tournament named "${trimmed}" already exists. Please choose a unique name.`,
    };
  }

  return { available: true };
}

/**
 * Server action: Create a new tournament
 * Strictly requires verified administrator authentication (ye.agrajj@gmail.com).
 */
export async function createTournamentAction(input: TournamentInput): Promise<ActionResponse> {
  try {
    // 1. Enforce strict server-side admin authorization
    await requireAdmin();

    // 2. Validate input schema
    const parseResult = tournamentSchema.safeParse(input);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message || 'Invalid tournament configuration.';
      return { success: false, message: firstError };
    }

    const validData = parseResult.data;
    const trimmedName = validData.name.trim();

    // Check name eligibility
    const nameCheck = isEligibleTournamentName(trimmedName);
    if (!nameCheck.eligible) {
      return { success: false, message: nameCheck.error || 'Tournament name is not eligible.' };
    }

    const supabase = await createClient();

    // Prevent duplicate tournament creation: check if a tournament with this name already exists
    const { data: existingTournaments, error: nameLookupError } = await (supabase.from('tournaments') as any)
      .select('id, name')
      .ilike('name', trimmedName);

    if (nameLookupError) {
      console.error('Error checking duplicate tournament name:', nameLookupError);
    } else if (existingTournaments && existingTournaments.length > 0) {
      const isDuplicate = existingTournaments.some(
        (t: any) => t.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );
      if (isDuplicate) {
        return {
          success: false,
          message: `A tournament named "${trimmedName}" already exists. Duplicate tournament creation is blocked.`,
        };
      }
    }
    const dbFormat = validData.format === 'single_league_knockout' ? 'group_knockout' : (validData.format as TournamentFormat);

    const isPaid = Boolean(validData.is_paid);
    const entryFeePaise = isPaid
      ? computePaiseAmount(validData.entry_fee_rupees, validData.entry_fee_paise)
      : 0;
    const prizePoolPaise = computePaiseAmount(validData.prize_pool_rupees, validData.prize_pool_paise);
    const firstPlacePaise = computePaiseAmount(validData.first_place_rupees, validData.first_place_paise);
    const secondPlacePaise = computePaiseAmount(validData.second_place_rupees, validData.second_place_paise);
    const thirdPlacePaise = computePaiseAmount(validData.third_place_rupees, validData.third_place_paise);
    let totalPrizePoolPaise = prizePoolPaise;
    if (totalPrizePoolPaise === 0 && (firstPlacePaise > 0 || secondPlacePaise > 0 || thirdPlacePaise > 0)) {
      totalPrizePoolPaise = firstPlacePaise + secondPlacePaise + thirdPlacePaise;
    }

    const prizeDistribution = {
      first: { paise: firstPlacePaise, notes: validData.first_place_notes?.trim() || null },
      second: { paise: secondPlacePaise, notes: validData.second_place_notes?.trim() || null },
      third: { paise: thirdPlacePaise, notes: validData.third_place_notes?.trim() || null },
    };

    const isPrivate = Boolean(validData.is_private);
    let accessCodeHash: string | null = null;
    if (isPrivate) {
      if (!validData.access_code?.trim()) {
        return { success: false, message: 'An access code is required when creating a private tournament.' };
      }
      accessCodeHash = await bcrypt.hash(validData.access_code.trim(), 10);
    }

    const insertPayload: Record<string, any> = {
      name: validData.name.trim(),
      description: validData.description?.trim() || null,
      format: dbFormat,
      status: validData.status as TournamentStatus,
      start_date: validData.start_date ? new Date(validData.start_date).toISOString() : null,
      end_date: validData.end_date ? new Date(validData.end_date).toISOString() : null,
      registration_deadline: validData.registration_deadline ? new Date(validData.registration_deadline).toISOString() : null,
      rules_text: validData.rules_text?.trim() || null,
      banner_image: validData.banner_image?.trim() || null,
      max_participants: validData.max_participants,
      qualifiers_per_group: validData.qualifiers_per_group || 2,
      rounds_per_pair: validData.rounds_per_pair || 1,
      is_paid: isPaid,
      entry_fee_paise: entryFeePaise,
      prize_pool_paise: totalPrizePoolPaise,
      first_place_prize_paise: firstPlacePaise,
      first_place_notes: validData.first_place_notes?.trim() || null,
      second_place_prize_paise: secondPlacePaise,
      second_place_notes: validData.second_place_notes?.trim() || null,
      third_place_prize_paise: thirdPlacePaise,
      third_place_notes: validData.third_place_notes?.trim() || null,
      prize_distribution: prizeDistribution,
      currency: validData.currency?.trim() || 'INR',
      is_private: isPrivate,
      access_code_hash: accessCodeHash,
    };

    const { data: newTournament, error } = await (supabase.from('tournaments') as any)
      .insert(insertPayload)
      .select('id, name, status, format, is_paid, is_private, entry_fee_paise')
      .single();

    if (error) {
      if ((error as any).code === '42703' && isPrivate) {
        return {
          success: false,
          message:
            'Database schema does not support private tournaments (column "is_private" missing). Creation aborted to prevent unauthenticated public exposure.',
        };
      }
      console.error('Error creating tournament in server action:', error);
      return {
        success: false,
        message: error.message || 'Failed to create tournament in database.',
      };
    }

    // 3. Revalidate affected routes
    revalidatePath('/admin/tournaments');
    revalidatePath('/tournaments');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Tournament "${newTournament.name}" created successfully!`,
      data: newTournament,
    };
  } catch (err: any) {
    console.error('createTournamentAction unhandled error:', err);
    return {
      success: false,
      message: err.message || 'Unauthorized or server error creating tournament.',
    };
  }
}

/**
 * Server action: Update an existing tournament
 * Strictly requires verified administrator authentication (ye.agrajj@gmail.com).
 */
export async function updateTournamentAction(
  id: string,
  input: TournamentInput
): Promise<ActionResponse> {
  try {
    await requireAdmin();

    if (!id || typeof id !== 'string') {
      return { success: false, message: 'Tournament ID is required.' };
    }

    const parseResult = tournamentSchema.safeParse(input);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message || 'Invalid tournament configuration.';
      return { success: false, message: firstError };
    }

    const validData = parseResult.data;
    const dbFormat = validData.format === 'single_league_knockout' ? 'group_knockout' : (validData.format as TournamentFormat);

    const supabase = await createClient();

    // 1. Fetch existing tournament to ensure safe updates
    let { data: existing, error: existErr } = await (supabase.from('tournaments') as any)
      .select('id, name, format, status, confirmed_slots_count, reserved_slots_count, is_paid, entry_fee_paise, currency, is_private, access_code_hash')
      .eq('id', id)
      .single();

    if (existErr && (existErr as any).code === '42703') {
      const fallbackExist = await (supabase.from('tournaments') as any)
        .select('id, name, format, status, confirmed_slots_count, reserved_slots_count, is_paid, entry_fee_paise, currency')
        .eq('id', id)
        .single();
      existing = fallbackExist.data;
      existErr = fallbackExist.error;
    }

    if (existErr || !existing) {
      return { success: false, message: 'Tournament not found.' };
    }

    // 1b. Validate tournament name eligibility & uniqueness if changed
    const trimmedName = validData.name.trim();
    const nameCheck = isEligibleTournamentName(trimmedName);
    if (!nameCheck.eligible) {
      return { success: false, message: nameCheck.error || 'Tournament name is not eligible.' };
    }

    if (existing.name.trim().toLowerCase() !== trimmedName.toLowerCase()) {
      const { data: duplicateCheck, error: dupErr } = await (supabase.from('tournaments') as any)
        .select('id, name')
        .ilike('name', trimmedName)
        .neq('id', id);

      if (!dupErr && duplicateCheck && duplicateCheck.length > 0) {
        const isDuplicate = duplicateCheck.some(
          (t: any) => t.name.trim().toLowerCase() === trimmedName.toLowerCase()
        );
        if (isDuplicate) {
          return {
            success: false,
            message: `Another tournament named "${trimmedName}" already exists. Please choose a unique name.`,
          };
        }
      }
    }

    // 2. Validate status lifecycle transition (Task 2)
    const currentStatus = existing.status as TournamentStatus;
    const targetStatus = validData.status as TournamentStatus;

    if (targetStatus !== currentStatus) {
      const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(targetStatus)) {
        return {
          success: false,
          message: `Invalid status transition: Cannot change status from "${currentStatus}" to "${targetStatus}". Allowed transitions: ${allowed.join(', ') || 'none'}.`,
        };
      }

      // Guard: Cannot revert tournament to draft if fixtures exist or participants are registered
      if (targetStatus === 'draft') {
        const { count: matchesCount } = await (supabase.from('matches') as any)
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', id);

        if (matchesCount && matchesCount > 0) {
          return {
            success: false,
            message: 'Cannot revert tournament to draft because match fixtures have already been generated.',
          };
        }

        if (existing.confirmed_slots_count > 0) {
          return {
            success: false,
            message: `Cannot revert tournament to draft because ${existing.confirmed_slots_count} participants are already confirmed.`,
          };
        }
      }
    }

    // 3. If format changed, verify match fixtures have not already been generated
    if (existing.format !== dbFormat) {
      const { count: fixtureMatchesCount } = await (supabase.from('matches') as any)
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', id);

      if (fixtureMatchesCount && fixtureMatchesCount > 0) {
        return {
          success: false,
          message: 'Cannot change tournament format because matches/fixtures have already been generated.',
        };
      }
    }

    // 4. Guard against lowering max_participants below confirmed slots
    if (existing.confirmed_slots_count > validData.max_participants) {
      return {
        success: false,
        message: `Cannot decrease max participants to ${validData.max_participants} because there are already ${existing.confirmed_slots_count} confirmed participants.`,
      };
    }

    // 5. Protect tournament terms if registrations already exist
    const isPaid = Boolean(validData.is_paid);
    const entryFeePaise = isPaid
      ? computePaiseAmount(validData.entry_fee_rupees, validData.entry_fee_paise)
      : 0;
    const targetCurrency = validData.currency?.trim() || 'INR';

    const financialTermsChanged =
      Boolean(existing.is_paid) !== isPaid ||
      (existing.entry_fee_paise || 0) !== entryFeePaise ||
      (existing.currency || 'INR') !== targetCurrency;

    if (financialTermsChanged) {
      const { count: participantCount } = await (supabase.from('participants') as any)
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', id);

      const hasSlots = (existing.confirmed_slots_count || 0) > 0;

      if ((participantCount && participantCount > 0) || hasSlots) {
        return {
          success: false,
          message: 'Cannot modify tournament terms because participants have already registered for this tournament.',
        };
      }
    }
    const prizePoolPaise = computePaiseAmount(validData.prize_pool_rupees, validData.prize_pool_paise);
    const firstPlacePaise = computePaiseAmount(validData.first_place_rupees, validData.first_place_paise);
    const secondPlacePaise = computePaiseAmount(validData.second_place_rupees, validData.second_place_paise);
    const thirdPlacePaise = computePaiseAmount(validData.third_place_rupees, validData.third_place_paise);
    let totalPrizePoolPaise = prizePoolPaise;
    if (totalPrizePoolPaise === 0 && (firstPlacePaise > 0 || secondPlacePaise > 0 || thirdPlacePaise > 0)) {
      totalPrizePoolPaise = firstPlacePaise + secondPlacePaise + thirdPlacePaise;
    }

    const prizeDistribution = {
      first: { paise: firstPlacePaise, notes: validData.first_place_notes?.trim() || null },
      second: { paise: secondPlacePaise, notes: validData.second_place_notes?.trim() || null },
      third: { paise: thirdPlacePaise, notes: validData.third_place_notes?.trim() || null },
    };

    const isPrivate = Boolean(validData.is_private);
    let accessCodeHash: string | null = (existing as any).access_code_hash || null;

    if (!isPrivate) {
      accessCodeHash = null;
    } else if (validData.access_code && validData.access_code.trim()) {
      accessCodeHash = await bcrypt.hash(validData.access_code.trim(), 10);
    } else if (!accessCodeHash && !(existing as any).is_private) {
      return {
        success: false,
        message: 'An access code is required to make a tournament private.',
      };
    }

    const updatePayload: Record<string, any> = {
      name: validData.name.trim(),
      description: validData.description?.trim() || null,
      format: dbFormat,
      status: validData.status as TournamentStatus,
      start_date: validData.start_date ? new Date(validData.start_date).toISOString() : null,
      end_date: validData.end_date ? new Date(validData.end_date).toISOString() : null,
      registration_deadline: validData.registration_deadline ? new Date(validData.registration_deadline).toISOString() : null,
      rules_text: validData.rules_text?.trim() || null,
      banner_image: validData.banner_image?.trim() || null,
      max_participants: validData.max_participants,
      qualifiers_per_group: validData.qualifiers_per_group || 2,
      rounds_per_pair: validData.rounds_per_pair || 1,
      is_paid: isPaid,
      entry_fee_paise: entryFeePaise,
      prize_pool_paise: totalPrizePoolPaise,
      first_place_prize_paise: firstPlacePaise,
      first_place_notes: validData.first_place_notes?.trim() || null,
      second_place_prize_paise: secondPlacePaise,
      second_place_notes: validData.second_place_notes?.trim() || null,
      third_place_prize_paise: thirdPlacePaise,
      third_place_notes: validData.third_place_notes?.trim() || null,
      prize_distribution: prizeDistribution,
      currency: validData.currency?.trim() || 'INR',
      is_private: isPrivate,
      access_code_hash: accessCodeHash,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error } = await (supabase.from('tournaments') as any)
      .update(updatePayload)
      .eq('id', id)
      .select('id, name, status, format, is_paid, is_private, entry_fee_paise')
      .single();

    if (error) {
      if ((error as any).code === '42703' && validData.is_private) {
        return {
          success: false,
          message:
            'Database schema does not support private tournaments (column "is_private" missing). Update aborted to prevent privacy loss.',
        };
      }
      console.error('Error updating tournament in server action:', error);
      return {
        success: false,
        message: error.message || 'Failed to update tournament in database.',
      };
    }

    revalidatePath('/admin/tournaments');
    revalidatePath(`/admin/tournaments/${id}`);
    revalidatePath(`/tournaments/${id}`);
    revalidatePath(`/t/${id}`);
    revalidatePath('/tournaments');

    return {
      success: true,
      message: `Tournament "${updated.name}" updated successfully!`,
      data: updated,
    };
  } catch (err: any) {
    console.error('updateTournamentAction unhandled error:', err);
    return {
      success: false,
      message: err.message || 'Unauthorized or server error updating tournament.',
    };
  }
}

/**
 * Server action: Publish a draft tournament and open registrations
 * Strictly requires verified administrator authentication (ye.agrajj@gmail.com).
 */
export async function publishTournamentAction(id: string): Promise<ActionResponse> {
  try {
    await requireAdmin();

    if (!id || typeof id !== 'string') {
      return { success: false, message: 'Tournament ID is required.' };
    }

    const supabase = await createClient();

    const { data: tourney, error: fetchErr } = await (supabase.from('tournaments') as any)
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !tourney) {
      return { success: false, message: 'Tournament not found.' };
    }

    if (tourney.status === 'registration') {
      return {
        success: true,
        message: `Tournament "${tourney.name}" is already open for registration.`,
        data: tourney,
      };
    }

    if (tourney.status !== 'draft') {
      return {
        success: false,
        message: `Cannot publish tournament from current status "${tourney.status}". Only draft tournaments can be published.`,
      };
    }

    if (!tourney.name || tourney.name.trim().length < 3) {
      return { success: false, message: 'Tournament must have a valid name (at least 3 characters).' };
    }

    if (!tourney.max_participants || tourney.max_participants < 2) {
      return { success: false, message: 'Tournament must have a capacity of at least 2 participants.' };
    }

    if (tourney.is_paid && (!tourney.entry_fee_paise || tourney.entry_fee_paise <= 0)) {
      return { success: false, message: 'Paid tournaments must have an entry fee greater than ₹0 before publishing.' };
    }

    if (tourney.registration_deadline && tourney.start_date) {
      if (new Date(tourney.registration_deadline) > new Date(tourney.start_date)) {
        return { success: false, message: 'Registration deadline cannot be after tournament start date.' };
      }
    }

    const { data: updated, error: updateErr } = await (supabase.from('tournaments') as any)
      .update({
        status: 'registration',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, name, status, format, is_paid, entry_fee_paise')
      .single();

    if (updateErr) {
      return { success: false, message: updateErr.message || 'Failed to publish tournament.' };
    }

    revalidatePath('/admin/tournaments');
    revalidatePath(`/admin/tournaments/${id}`);
    revalidatePath(`/tournaments/${id}`);
    revalidatePath(`/t/${id}`);
    revalidatePath('/tournaments');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Tournament "${updated.name}" is now published and open for registrations!`,
      data: updated,
    };
  } catch (err: any) {
    console.error('publishTournamentAction unhandled error:', err);
    return {
      success: false,
      message: err.message || 'Unauthorized or server error publishing tournament.',
    };
  }
}

/**
 * Server action: Quick transition of tournament status
 * Supports opening registration, pausing registration, starting tournament, etc.
 */
export async function updateTournamentStatusAction(
  id: string,
  newStatus: TournamentStatus
): Promise<ActionResponse> {
  try {
    await requireAdmin();

    if (!id || !newStatus) {
      return { success: false, message: 'Tournament ID and target status are required.' };
    }

    const supabase = await createClient();

    // 1. Fetch current status
    const { data: currentTourney, error: fetchErr } = await (supabase.from('tournaments') as any)
      .select('id, name, status')
      .eq('id', id)
      .single();

    if (fetchErr || !currentTourney) {
      return { success: false, message: 'Tournament not found.' };
    }

    const currentStatus = currentTourney.status as TournamentStatus;
    const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(newStatus)) {
      return {
        success: false,
        message: `Invalid status transition: Cannot change from "${currentStatus}" to "${newStatus}". Allowed transitions: ${allowed.join(', ') || 'none'}`,
      };
    }

    const { data: updated, error: updateErr } = await (supabase.from('tournaments') as any)
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, name, status')
      .single();

    if (updateErr) {
      console.error('Error updating tournament status:', updateErr);
      return {
        success: false,
        message: updateErr.message || 'Failed to update tournament status.',
      };
    }

    revalidatePath('/admin/tournaments');
    revalidatePath(`/admin/tournaments/${id}`);
    revalidatePath(`/tournaments/${id}`);
    revalidatePath(`/t/${id}`);
    revalidatePath('/tournaments');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Tournament status successfully updated to "${newStatus}".`,
      data: updated,
    };
  } catch (err: any) {
    console.error('updateTournamentStatusAction unhandled error:', err);
    return {
      success: false,
      message: err.message || 'Unauthorized or server error transitioning tournament status.',
    };
  }
}

/**
 * Server action: Delete a tournament
 * Strictly requires verified administrator authentication (ye.agrajj@gmail.com).
 */
export async function deleteTournamentAction(id: string): Promise<ActionResponse> {
  try {
    await requireAdmin();

    if (!id) {
      return { success: false, message: 'Tournament ID is required.' };
    }

    const supabase = await createClient();

    const { error } = await (supabase.from('tournaments') as any)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting tournament in server action:', error);
      return {
        success: false,
        message: error.message || 'Failed to delete tournament.',
      };
    }

    revalidatePath('/admin/tournaments');
    revalidatePath('/tournaments');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: 'Tournament successfully deleted.',
    };
  } catch (err: any) {
    console.error('deleteTournamentAction unhandled error:', err);
    return {
      success: false,
      message: err.message || 'Unauthorized or server error deleting tournament.',
    };
  }
}
