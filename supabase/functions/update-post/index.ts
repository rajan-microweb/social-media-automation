import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation helper
const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

const validStatuses = ['draft', 'scheduled', 'published'];
const validPostTypes = ['onlyText', 'image', 'video', 'carousel', 'shorts', 'article', 'pdf'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { post_id, ...updateData } = body;

    // Validate post_id
    if (!post_id || !isValidUUID(post_id)) {
      return new Response(
        JSON.stringify({ error: 'Valid post_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate updateData fields
    const allowedFields = [
      'title', 'description', 'text', 'type_of_post', 'platforms', 
      'account_type', 'image', 'video', 'pdf', 'url', 'tags', 
      'status', 'scheduled_at'
    ];

    const updateFields: Record<string, any> = {};
    for (const [key, value] of Object.entries(updateData)) {
      if (!allowedFields.includes(key)) {
        return new Response(
          JSON.stringify({ error: `Invalid field: ${key}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate specific fields
      if (key === 'status' && value && !validStatuses.includes(value as string)) {
        return new Response(
          JSON.stringify({ error: 'Invalid status value' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (key === 'type_of_post' && value && !validPostTypes.includes(value as string)) {
        return new Response(
          JSON.stringify({ error: 'Invalid type_of_post value' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (key === 'text' && typeof value === 'string' && value.length > 5000) {
        return new Response(
          JSON.stringify({ error: 'Text field exceeds maximum length' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      updateFields[key] = value;
    }

    console.log('Updating post:', post_id, 'with data:', updateFields);

    // Verify ownership before update - RLS will handle this but we check explicitly
    const { data: existingPost, error: fetchError } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', post_id)
      .single();

    if (fetchError || !existingPost) {
      return new Response(
        JSON.stringify({ error: 'Post not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (existingPost.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the post
    const { data, error } = await supabase
      .from('posts')
      .update(updateFields)
      .eq('id', post_id)
      .select()
      .single();

    if (error) {
      console.error('Error updating post:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to update post' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Post updated successfully');

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in update-post function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
