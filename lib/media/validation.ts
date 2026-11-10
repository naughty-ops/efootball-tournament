import { MediaEntityType } from '@/types/database';

export const MEDIA_FOLDERS: Record<MediaEntityType, string> = {
  player_avatar: 'efootball/players/avatars',
  tournament_banner: 'efootball/tournaments/banners',
  tournament_thumbnail: 'efootball/tournaments/thumbnails',
  match_evidence: 'efootball/matches/evidence',
  dispute_evidence: 'efootball/disputes/evidence',
  admin_media: 'efootball/admin/media',
};

export const MEDIA_SIZE_LIMITS: Record<MediaEntityType, number> = {
  player_avatar: 2 * 1024 * 1024,        // 2 MB
  tournament_banner: 5 * 1024 * 1024,    // 5 MB
  tournament_thumbnail: 2 * 1024 * 1024, // 2 MB
  match_evidence: 500 * 1024,            // 500 KB (Strict screenshot limit)
  dispute_evidence: 500 * 1024,          // 500 KB (Strict screenshot limit)
  admin_media: 5 * 1024 * 1024,          // 5 MB
};

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export interface FileValidationResult {
  valid: boolean;
  mimeType?: AllowedMimeType;
  format?: 'jpg' | 'png' | 'webp';
  error?: string;
}

/**
 * Validates file buffer magic bytes (file signature) to ensure true image format.
 * Strictly forbids SVG, HTML, scripts, executables, or corrupted files.
 */
export function validateImageSignature(buffer: Buffer): FileValidationResult {
  if (!buffer || buffer.length < 12) {
    return { valid: false, error: 'File buffer too small or empty' };
  }

  // 1. JPEG signature: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, mimeType: 'image/jpeg', format: 'jpg' };
  }

  // 2. PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, mimeType: 'image/png', format: 'png' };
  }

  // 3. WebP signature: RIFF .... WEBP
  // bytes 0-3: 'RIFF', bytes 8-11: 'WEBP'
  const isRiff =
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
  const isWebp =
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;

  if (isRiff && isWebp) {
    return { valid: true, mimeType: 'image/webp', format: 'webp' };
  }

  // Reject SVG specifically if detected
  const sample = buffer.subarray(0, 512).toString('utf-8').toLowerCase();
  if (sample.includes('<svg') || sample.includes('<?xml')) {
    return { valid: false, error: 'SVG images are strictly disallowed for security.' };
  }

  return {
    valid: false,
    error: 'Unsupported image format. Only JPEG, PNG, and WebP images are allowed.',
  };
}

/**
 * Validates image size against category limits.
 * Enforces strict 2 MB rejection rule and 500 KB limit for match/dispute screenshots.
 */
export function validateImageSize(sizeBytes: number, category: MediaEntityType): { valid: boolean; error?: string } {
  // Strict 2 MB rejection rule across evidence screenshots
  if ((category === 'match_evidence' || category === 'dispute_evidence') && sizeBytes > 2 * 1024 * 1024) {
    return {
      valid: false,
      error: 'File size exceeds the 2 MB limit. Please select a smaller screenshot.',
    };
  }

  const limit = MEDIA_SIZE_LIMITS[category] || 2 * 1024 * 1024;
  if (sizeBytes > limit) {
    if (category === 'match_evidence' || category === 'dispute_evidence') {
      return {
        valid: false,
        error: 'Screenshot exceeds the 500 KB limit. Maximum accepted screenshot size is 500 KB per image.',
      };
    }
    const limitMB = Math.round(limit / (1024 * 1024));
    return {
      valid: false,
      error: `File size exceeds the ${limitMB} MB limit for ${category.replace(/_/g, ' ')}.`,
    };
  }
  return { valid: true };
}
