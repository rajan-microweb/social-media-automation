/**
 * Image utility functions for format conversion
 */

/**
 * Converts any image (File or URL) to JPEG format using Canvas API
 * @param source - File object or image URL string
 * @param quality - JPEG quality (0.0 to 1.0, default 0.92)
 * @returns Promise<Blob> - JPEG blob
 */
export const convertToJpeg = async (
  source: File | string,
  quality: number = 0.92
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Fill white background (for transparent PNGs)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            // Revoke object URL if we created one
            if (typeof source !== 'string') {
              URL.revokeObjectURL(img.src);
            }
            resolve(blob);
          } else {
            reject(new Error('Failed to convert image to JPEG'));
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      if (typeof source !== 'string') {
        URL.revokeObjectURL(img.src);
      }
      reject(new Error('Failed to load image'));
    };

    // Handle File or URL
    if (typeof source === 'string') {
      img.src = source;
    } else {
      img.src = URL.createObjectURL(source);
    }
  });
};

/**
 * Converts a File to JPEG File object
 * @param file - Original file
 * @param quality - JPEG quality (0.0 to 1.0, default 0.92)
 * @returns Promise<File> - New JPEG File
 */
export const convertFileToJpeg = async (
  file: File,
  quality: number = 0.92
): Promise<File> => {
  const blob = await convertToJpeg(file, quality);
  const newName = file.name.replace(/\.[^/.]+$/, '.jpg');
  return new File([blob], newName, { type: 'image/jpeg' });
};

/**
 * Checks if a file is already JPEG format
 * @param file - File to check
 * @returns boolean
 */
export const isJpegFile = (file: File): boolean => {
  return file.type === 'image/jpeg' || file.type === 'image/jpg';
};

/**
 * Converts a URL image to JPEG and returns a File object
 * @param url - Image URL (can be base64 data URL or http URL)
 * @param fileName - Name for the resulting file
 * @param quality - JPEG quality (0.0 to 1.0, default 0.92)
 * @returns Promise<File> - JPEG File object
 */
export const convertUrlToJpegFile = async (
  url: string,
  fileName: string = 'image.jpg',
  quality: number = 0.92
): Promise<File> => {
  const blob = await convertToJpeg(url, quality);
  return new File([blob], fileName, { type: 'image/jpeg' });
};
