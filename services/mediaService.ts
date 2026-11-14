import 'server-only';
import crypto from 'node:crypto';
import { getCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  MEDIA_FOLDERS,
  MEDIA_SIZE_LIMITS,
  validateImageSignature,
  validateImageSize,
} from '@/lib/media/validation';
import type {
  MediaAsset,
  MediaEntityType,
  MediaVisibility,
  MediaStatus,
} from '@/types/database';

export interface UploadImageOptions {
  category: MediaEntityType;
  userId?: string | null;
  entityId?: string | null;
  visibility?: MediaVisibility;
  width?: number;
  height?: number;
  crop?: string;
  tags?: string[];
}

export interface OptimizedUrlOptions {
  width?: number;
  height?: number;
  crop?: 'fill' | 'fit' | 'scale' | 'thumb' | 'crop';
  gravity?: 'face' | 'center' | 'auto';
  quality?: 'auto' | 'auto:good' | 'auto:best' | number;
  format?: 'auto' | 'webp' | 'png' | 'jpg';
  radius?: string | number;
}

// Server-side only in-memory cache for media overview
const adminMediaCache = new Map<string, { data: any; timestamp: number }>();
const MEDIA_CACHE_TTL_MS = 30000;

export function invalidateAdminMediaCache() {
  adminMediaCache.clear();
}

/**
 * Validates, uploads, and records an image asset in Cloudinary and Supabase media_assets.
 */
export async function uploadImage(
  buffer: Buffer,
  options: UploadImageOptions
): Promise<MediaAsset> {
  // 1. Server-side signature & format validation (Magic bytes)
  const sigCheck = validateImageSignature(buffer);
  if (!sigCheck.valid) {
    throw new Error(sigCheck.error || 'Invalid image file.');
  }

  // 2. Server-side size validation
  const sizeCheck = validateImageSize(buffer.length, options.category);
  if (!sizeCheck.valid) {
    throw new Error(sizeCheck.error || 'File size exceeds limit.');
  }

  const folder = MEDIA_FOLDERS[options.category] || 'efootball/media';
  const isEvidence =
    options.category === 'match_evidence' || options.category === 'dispute_evidence';
  const visibility: MediaVisibility = options.visibility || (isEvidence ? 'private' : 'public');

  // Generate predictable unique public ID
  const safeEntity = (options.entityId || 'general').replace(/[^a-zA-Z0-9_-]/g, '');
  const uniqueSuffix = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const publicId = `${folder}/${options.category}_${safeEntity}_${uniqueSuffix}`;

  const adminClient = createAdminClient();

  // 3. Upload to Cloudinary via upload_stream
  // Throws descriptive error if CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET are missing
  const cloudinary = getCloudinary();

  const uploadOptions: Record<string, any> = {
    public_id: publicId,
    overwrite: false,
    resource_type: 'image',
    tags: ['efootball', options.category, ...(options.tags || [])],
  };

  // Optimization configurations
  if (isEvidence) {
    // Preserve screenshot readability: high quality, no aggressive downscaling
    uploadOptions.quality = 'auto:best';
    uploadOptions.flags = 'strip_profile'; // Strip non-essential metadata
    if (visibility === 'private') {
      uploadOptions.type = 'authenticated'; // Protected signed delivery only
    }
  } else {
    // Standard web assets: auto format and quality
    uploadOptions.quality = 'auto';
    uploadOptions.fetch_format = 'auto';
    uploadOptions.flags = 'strip_profile';
  }

  let uploadResult: any;
  try {
    uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(uploadOptions, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
      stream.end(buffer);
    });
  } catch (cloudErr: any) {
    const errorMsg = cloudErr?.message || cloudErr?.error?.message || 'Cloudinary upload stream failed';
    const httpCode = cloudErr?.http_code || cloudErr?.status || 500;
    console.error(`[Cloudinary Upload Error] HTTP ${httpCode}: ${errorMsg}`, cloudErr);
    throw new Error(`Cloudinary upload failed (HTTP ${httpCode}): ${errorMsg}`);
  }

  // 4. Save metadata to Supabase media_assets
  const { data: asset, error: dbErr } = await (adminClient.from('media_assets') as any)
    .insert({
      owner_id: options.userId || null,
      entity_type: options.category,
      entity_id: options.entityId || null,
      cloudinary_public_id: uploadResult.public_id,
      secure_url: uploadResult.secure_url,
      resource_type: uploadResult.resource_type || 'image',
      format: uploadResult.format,
      width: uploadResult.width,
      height: uploadResult.height,
      file_size: uploadResult.bytes || buffer.length,
      visibility,
      status: 'active',
    })
    .select('*')
    .single();

  if (dbErr) {
    // Attempt cleanup on Cloudinary if database record fails
    try {
      await cloudinary.uploader.destroy(uploadResult.public_id);
    } catch (cleanupErr) {
      console.error('Failed to cleanup Cloudinary upload after database error:', cleanupErr);
    }
    throw new Error(`Failed to record media asset in database: ${dbErr.message}`);
  }

  // 5. Update parent entity references if appropriate
  if (options.category === 'player_avatar' && options.userId) {
    await (adminClient.from('profiles') as any)
      .update({
        avatar_url: uploadResult.secure_url,
        cloudinary_public_id: uploadResult.public_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', options.userId);
  } else if (options.category === 'tournament_banner' && options.entityId) {
    await (adminClient.from('tournaments') as any)
      .update({
        banner_image: uploadResult.secure_url,
        cloudinary_public_id: uploadResult.public_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', options.entityId);
  }

  invalidateAdminMediaCache();
  return asset as MediaAsset;
}

/**
 * Deletes an image from Cloudinary and marks the database asset as deleted.
 * Enforces evidence immutability for disputes.
 */
export async function deleteImage(
  cloudinaryPublicId: string,
  actorUserId?: string,
  isAdmin: boolean = false
): Promise<{ success: boolean; message: string }> {
  const adminClient = createAdminClient();

  const { data: asset, error } = await (adminClient.from('media_assets') as any)
    .select('*')
    .eq('cloudinary_public_id', cloudinaryPublicId)
    .single();

  if (error || !asset) {
    throw new Error('Media asset not found');
  }

  // Authorization check
  const isOwner = actorUserId && asset.owner_id === actorUserId;
  if (!isOwner && !isAdmin) {
    throw new Error('Unauthorized: You do not have permission to delete this asset.');
  }

  // Evidence protection guard: players cannot delete submitted match or dispute evidence
  if (
    (asset.entity_type === 'match_evidence' || asset.entity_type === 'dispute_evidence') &&
    !isAdmin
  ) {
    throw new Error(
      'Submitted match and dispute evidence cannot be deleted to preserve investigation integrity.'
    );
  }

  // Delete from Cloudinary if configured
  if (isCloudinaryConfigured()) {
    try {
      const cloudinary = getCloudinary();
      await cloudinary.uploader.destroy(cloudinaryPublicId, {
        invalidate: true,
        resource_type: asset.resource_type || 'image',
      });
    } catch (err: any) {
      console.error('Cloudinary destroy error:', err);
    }
  }

  // Soft-delete in Supabase
  await (adminClient.from('media_assets') as any)
    .update({
      status: 'deleted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', asset.id);

  // Clear referenced avatars or banners if active
  if (asset.entity_type === 'player_avatar' && asset.owner_id) {
    await (adminClient.from('profiles') as any)
      .update({ avatar_url: null, cloudinary_public_id: null, updated_at: new Date().toISOString() })
      .eq('id', asset.owner_id)
      .eq('cloudinary_public_id', cloudinaryPublicId);
  } else if (asset.entity_type === 'tournament_banner' && asset.entity_id) {
    await (adminClient.from('tournaments') as any)
      .update({ banner_image: null, cloudinary_public_id: null, updated_at: new Date().toISOString() })
      .eq('id', asset.entity_id)
      .eq('cloudinary_public_id', cloudinaryPublicId);
  }

  invalidateAdminMediaCache();
  return { success: true, message: 'Image deleted successfully' };
}

/**
 * Replaces an existing media asset with a new image upload.
 */
export async function replaceImage(
  oldPublicId: string,
  newBuffer: Buffer,
  options: UploadImageOptions,
  actorUserId?: string,
  isAdmin: boolean = false
): Promise<MediaAsset> {
  const isEvidence =
    options.category === 'match_evidence' || options.category === 'dispute_evidence';
  if (isEvidence && !isAdmin) {
    throw new Error('Submitted evidence cannot be replaced to prevent dispute tampering.');
  }

  // Upload new image first
  const newAsset = await uploadImage(newBuffer, options);

  // If new image upload succeeded, delete old image
  if (oldPublicId && oldPublicId !== newAsset.cloudinary_public_id) {
    try {
      await deleteImage(oldPublicId, actorUserId, isAdmin);
    } catch (delErr) {
      console.warn('Old image deletion warning during replacement:', delErr);
    }
  }

  invalidateAdminMediaCache();
  return newAsset;
}

/**
 * Generates an optimized Cloudinary delivery URL with transformation parameters.
 */
export function generateOptimizedUrl(
  publicIdOrUrl: string,
  options?: OptimizedUrlOptions
): string {
  if (!publicIdOrUrl) return '';

  // If local static asset, return as-is
  if (publicIdOrUrl.startsWith('/') && !publicIdOrUrl.startsWith('//')) {
    return publicIdOrUrl;
  }

  if (!isCloudinaryConfigured()) {
    const parts: string[] = [];
    if (options?.crop) parts.push(`c_${options.crop}`);
    if (options?.width) parts.push(`w_${options.width}`);
    if (options?.height) parts.push(`h_${options.height}`);
    if (options?.gravity) parts.push(`g_${options.gravity}`);
    parts.push(`f_${options?.format || 'auto'}`);
    parts.push(`q_${options?.quality || 'auto'}`);
    const transformStr = parts.join(',');
    return `https://res.cloudinary.com/demo/image/upload/${transformStr}/${publicIdOrUrl}`;
  }

  const cloudinary = getCloudinary();
  const transformation: Record<string, any> = {
    quality: options?.quality || 'auto',
    fetch_format: options?.format || 'auto',
    secure: true,
  };

  if (options?.width) transformation.width = options.width;
  if (options?.height) transformation.height = options.height;
  if (options?.crop) transformation.crop = options.crop;
  if (options?.gravity) transformation.gravity = options.gravity;
  if (options?.radius) transformation.radius = options.radius;

  // Extract public ID if full Cloudinary URL was passed
  let publicId = publicIdOrUrl;
  const match = publicIdOrUrl.match(/\/image\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
  if (match && match[1]) {
    publicId = match[1];
  }

  return cloudinary.url(publicId, transformation);
}

/**
 * Generates a thumbnail URL for an image.
 */
export function generateThumbnailUrl(
  publicIdOrUrl: string,
  width: number = 200,
  height: number = 200,
  crop: 'fill' | 'thumb' | 'fit' = 'fill'
): string {
  return generateOptimizedUrl(publicIdOrUrl, {
    width,
    height,
    crop,
    gravity: 'face',
    quality: 'auto',
    format: 'auto',
  });
}

/**
 * Generates a short-lived authenticated URL for private evidence viewing.
 */
export function generatePrivateEvidenceUrl(
  publicId: string,
  expiresInSeconds: number = 3600
): string {
  const cloudinary = getCloudinary();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;

  return cloudinary.url(publicId, {
    type: 'authenticated',
    sign_url: true,
    expires_at: expiresAt,
    secure: true,
  });
}

/**
 * Generates direct signed browser upload parameters for high-performance direct uploads.
 */
export function generateSignedUploadParams(
  category: MediaEntityType,
  userId: string,
  entityId?: string
) {
  const cloudinary = getCloudinary();
  const folder = MEDIA_FOLDERS[category] || 'efootball/media';
  const timestamp = Math.round(Date.now() / 1000);
  const safeEntity = (entityId || 'general').replace(/[^a-zA-Z0-9_-]/g, '');
  const assetName = `${category}_${safeEntity}_${timestamp}_${crypto.randomUUID().slice(0, 8)}`;

  const isEvidence = category === 'match_evidence' || category === 'dispute_evidence';
  const type = isEvidence ? 'authenticated' : 'upload';

  // In Cloudinary signed direct upload:
  // When folder is passed, public_id is the asset filename without folder prefix.
  const paramsToSign: Record<string, any> = {
    folder,
    public_id: assetName,
    timestamp,
    type,
  };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET!
  );

  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    timestamp,
    folder,
    publicId: assetName,
    fullPublicId: `${folder}/${assetName}`,
    type,
    signature,
    maxSizeBytes: MEDIA_SIZE_LIMITS[category],
  };
}

/**
 * Admin dashboard analytics: Get total media storage stats and recent assets.
 */
export async function getAdminMediaOverview(options?: {
  category?: MediaEntityType | 'all';
  status?: MediaStatus | 'all';
  limit?: number;
  offset?: number;
}) {
  const cacheKey = JSON.stringify(options || {});
  const cached = adminMediaCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < MEDIA_CACHE_TTL_MS) {
    return cached.data;
  }

  const adminClient = createAdminClient();

  let query = (adminClient.from('media_assets') as any)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (options?.category && options.category !== 'all') {
    query = query.eq('entity_type', options.category);
  }

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data: assets, count, error } = await query;
  if (error) {
    throw new Error(`Failed to load media overview: ${error.message}`);
  }

  // Calculate storage metrics across all active assets
  const { data: allAssets } = await (adminClient.from('media_assets') as any)
    .select('entity_type, file_size, status');

  let totalBytes = 0;
  const countByCategory: Record<string, number> = {};
  const bytesByCategory: Record<string, number> = {};

  (allAssets || []).forEach((item: any) => {
    if (item.status === 'active') {
      const bytes = item.file_size || 0;
      totalBytes += bytes;
      countByCategory[item.entity_type] = (countByCategory[item.entity_type] || 0) + 1;
      bytesByCategory[item.entity_type] = (bytesByCategory[item.entity_type] || 0) + bytes;
    }
  });

  const result = {
    assets: (assets || []) as MediaAsset[],
    totalCount: count || 0,
    totalBytes,
    totalMB: Number((totalBytes / (1024 * 1024)).toFixed(2)),
    countByCategory,
    bytesByCategory,
  };

  adminMediaCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}
