/**
 * Client-side high-performance image compression utility.
 * Downscales images to reasonable max dimensions and compresses them into high-quality JPEG/WEBP.
 * Prevents HTTP 413 (Payload Too Large) on Next.js Server Actions and Vercel Serverless Functions.
 */
export async function compressImage(
  file: File,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    maxSizeBytes?: number;
  } = {}
): Promise<File> {
  // If not an image or already smaller than 300 KB, skip compression
  if (!file.type.startsWith('image/') || file.size < 300 * 1024) {
    return file;
  }

  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.82,
    maxSizeBytes = 800 * 1024, // 800 KB target
  } = options;

  return new Promise((resolve) => {
    // Fail-safe: if FileReader/Image fails, resolve original file
    const reader = new FileReader();
    reader.onerror = () => resolve(file);
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Proportional aspect ratio downscaling
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(file);
        }

        // Draw image on canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to high-quality JPEG
        const outputType = 'image/jpeg';
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return resolve(file);
            }

            // Create compressed file
            const newName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
            const compressedFile = new File([blob], newName, {
              type: outputType,
              lastModified: Date.now(),
            });

            console.log(
              `[Image Compression] Original: ${(file.size / 1024).toFixed(1)} KB -> Compressed: ${(
                compressedFile.size / 1024
              ).toFixed(1)} KB`
            );

            resolve(compressedFile);
          },
          outputType,
          quality
        );
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}
