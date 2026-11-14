import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Avatar, Profile } from '@/types/database';
import { DEFAULT_AVATAR_URL } from '@/lib/avatar/constants';

export { DEFAULT_AVATAR_URL };

/**
 * Retrieves all active avatars for player selection, ordered by display order.
 */
export async function getActiveAvatars(): Promise<Avatar[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('avatars')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching active avatars:', error);
    return [];
  }

  return (data || []) as Avatar[];
}

let adminAvatarsCache: { data: (Avatar & { usageCount: number })[]; timestamp: number } | null = null;
const AVATAR_CACHE_TTL_MS = 60 * 1000;

export function invalidateAvatarCache() {
  adminAvatarsCache = null;
}

/**
 * Admin: Retrieves all avatars (both active and inactive) with player usage counts.
 */
export async function getAllAvatarsAdmin(): Promise<(Avatar & { usageCount: number })[]> {
  if (adminAvatarsCache && Date.now() - adminAvatarsCache.timestamp < AVATAR_CACHE_TTL_MS) {
    return adminAvatarsCache.data;
  }

  const adminClient = createAdminClient();

  const { data: avatars, error: avatarErr } = await (adminClient.from('avatars') as any)
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (avatarErr || !avatars) {
    console.error('Error fetching admin avatars:', avatarErr);
    return [];
  }

  // Count player usage per avatar
  const { data: profilesUsage } = await (adminClient.from('profiles') as any)
    .select('avatar_id');

  const countMap: Record<string, number> = {};
  (profilesUsage || []).forEach((p: { avatar_id: string | null }) => {
    if (p.avatar_id) {
      countMap[p.avatar_id] = (countMap[p.avatar_id] || 0) + 1;
    }
  });

  const result = (avatars as Avatar[]).map((av) => ({
    ...av,
    usageCount: countMap[av.id] || 0,
  }));

  adminAvatarsCache = { data: result, timestamp: Date.now() };
  return result;
}

/**
 * Retrieves a single avatar by its ID.
 */
export async function getAvatarById(avatarId: string): Promise<Avatar | null> {
  const adminClient = createAdminClient();
  const { data, error } = await (adminClient.from('avatars') as any)
    .select('*')
    .eq('id', avatarId)
    .single();

  if (error || !data) return null;
  return data as Avatar;
}

/**
 * Server-authoritative Player Avatar Selection:
 * Validates that the requested avatar ID exists and is currently active.
 * Atomically updates profile.avatar_id and profile.avatar_url.
 */
export async function selectPlayerAvatar(
  userId: string,
  avatarId: string
): Promise<{ success: boolean; profile?: Profile; error?: string }> {
  const adminClient = createAdminClient();

  // 1. Verify that avatar exists and is approved/active
  const { data: avatar, error: avError } = await (adminClient.from('avatars') as any)
    .select('*')
    .eq('id', avatarId)
    .single();

  if (avError || !avatar) {
    return { success: false, error: 'The selected avatar does not exist.' };
  }

  if (!avatar.is_active) {
    return { success: false, error: 'This avatar is currently unavailable or inactive.' };
  }

  // 2. Update player profile atomically
  const { data: updatedProfile, error: updateErr } = await (adminClient.from('profiles') as any)
    .update({
      avatar_id: avatar.id,
      avatar_url: avatar.image_url,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();

  if (updateErr) {
    console.error('Error updating profile avatar:', updateErr);
    return { success: false, error: 'Failed to update avatar. Please try again.' };
  }

  return { success: true, profile: updatedProfile as Profile };
}

/**
 * Admin: Create a new avatar in the library.
 */
export async function createAdminAvatar(data: {
  name: string;
  imageUrl: string;
  cloudinaryPublicId?: string | null;
  category?: string;
  displayOrder?: number;
  isActive?: boolean;
}): Promise<{ success: boolean; avatar?: Avatar; error?: string }> {
  const adminClient = createAdminClient();

  const { data: newAvatar, error } = await (adminClient.from('avatars') as any)
    .insert({
      name: data.name.trim(),
      image_url: data.imageUrl.trim(),
      cloudinary_public_id: data.cloudinaryPublicId || null,
      category: data.category?.trim() || 'General',
      display_order: typeof data.displayOrder === 'number' ? data.displayOrder : 0,
      is_active: data.isActive !== undefined ? data.isActive : true,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating avatar:', error);
    return { success: false, error: error.message };
  }

  invalidateAvatarCache();
  return { success: true, avatar: newAvatar as Avatar };
}

/**
 * Admin: Update avatar properties (name, category, active status, order).
 */
export async function updateAdminAvatar(
  avatarId: string,
  updates: Partial<{
    name: string;
    category: string;
    displayOrder: number;
    isActive: boolean;
    imageUrl: string;
    cloudinaryPublicId?: string | null;
  }>
): Promise<{ success: boolean; avatar?: Avatar; error?: string }> {
  const adminClient = createAdminClient();

  const patch: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.category !== undefined) patch.category = updates.category.trim();
  if (updates.displayOrder !== undefined) patch.display_order = updates.displayOrder;
  if (updates.isActive !== undefined) patch.is_active = updates.isActive;
  if (updates.imageUrl !== undefined) patch.image_url = updates.imageUrl.trim();
  if (updates.cloudinaryPublicId !== undefined) patch.cloudinary_public_id = updates.cloudinaryPublicId;

  const { data: updatedAvatar, error } = await (adminClient.from('avatars') as any)
    .update(patch)
    .eq('id', avatarId)
    .select()
    .single();

  if (error) {
    console.error('Error updating avatar:', error);
    return { success: false, error: error.message };
  }

  invalidateAvatarCache();
  return { success: true, avatar: updatedAvatar as Avatar };
}

/**
 * Admin: Delete an avatar with safeguards.
 * If players currently reference this avatar, gracefully migrate them to the default fallback avatar.
 */
export async function deleteAdminAvatar(
  avatarId: string
): Promise<{ success: boolean; reassignedCount: number; error?: string }> {
  const adminClient = createAdminClient();

  // Fetch avatar to check for Cloudinary public ID
  const { data: avatarToDelete } = await (adminClient.from('avatars') as any)
    .select('cloudinary_public_id')
    .eq('id', avatarId)
    .single();

  // Find a fallback default avatar that is NOT the one being deleted
  const { data: fallbackList } = await (adminClient.from('avatars') as any)
    .select('*')
    .neq('id', avatarId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .limit(1);

  const fallback = fallbackList?.[0] as Avatar | undefined;
  const fallbackId = fallback?.id || null;
  const fallbackUrl = fallback?.image_url || DEFAULT_AVATAR_URL;

  // Reassign players who have this avatar
  const { data: reassigned, error: reassignErr } = await (adminClient.from('profiles') as any)
    .update({
      avatar_id: fallbackId,
      avatar_url: fallbackUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('avatar_id', avatarId)
    .select('id');

  if (reassignErr) {
    console.error('Error reassigning profiles before avatar deletion:', reassignErr);
  }

  const reassignedCount = reassigned?.length || 0;

  // Delete the avatar record
  const { error: deleteErr } = await (adminClient.from('avatars') as any)
    .delete()
    .eq('id', avatarId);

  if (deleteErr) {
    console.error('Error deleting avatar:', deleteErr);
    return { success: false, reassignedCount, error: deleteErr.message };
  }

  // Cleanup Cloudinary asset if one existed
  if (avatarToDelete?.cloudinary_public_id) {
    try {
      const { deleteImage } = await import('@/services/mediaService');
      await deleteImage(avatarToDelete.cloudinary_public_id, undefined, true);
    } catch (cleanupErr) {
      console.warn('Failed to cleanup Cloudinary asset during avatar deletion:', cleanupErr);
    }
  }

  invalidateAvatarCache();
  return { success: true, reassignedCount };
}
