import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { file_path, file_url } = body;

    // Extract file path from URL if provided
    let filePath = file_path;
    if (!filePath && file_url) {
      // Extract path from URL like: https://xxx.supabase.co/storage/v1/object/public/post-media/images/filename.jpg
      const urlParts = file_url.split('/post-media/');
      if (urlParts.length > 1) {
        filePath = urlParts[1];
      }
    }

    if (!filePath) {
      console.error('Missing file_path or file_url in request');
      return new Response(
        JSON.stringify({ error: 'file_path or file_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Deleting file from bucket:', filePath);

    // Delete the file from the post-media bucket
    const { data, error } = await supabase
      .storage
      .from('post-media')
      .remove([filePath]);

    if (error) {
      console.error('Error deleting file:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('File deleted successfully:', data);

    return new Response(
      JSON.stringify({ success: true, deleted_files: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in delete-media function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
