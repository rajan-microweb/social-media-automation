import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Uploads media from external URL to Supabase storage via edge function
 * This avoids CORS issues by doing the fetch server-side
 */
export async function uploadMediaFromUrl(
  externalUrl: string,
  mediaType: "image" | "video",
  supabase: SupabaseClient,
  bucket: string = "post-media"
): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await supabase.functions.invoke("upload-ai-media", {
      body: { externalUrl, mediaType, bucket },
    });

    if (response.error) {
      throw new Error(response.error.message || "Failed to upload media");
    }

    if (!response.data?.url) {
      throw new Error("No URL returned from upload");
    }

    return response.data.url;
  } catch (error) {
    console.error("Error uploading media from URL:", error);
    throw error;
  }
}

/**
 * Uploads a base64 data URL to Supabase storage via edge function
 */
export async function uploadBase64ToStorage(
  base64DataUrl: string,
  mediaType: "image" | "video",
  supabase: SupabaseClient,
  bucket: string = "post-media"
): Promise<string> {
  try {
    const response = await supabase.functions.invoke("upload-ai-media", {
      body: { externalUrl: base64DataUrl, mediaType, bucket },
    });

    if (response.error) {
      throw new Error(response.error.message || "Failed to upload media");
    }

    if (!response.data?.url) {
      throw new Error("No URL returned from upload");
    }

    return response.data.url;
  } catch (error) {
    console.error("Error uploading base64 to storage:", error);
    throw error;
  }
}
