'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin, getAuthenticatedUser } from '@/lib/auth/server';
import {
  getActiveAvatars,
  getAllAvatarsAdmin,
  selectPlayerAvatar,
  createAdminAvatar,
  updateAdminAvatar,
  deleteAdminAvatar,
} from '@/services/avatarService';
import { uploadImage } from '@/services/mediaService';
import type { Avatar, Profile } from '@/types/database';

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Server Action: Authenticated player selects an active avatar from the library.
 * The server looks up the approved avatar by ID and sets profile.avatar_id and profile.avatar_url.
 * Client-submitted image URLs are never trusted.
 */
export async function selectPlayerAvatarAction(avatarId: string): Promise<ActionResult<Profile>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, error: 'Authentication required to select an avatar.' };
    }

    if (!avatarId || typeof avatarId !== 'string') {
      return { success: false, error: 'Invalid avatar selection ID.' };
    }

    const result = await selectPlayerAvatar(user.id, avatarId);
    if (!result.success || !result.profile) {
      return { success: false, error: result.error || 'Failed to update avatar selection.' };
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/profile');
    revalidatePath('/tournaments');

    return {
      success: true,
      data: result.profile,
      message: 'Avatar updated successfully!',
    };
  } catch (err: any) {
    console.error('selectPlayerAvatarAction error:', err);
    return { success: false, error: err.message || 'Failed to select avatar.' };
  }
}

/**
 * Server Action: Fetches all active avatars for the avatar picker modal.
 */
export async function getActiveAvatarsAction(): Promise<ActionResult<Avatar[]>> {
  try {
    const avatars = await getActiveAvatars();
    return { success: true, data: avatars };
  } catch (err: any) {
    console.error('getActiveAvatarsAction error:', err);
    return { success: false, error: 'Failed to load avatars.' };
  }
}

/**
 * Server Action: Admin creates a new avatar.
 * Accepts either an uploaded file (processed via Cloudinary) or an existing image URL.
 */
export async function adminCreateAvatarAction(formData: FormData): Promise<ActionResult<Avatar>> {
  try {
    const { isAdmin, user } = await getAuthenticatedUser();
    if (!isAdmin || !user) {
      return { success: false, error: 'Unauthorized: Administrator access required.' };
    }

    const name = (formData.get('name') as string)?.trim();
    const category = (formData.get('category') as string)?.trim() || 'General';
    const displayOrder = parseInt((formData.get('displayOrder') as string) || '0', 10);
    const isActive = formData.get('isActive') !== 'false';
    const directImageUrl = (formData.get('imageUrl') as string)?.trim();
    const file = formData.get('file') as File | null;

    if (!name) {
      return { success: false, error: 'Avatar name is required.' };
    }

    const passedPublicId = (formData.get('cloudinaryPublicId') as string)?.trim() || null;
    let finalImageUrl = directImageUrl;
    let cloudinaryPublicId: string | null = passedPublicId;

    if (file && file.size > 0) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const uploadedAsset = await uploadImage(buffer, {
        category: 'admin_media',
        userId: user.id,
        visibility: 'public',
      });

      finalImageUrl = uploadedAsset.secure_url;
      cloudinaryPublicId = uploadedAsset.cloudinary_public_id;
    }

    if (!finalImageUrl) {
      return { success: false, error: 'Please upload an image file or provide an image URL.' };
    }

    const createRes = await createAdminAvatar({
      name,
      category,
      imageUrl: finalImageUrl,
      cloudinaryPublicId,
      displayOrder,
      isActive,
    });

    if (!createRes.success || !createRes.avatar) {
      return { success: false, error: createRes.error || 'Failed to save avatar.' };
    }

    revalidatePath('/admin/avatars');
    revalidatePath('/dashboard/profile');

    return {
      success: true,
      data: createRes.avatar,
      message: 'Avatar added to library successfully!',
    };
  } catch (err: any) {
    console.error('adminCreateAvatarAction error:', err);
    return { success: false, error: err.message || 'Failed to create avatar.' };
  }
}

/**
 * Server Action: Admin updates avatar metadata.
 */
export async function adminUpdateAvatarAction(
  avatarId: string,
  updates: {
    name?: string;
    category?: string;
    displayOrder?: number;
    isActive?: boolean;
    imageUrl?: string;
  }
): Promise<ActionResult<Avatar>> {
  try {
    const { isAdmin } = await getAuthenticatedUser();
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized: Administrator access required.' };
    }

    const res = await updateAdminAvatar(avatarId, updates);
    if (!res.success || !res.avatar) {
      return { success: false, error: res.error || 'Failed to update avatar.' };
    }

    revalidatePath('/admin/avatars');
    revalidatePath('/dashboard/profile');

    return { success: true, data: res.avatar, message: 'Avatar updated successfully.' };
  } catch (err: any) {
    console.error('adminUpdateAvatarAction error:', err);
    return { success: false, error: err.message || 'Failed to update avatar.' };
  }
}

/**
 * Server Action: Admin toggles active/inactive state of an avatar.
 */
export async function adminToggleAvatarStatusAction(
  avatarId: string,
  isActive: boolean
): Promise<ActionResult<Avatar>> {
  try {
    const { isAdmin } = await getAuthenticatedUser();
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized: Administrator access required.' };
    }

    const res = await updateAdminAvatar(avatarId, { isActive });
    if (!res.success || !res.avatar) {
      return { success: false, error: res.error || 'Failed to toggle avatar status.' };
    }

    revalidatePath('/admin/avatars');
    revalidatePath('/dashboard/profile');

    return {
      success: true,
      data: res.avatar,
      message: isActive ? 'Avatar activated.' : 'Avatar deactivated.',
    };
  } catch (err: any) {
    console.error('adminToggleAvatarStatusAction error:', err);
    return { success: false, error: err.message || 'Failed to toggle status.' };
  }
}

/**
 * Server Action: Admin deletes an avatar with safeguards.
 */
export async function adminDeleteAvatarAction(
  avatarId: string
): Promise<ActionResult<{ reassignedCount: number }>> {
  try {
    const { isAdmin } = await getAuthenticatedUser();
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized: Administrator access required.' };
    }

    const res = await deleteAdminAvatar(avatarId);
    if (!res.success) {
      return { success: false, error: res.error || 'Failed to delete avatar.' };
    }

    revalidatePath('/admin/avatars');
    revalidatePath('/dashboard/profile');

    return {
      success: true,
      data: { reassignedCount: res.reassignedCount },
      message:
        res.reassignedCount > 0
          ? `Avatar deleted. ${res.reassignedCount} player(s) were reassigned to the default avatar.`
          : 'Avatar deleted successfully.',
    };
  } catch (err: any) {
    console.error('adminDeleteAvatarAction error:', err);
    return { success: false, error: err.message || 'Failed to delete avatar.' };
  }
}
