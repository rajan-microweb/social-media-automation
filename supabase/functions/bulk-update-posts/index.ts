import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { post_ids, updates } = await req.json();

    if (!Array.isArray(post_ids) || post_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "post_ids must be a non-empty array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (post_ids.length > 50) {
      return new Response(
        JSON.stringify({ error: "Maximum 50 posts can be updated at once" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify ownership of all posts
    const { data: posts, error: fetchError } = await supabase
      .from("posts")
      .select("id, user_id")
      .in("id", post_ids);

    if (fetchError) {
      console.error("Error fetching posts:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to verify post ownership" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check all posts belong to the user
    const unauthorized = posts?.filter((p) => p.user_id !== user.id) || [];
    if (unauthorized.length > 0 || posts?.length !== post_ids.length) {
      return new Response(
        JSON.stringify({ error: "You can only update your own posts" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.status) updateData.status = updates.status;
    if (updates.scheduled_at) updateData.scheduled_at = updates.scheduled_at;

    // Perform bulk update
    const { error: updateError } = await supabase
      .from("posts")
      .update(updateData)
      .in("id", post_ids);

    if (updateError) {
      console.error("Error updating posts:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update posts" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Bulk updated ${post_ids.length} posts for user ${user.id}`);

    return new Response(
      JSON.stringify({ success: true, updated: post_ids.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
