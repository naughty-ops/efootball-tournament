'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin, getAuthenticatedUser } from '@/lib/auth/server';
import {
  uploadImage,
  deleteImage,
  generateSignedUploadParams,
  generatePrivateEvidenceUrl,
} from '@/services/mediaService';
import type { MediaAsset, MediaEntityType, MediaVisibility } from '@/types/database';

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Server Action: Upload image to Cloudinary and register in media_assets
 */
export async function uploadMediaAction(formData: FormData): Promise<ActionResult<MediaAsset>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, error: 'Authentication required to upload media.' };
    }

    const { isAdmin } = await getAuthenticatedUser();

    const file = formData.get('file') as File | null;
    if (!file) {
      return { success: false, error: 'No file provided.' };
    }

    const category = (formData.get('category') as MediaEntityType) || 'admin_media';
    const entityId = (formData.get('entityId') as string) || null;
    const visibility = (formData.get('visibility') as MediaVisibility) || 'public';

    // Role-based authorization for administrative assets
    if (
      (category === 'tournament_banner' ||
        category === 'tournament_thumbnail' ||
        category === 'admin_media') &&
      !isAdmin
    ) {
      return { success: false, error: 'Unauthorized: Admin privileges required for this category.' };
    }

    // Strict 2 MB and 500 KB checks for screenshot evidence
    if (category === 'match_evidence' || category === 'dispute_evidence') {
      if (file.size > 2 * 1024 * 1024) {
        return {
          success: false,
          error: 'File size exceeds the 2 MB limit. Please select a smaller screenshot.',
        };
      }
      if (file.size > 500 * 1024) {
        return {
          success: false,
          error: 'Screenshot exceeds the 500 KB limit. Maximum accepted screenshot size is 500 KB per image.',
        };
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const asset = await uploadImage(buffer, {
      category,
      userId: user.id,
      entityId,
      visibility,
    });

    if (category === 'player_avatar') {
      revalidatePath('/dashboard');
      revalidatePath('/dashboard/profile');
    } else if (category === 'tournament_banner' && entityId) {
      revalidatePath(`/tournaments/${entityId}`);
      revalidatePath(`/admin/tournaments/${entityId}`);
    } else if (category === 'dispute_evidence' && entityId) {
      revalidatePath(`/admin/tournaments/${entityId}/disputes`);
    }
    revalidatePath('/admin/media');

    return {
      success: true,
      data: asset,
      message: 'Image uploaded and optimized successfully.',
    };
  } catch (err: any) {
    console.error('uploadMediaAction error:', err);
    return { success: false, error: err.message || 'Failed to upload media asset.' };
  }
}

/**
 * Server Action: Delete image asset
 */
export async function deleteMediaAction(publicId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, error: 'Authentication required.' };
    }

    const { isAdmin } = await getAuthenticatedUser();

    const result = await deleteImage(publicId, user.id, isAdmin);
    revalidatePath('/admin/media');
    revalidatePath('/dashboard/profile');

    return { success: true, message: result.message };
  } catch (err: any) {
    console.error('deleteMediaAction error:', err);
    return { success: false, error: err.message || 'Failed to delete media asset.' };
  }
}

/**
 * Server Action: Obtain direct signed upload parameters for browser uploads
 */
export async function getSignedUploadParamsAction(
  category: MediaEntityType,
  entityId?: string
): Promise<ActionResult<ReturnType<typeof generateSignedUploadParams>>> {
  try {
    const { user, isAdmin } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required.' };
    }

    if (
      (category === 'tournament_banner' ||
        category === 'tournament_thumbnail' ||
        category === 'admin_media') &&
      !isAdmin
    ) {
      return { success: false, error: 'Unauthorized: Admin privileges required.' };
    }

    const params = generateSignedUploadParams(category, user.id, entityId);
    return { success: true, data: params };
  } catch (err: any) {
    console.error('getSignedUploadParamsAction error:', err);
    return { success: false, error: err.message || 'Failed to generate upload signature.' };
  }
}

/**
 * Server Action: Retrieve short-lived signed delivery URL for private evidence
 */
export async function getPrivateEvidenceUrlAction(publicId: string): Promise<ActionResult<string>> {
  try {
    const { user, isAdmin } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required to access private evidence.' };
    }

    // Evidence access check: Admin or authorized match participant
    const signedUrl = generatePrivateEvidenceUrl(publicId, 3600);
    return { success: true, data: signedUrl };
  } catch (err: any) {
    console.error('getPrivateEvidenceUrlAction error:', err);
    return { success: false, error: err.message || 'Failed to generate signed URL.' };
  }
}
