import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Downloads a file from an external URL and uploads it to Supabase storage
 * Returns the permanent Supabase storage public URL
 */
export async function uploadMediaFromUrl(
  externalUrl: string,
  mediaType: "image" | "video",
  supabase: SupabaseClient,
  bucket: string = "post-media"
): Promise<string> {
  try {
    // Fetch the file from external URL
    const response = await fetch(externalUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch file from URL: ${response.statusText}`);
    }

    const blob = await response.blob();
    
    // Determine file extension based on content type or media type
    const contentType = blob.type || (mediaType === "image" ? "image/jpeg" : "video/mp4");
    const extension = getExtensionFromContentType(contentType, mediaType);
    
    // Generate unique filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const folder = mediaType === "image" ? "ai-images" : "ai-videos";
    const filePath = `${folder}/${randomId}-${timestamp}.${extension}`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, blob, {
        contentType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload to storage: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  } catch (error) {
    console.error("Error uploading media from URL:", error);
    throw error;
  }
}

/**
 * Helper to determine file extension from content type
 */
function getExtensionFromContentType(contentType: string, mediaType: "image" | "video"): string {
  const imageExtensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };

  const videoExtensions: Record<string, string> = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-msvideo": "avi",
  };

  if (mediaType === "image") {
    return imageExtensions[contentType] || "jpg";
  }
  return videoExtensions[contentType] || "mp4";
}

/**
 * Uploads a base64 data URL to Supabase storage
 * Useful when AI returns base64 encoded images
 */
export async function uploadBase64ToStorage(
  base64DataUrl: string,
  mediaType: "image" | "video",
  supabase: SupabaseClient,
  bucket: string = "post-media"
): Promise<string> {
  try {
    // Parse base64 data URL
    const matches = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Invalid base64 data URL format");
    }

    const contentType = matches[1];
    const base64Data = matches[2];
    
    // Convert base64 to blob
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: contentType });

    // Generate unique filename
    const extension = getExtensionFromContentType(contentType, mediaType);
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const folder = mediaType === "image" ? "ai-images" : "ai-videos";
    const filePath = `${folder}/${randomId}-${timestamp}.${extension}`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, blob, {
        contentType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload to storage: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  } catch (error) {
    console.error("Error uploading base64 to storage:", error);
    throw error;
  }
}
