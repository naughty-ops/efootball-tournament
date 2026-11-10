import 'server-only';
import { v2 as cloudinary } from 'cloudinary';

export function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  return {
    cloudName,
    apiKey,
    apiSecret,
    isConfigured: Boolean(cloudName && apiKey && apiSecret),
  };
}

export function isCloudinaryConfigured(): boolean {
  return getCloudinaryConfig().isConfigured;
}

/**
 * Returns configured Cloudinary instance.
 * Throws a clear error if credentials are not set when live operations are attempted.
 */
export function getCloudinary() {
  const { cloudName, apiKey, apiSecret, isConfigured } = getCloudinaryConfig();

  if (!isConfigured) {
    const missing: string[] = [];
    if (!cloudName) missing.push('CLOUDINARY_CLOUD_NAME');
    if (!apiKey) missing.push('CLOUDINARY_API_KEY');
    if (!apiSecret) missing.push('CLOUDINARY_API_SECRET');

    throw new Error(
      `Cloudinary is not fully configured. Missing required server environment variables: ${missing.join(', ')}.`
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  return cloudinary;
}

export { cloudinary };
