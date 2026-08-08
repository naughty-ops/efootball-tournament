import { createClient } from '@/lib/supabase/client';
import type { Participant, ParticipantStatus } from '@/types/database';
import type { ParticipantInput } from '@/lib/validations';

export interface GetParticipantsParams {
  search?: string;
  status?: string;
  seedFilter?: 'all' | 'seeded' | 'unseeded';
}

type UnknownQuery = {
  select: (columns: string, options?: unknown) => UnknownQuery;
  ilike: (column: string, pattern: string) => UnknownQuery;
  or: (filters: string) => UnknownQuery;
  eq: (column: string, value: unknown) => UnknownQuery;
  not: (column: string, operator: string, value: unknown) => UnknownQuery;
  is: (column: string, value: unknown) => UnknownQuery;
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => UnknownQuery;
  single: () => Promise<{ data: unknown; error: { code?: string; message?: string; details?: string; hint?: string } | null }>;
  insert: (payload: unknown) => UnknownQuery;
  update: (payload: unknown) => UnknownQuery;
  delete: () => UnknownQuery;
  then: Promise<{ data: unknown; count?: number | null; error: { code?: string; message?: string; details?: string; hint?: string } | null }>['then'];
};

function formatSupabaseError(error: unknown): string {
  if (!error) return 'Unknown database error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const errObj = error as { message?: string; details?: string; hint?: string; code?: string };
    if (errObj.message) return errObj.message;
    if (errObj.details) return errObj.details;
    if (errObj.hint) return errObj.hint;
    if (errObj.code) return `Database error code: ${errObj.code}`;
  }
  try {
    const jsonStr = JSON.stringify(error);
    return jsonStr !== '{}' ? jsonStr : 'Database request failed.';
  } catch {
    return 'Database query error';
  }
}

/**
 * Fetch all participants belonging to a specific tournament with search, filtering, and sorting
 */
export async function getParticipantsByTournament(
  tournamentId: string,
  params?: GetParticipantsParams
): Promise<Participant[]> {
  const supabase = createClient();
  let query = (supabase.from('participants') as unknown as UnknownQuery)
    .select('*')
    .eq('tournament_id', tournamentId);

  if (params?.search && params.search.trim().length > 0) {
    const searchPattern = `%${params.search.trim()}%`;
    query = query.or(`username.ilike.${searchPattern},real_name.ilike.${searchPattern}`);
  }

  if (params?.status && params.status !== 'all') {
    query = query.eq('status', params.status as ParticipantStatus);
  }

  if (params?.seedFilter === 'seeded') {
    query = query.not('seed_number', 'is', null);
  } else if (params?.seedFilter === 'unseeded') {
    query = query.is('seed_number', null);
  }

  // Sort seeded first by seed_number ascending, then unseeded by username
  query = query
    .order('seed_number', { ascending: true, nullsFirst: false })
    .order('username', { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching participants:', error);
    throw new Error(`Failed to load participants: ${formatSupabaseError(error)}`);
  }

  return (data || []) as Participant[];
}

/**
 * Fetch single participant enforcing tournament ownership
 */
export async function getParticipantById(
  id: string,
  tournamentId: string
): Promise<Participant | null> {
  const supabase = createClient();
  const { data, error } = await (supabase.from('participants') as unknown as UnknownQuery)
    .select('*')
    .eq('id', id)
    .eq('tournament_id', tournamentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching participant by ID:', error);
    throw new Error(`Failed to load participant: ${formatSupabaseError(error)}`);
  }

  return data as Participant;
}

/**
 * Check if username or seed already exists in the given tournament
 */
export async function checkParticipantDuplicates(
  tournamentId: string,
  username: string,
  seedNumber?: number | null,
  excludeParticipantId?: string
): Promise<{ usernameExists: boolean; seedExists: boolean }> {
  const supabase = createClient();

  // Check Username Duplicate
  let userQuery = (supabase.from('participants') as unknown as UnknownQuery)
    .select('id')
    .eq('tournament_id', tournamentId)
    .ilike('username', username.trim());

  if (excludeParticipantId) {
    userQuery = userQuery.not('id', 'eq', excludeParticipantId);
  }

  const userRes = await userQuery;
  const usernameExists = Boolean(userRes.data && (userRes.data as unknown[]).length > 0);

  // Check Seed Duplicate if seedNumber provided
  let seedExists = false;
  if (seedNumber !== null && seedNumber !== undefined) {
    let seedQuery = (supabase.from('participants') as unknown as UnknownQuery)
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('seed_number', seedNumber);

    if (excludeParticipantId) {
      seedQuery = seedQuery.not('id', 'eq', excludeParticipantId);
    }

    const seedRes = await seedQuery;
    seedExists = Boolean(seedRes.data && (seedRes.data as unknown[]).length > 0);
  }

  return { usernameExists, seedExists };
}

/**
 * Add a single participant to a tournament with duplicate and capacity validation
 */
export async function addParticipant(
  tournamentId: string,
  input: ParticipantInput,
  maxParticipants?: number
): Promise<Participant> {
  const supabase = createClient();

  // 1. Capacity Guard if maxParticipants passed
  if (maxParticipants !== undefined) {
    const countRes = await (supabase.from('participants') as unknown as UnknownQuery)
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId);
    const currentCount = countRes.count ?? 0;
    if (currentCount >= maxParticipants) {
      throw new Error(`Tournament capacity reached (${currentCount}/${maxParticipants}). Cannot add more participants.`);
    }
  }

  // 2. Duplicate Validation
  const { usernameExists, seedExists } = await checkParticipantDuplicates(
    tournamentId,
    input.username,
    input.seed_number
  );

  if (usernameExists) {
    throw new Error(`Participant "${input.username}" already exists in this tournament.`);
  }

  if (seedExists) {
    throw new Error(`Seed number ${input.seed_number} is already assigned to another participant in this tournament.`);
  }

  // 3. Insert Record
  const insertPayload = {
    tournament_id: tournamentId,
    username: input.username.trim(),
    real_name: input.real_name ? input.real_name.trim() : null,
    contact_info: input.contact_info ? input.contact_info.trim() : null,
    seed_number: input.seed_number ?? null,
    status: 'active' as ParticipantStatus,
  };

  const { data, error } = await (supabase.from('participants') as unknown as UnknownQuery)
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) {
    console.error('Error adding participant:', error);
    throw new Error(`Failed to add participant: ${formatSupabaseError(error)}`);
  }

  return data as Participant;
}

/**
 * Update an existing participant record
 */
export async function updateParticipant(
  id: string,
  tournamentId: string,
  input: ParticipantInput
): Promise<Participant> {
  const supabase = createClient();

  // 1. Duplicate Validation (excluding current participant ID)
  const { usernameExists, seedExists } = await checkParticipantDuplicates(
    tournamentId,
    input.username,
    input.seed_number,
    id
  );

  if (usernameExists) {
    throw new Error(`Participant "${input.username}" already exists in this tournament.`);
  }

  if (seedExists) {
    throw new Error(`Seed number ${input.seed_number} is already assigned to another participant in this tournament.`);
  }

  // 2. Update Record
  const updatePayload = {
    username: input.username.trim(),
    real_name: input.real_name ? input.real_name.trim() : null,
    contact_info: input.contact_info ? input.contact_info.trim() : null,
    seed_number: input.seed_number ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await (supabase.from('participants') as unknown as UnknownQuery)
    .update(updatePayload)
    .eq('id', id)
    .eq('tournament_id', tournamentId)
    .select('*')
    .single();

  if (error) {
    console.error('Error updating participant:', error);
    throw new Error(`Failed to update participant: ${formatSupabaseError(error)}`);
  }

  return data as Participant;
}

/**
 * Disqualify participant without removing record
 */
export async function disqualifyParticipant(
  id: string,
  tournamentId: string
): Promise<Participant> {
  const supabase = createClient();
  const { data, error } = await (supabase.from('participants') as unknown as UnknownQuery)
    .update({ status: 'disqualified', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tournament_id', tournamentId)
    .select('*')
    .single();

  if (error) {
    console.error('Error disqualifying participant:', error);
    throw new Error(`Failed to disqualify participant: ${formatSupabaseError(error)}`);
  }

  return data as Participant;
}

/**
 * Delete a participant safely (checking dependent match references)
 */
export async function deleteParticipant(
  id: string,
  tournamentId: string
): Promise<void> {
  const supabase = createClient();

  // Check if referenced in matches table
  const matchCheck = await (supabase.from('matches') as unknown as UnknownQuery)
    .select('id')
    .or(`participant_a.eq.${id},participant_b.eq.${id},winner_id.eq.${id}`);

  if (matchCheck.data && (matchCheck.data as unknown[]).length > 0) {
    throw new Error(
      'Cannot delete participant because they are already assigned to active matches. Disqualify them instead.'
    );
  }

  const { error } = await (supabase.from('participants') as unknown as UnknownQuery)
    .delete()
    .eq('id', id)
    .eq('tournament_id', tournamentId);

  if (error) {
    console.error('Error deleting participant:', error);
    throw new Error(`Failed to delete participant: ${formatSupabaseError(error)}`);
  }
}

/**
 * Batch insert multiple participants from CSV import
 */
export async function batchAddParticipants(
  tournamentId: string,
  inputs: ParticipantInput[],
  maxParticipants?: number
): Promise<Participant[]> {
  if (inputs.length === 0) return [];
  const supabase = createClient();

  // Capacity check
  if (maxParticipants !== undefined) {
    const countRes = await (supabase.from('participants') as unknown as UnknownQuery)
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId);
    const currentCount = countRes.count ?? 0;
    if (currentCount + inputs.length > maxParticipants) {
      throw new Error(`Import exceeds tournament capacity (${currentCount + inputs.length}/${maxParticipants}).`);
    }
  }

  const insertPayloads = inputs.map((input) => ({
    tournament_id: tournamentId,
    username: input.username.trim(),
    real_name: input.real_name ? input.real_name.trim() : null,
    contact_info: input.contact_info ? input.contact_info.trim() : null,
    seed_number: input.seed_number ?? null,
    status: 'active' as ParticipantStatus,
  }));

  const { data, error } = await (supabase.from('participants') as unknown as UnknownQuery)
    .insert(insertPayloads)
    .select('*');

  if (error) {
    console.error('Error batch inserting participants:', error);
    throw new Error(`Failed to import participants: ${formatSupabaseError(error)}`);
  }

  return (data || []) as Participant[];
}
