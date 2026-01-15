import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { externalUrl, mediaType } = await req.json();

    if (!externalUrl) {
      return new Response(
        JSON.stringify({ error: "externalUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Downloading media from: ${externalUrl}`);

    // Check if it's a base64 data URL
    let blob: Blob;
    let contentType: string;

    if (externalUrl.startsWith("data:")) {
      // Parse base64 data URL
      const matches = externalUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        throw new Error("Invalid base64 data URL format");
      }
      contentType = matches[1];
      const base64Data = matches[2];
      
      // Decode base64 to Uint8Array
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      blob = new Blob([bytes], { type: contentType });
    } else {
      // Fetch from external URL (server-side, no CORS issues)
      const response = await fetch(externalUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }
      blob = await response.blob();
      contentType = blob.type || (mediaType === "image" ? "image/jpeg" : "video/mp4");
    }

    // Determine file extension
    const extensionMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov",
    };
    const extension = extensionMap[contentType] || (mediaType === "image" ? "jpg" : "mp4");

    // Generate unique filename
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().split("-")[0];
    const folder = mediaType === "image" ? "ai-images" : "ai-videos";
    const filePath = `${folder}/${randomId}-${timestamp}.${extension}`;

    console.log(`Uploading to storage: ${filePath}`);

    // Convert blob to ArrayBuffer for upload
    const arrayBuffer = await blob.arrayBuffer();

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from("post-media")
      .upload(filePath, arrayBuffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error("Storage upload error:", error);
      throw new Error(`Failed to upload to storage: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("post-media")
      .getPublicUrl(data.path);

    console.log(`Upload successful: ${urlData.publicUrl}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        url: urlData.publicUrl,
        path: data.path 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in upload-ai-media:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
