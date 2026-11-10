'use client';

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
  compressionRatio: number; // e.g. 0.45 = reduced by 55%
}

/**
 * Validates and compresses screenshot images before uploading.
 *
 * Rules:
 * - Strict 2 MB rejection rule: original file > 2 MB rejected immediately.
 * - Target compressed size: 500 KB or less.
 * - Preserve sufficient image clarity so match scores remain crisp and readable.
 * - If it still cannot reach 500 KB without compromising readability, rejects with a prompt
 *   for the player to upload another screenshot.
 */
export async function compressScreenshotForEvidence(
  file: File,
  targetMaxBytes: number = 500 * 1024 // 500 KB
): Promise<CompressionResult> {
  const MAX_ORIGINAL_BYTES = 2 * 1024 * 1024; // 2 MB

  // 1. Strict 2 MB rejection rule (Original file)
  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new Error('File size exceeds the 2 MB limit. Please select a smaller screenshot.');
  }

  // 2. MIME type validation
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Unsupported image format. Only JPEG, PNG, and WebP images are allowed.');
  }

  // If running in non-browser environment
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    if (file.size > targetMaxBytes) {
      throw new Error('Screenshot exceeds the 500 KB limit. Maximum accepted screenshot size is 500 KB per image.');
    }
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      wasCompressed: false,
      compressionRatio: 1,
    };
  }

  // 3. Load image into HTMLImageElement
  const image = await loadImage(file);

  try {
    const originalWidth = image.naturalWidth || image.width;
    const originalHeight = image.naturalHeight || image.height;

    if (!originalWidth || !originalHeight) {
      throw new Error('Failed to read screenshot dimensions. Please ensure the file is a valid image.');
    }

    // eFootball match result screens are typically 16:9 (e.g. 1920x1080 or phone 2400x1080).
    // A max width of 1920 retains Full-HD clarity with razor-sharp score digits.
    const MAX_DIMENSION = 1920;
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;

    if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION) {
      if (targetWidth >= targetHeight) {
        targetHeight = Math.round((targetHeight * MAX_DIMENSION) / targetWidth);
        targetWidth = MAX_DIMENSION;
      } else {
        targetWidth = Math.round((targetWidth * MAX_DIMENSION) / targetHeight);
        targetHeight = MAX_DIMENSION;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context not available for image compression.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    // Iterative quality reduction to achieve <= 500 KB while preserving score readability.
    // Minimum quality is bounded at 0.55 and minimum dimension bounded at 1280 to guarantee
    // score numbers, player names, and timer remain crystal clear.
    const QUALITY_STEPS = [0.85, 0.78, 0.70, 0.62, 0.55];
    let bestBlob: Blob | null = null;

    for (const quality of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (blob) {
        bestBlob = blob;
        if (blob.size <= targetMaxBytes) {
          break; // Successfully reached <= 500 KB target!
        }
      }
    }

    // If still > 500 KB with 1920 max dimension at 0.55 quality, perform Stage 2 downscale to 1440/1280
    if (bestBlob && bestBlob.size > targetMaxBytes) {
      const RESIZE_DIMENSIONS = [1440, 1280];
      for (const maxDim of RESIZE_DIMENSIONS) {
        let stepWidth = originalWidth;
        let stepHeight = originalHeight;

        if (stepWidth >= stepHeight) {
          stepHeight = Math.round((stepHeight * maxDim) / stepWidth);
          stepWidth = maxDim;
        } else {
          stepWidth = Math.round((stepWidth * maxDim) / stepHeight);
          stepHeight = maxDim;
        }

        const resizeCanvas = document.createElement('canvas');
        resizeCanvas.width = stepWidth;
        resizeCanvas.height = stepHeight;
        const resizeCtx = resizeCanvas.getContext('2d');

        if (resizeCtx) {
          resizeCtx.imageSmoothingEnabled = true;
          resizeCtx.imageSmoothingQuality = 'high';
          resizeCtx.drawImage(image, 0, 0, stepWidth, stepHeight);

          for (const q of [0.72, 0.62, 0.55]) {
            const blob = await canvasToBlob(resizeCanvas, 'image/jpeg', q);
            if (blob) {
              bestBlob = blob;
              if (blob.size <= targetMaxBytes) {
                break;
              }
            }
          }
        }

        if (bestBlob && bestBlob.size <= targetMaxBytes) {
          break;
        }
      }
    }

    // If after all multi-stage compression, it still cannot reach 500 KB:
    // Prompt the player to upload another screenshot rather than degrading score legibility.
    if (!bestBlob || bestBlob.size > targetMaxBytes) {
      throw new Error(
        'Unable to compress screenshot below 500 KB while preserving score readability. Please upload another screenshot.'
      );
    }

    // Format new file
    const newFileName = file.name.replace(/\.[^.]+$/, '') + '_compressed.jpg';
    const compressedFile = new File([bestBlob], newFileName, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

    return {
      file: compressedFile,
      originalSize: file.size,
      compressedSize: bestBlob.size,
      wasCompressed: true,
      compressionRatio: Math.round((bestBlob.size / file.size) * 100) / 100,
    };
  } finally {
    // Revoke object URL to avoid memory leaks
    if ((image as any)._objectUrl) {
      URL.revokeObjectURL((image as any)._objectUrl);
    }
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    (img as any)._objectUrl = url;

    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image file for compression.'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}
