/**
 * Server-only Cloudinary helpers for payment proof screenshot uploads.
 *
 * Security requirements:
 * - Images uploaded as `type: "authenticated"` → NOT publicly accessible.
 * - Delivery URLs are short-lived signed tokens (Cloudinary sign_url).
 * - API_SECRET never exposed to the browser.
 * - Folder fixed to `efootball/payment-proofs/` — cannot be overridden.
 * - File validated by magic bytes before upload (not just MIME header).
 */
import 'server-only';
import crypto from 'node:crypto';
import { getCloudinary } from '@/lib/cloudinary/server';
import { validateImageSignature, validateImageSize } from '@/lib/media/validation';

export const PAYMENT_PROOF_FOLDER = 'efootball/payment-proofs';
export const PAYMENT_PROOF_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export interface PaymentProofUploadResult {
  publicId: string;
  secureUrl: string;
  format: string;
  bytes: number;
}

/**
 * Uploads a payment proof screenshot to Cloudinary as an authenticated (private) asset.
 *
 * - Validates magic bytes (not just Content-Type header).
 * - Validates file size ≤ 5 MB.
 * - Uploads to fixed folder `efootball/payment-proofs/<userId>/`.
 * - Delivery type `authenticated` → requires signed URL to view.
 * - Throws on error (caller handles DB rollback).
 */
export async function uploadPaymentProof(
  buffer: Buffer,
  userId: string
): Promise<PaymentProofUploadResult> {
  // 1. Validate magic bytes
  const sigCheck = validateImageSignature(buffer);
  if (!sigCheck.valid) {
    throw new Error(sigCheck.error || 'Invalid image file: unrecognised format.');
  }

  // 2. Validate size
  if (buffer.length > PAYMENT_PROOF_MAX_BYTES) {
    throw new Error(
      `Payment proof screenshot exceeds the 5 MB size limit (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`
    );
  }

  const cloudinary = getCloudinary();

  // 3. Build a unique, user-scoped public_id
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  const uniqueSuffix = `${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const publicId = `${PAYMENT_PROOF_FOLDER}/${safeUserId}/${uniqueSuffix}`;

  // 4. Upload via upload_stream as `authenticated` type
  const uploadResult: any = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        type: 'authenticated',         // Private: requires signed URL
        overwrite: false,
        resource_type: 'image',
        quality: 'auto:best',          // Preserve screenshot clarity
        flags: 'strip_profile',        // Remove EXIF metadata
        tags: ['efootball', 'payment_proof', safeUserId],
      },
      (err, res) => {
        if (err) return reject(err);
        resolve(res);
      }
    );
    stream.end(buffer);
  });

  if (!uploadResult?.public_id) {
    throw new Error('Cloudinary upload returned no public_id.');
  }

  return {
    publicId: uploadResult.public_id,
    secureUrl: uploadResult.secure_url,
    format: uploadResult.format || 'jpg',
    bytes: uploadResult.bytes || buffer.length,
  };
}

/**
 * Generates a short-lived authenticated delivery URL for a payment proof image.
 * URL expires in `expiresInSeconds` (default: 1 hour).
 *
 * Cloudinary `authenticated` assets can ONLY be accessed via signed URLs.
 * Unsigned access returns HTTP 401 or a placeholder.
 */
export function generatePaymentProofUrl(
  publicId: string,
  expiresInSeconds = 3600
): string {
  const cloudinary = getCloudinary();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;

  return cloudinary.url(publicId, {
    type: 'authenticated',
    sign_url: true,
    expires_at: expiresAt,
    secure: true,
    resource_type: 'image',
  });
}

/**
 * Checks whether a Cloudinary public_id is a payment proof (starts with the fixed folder prefix).
 * Guards against arbitrary public_id injection.
 */
export function isValidPaymentProofPublicId(publicId: string): boolean {
  return (
    typeof publicId === 'string' &&
    publicId.startsWith(PAYMENT_PROOF_FOLDER + '/') &&
    publicId.length > PAYMENT_PROOF_FOLDER.length + 1
  );
}
