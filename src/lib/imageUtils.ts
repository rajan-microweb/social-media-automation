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

/**
 * Instagram allowed aspect ratios for carousel posts
 */
const INSTAGRAM_ALLOWED_RATIOS = [
  { name: '1:1 (Square)', value: 1.0 },
  { name: '4:5 (Portrait)', value: 0.8 },
  { name: '1.91:1 (Landscape)', value: 1.91 },
];

const ASPECT_RATIO_TOLERANCE = 0.03; // 3% tolerance

/**
 * Gets the aspect ratio of an image file
 * @param file - Image file
 * @returns Promise<number> - width/height ratio
 */
export const getImageAspectRatio = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img.width / img.height);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
    img.src = URL.createObjectURL(file);
  });
};

/**
 * Gets the aspect ratio of an image from a URL
 * @param url - Image URL
 * @returns Promise<number> - width/height ratio
 */
export const getImageAspectRatioFromUrl = (url: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img.width / img.height);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
};

/**
 * Validates if an aspect ratio matches one of Instagram's allowed ratios
 * @param ratio - The aspect ratio (width/height)
 * @returns { valid: boolean, closestRatio: string, message?: string }
 */
export const validateInstagramAspectRatio = (ratio: number): {
  valid: boolean;
  closestRatio: string;
  message?: string;
} => {
  for (const allowed of INSTAGRAM_ALLOWED_RATIOS) {
    const diff = Math.abs(ratio - allowed.value) / allowed.value;
    if (diff <= ASPECT_RATIO_TOLERANCE) {
      return { valid: true, closestRatio: allowed.name };
    }
  }

  const ratioStr = ratio > 1
    ? `${ratio.toFixed(2)}:1`
    : `1:${(1 / ratio).toFixed(2)}`;

  return {
    valid: false,
    closestRatio: '',
    message: `Image ratio ${ratioStr} is not allowed for Instagram carousel. Use 1:1, 4:5, or 1.91:1.`,
  };
};
