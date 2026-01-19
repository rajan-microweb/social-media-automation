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

    const { story_ids, updates } = await req.json();

    if (!Array.isArray(story_ids) || story_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "story_ids must be a non-empty array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (story_ids.length > 50) {
      return new Response(
        JSON.stringify({ error: "Maximum 50 stories can be updated at once" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify ownership of all stories
    const { data: stories, error: fetchError } = await supabase
      .from("stories")
      .select("id, user_id")
      .in("id", story_ids);

    if (fetchError) {
      console.error("Error fetching stories:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to verify story ownership" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check all stories belong to the user
    const unauthorized = stories?.filter((s) => s.user_id !== user.id) || [];
    if (unauthorized.length > 0 || stories?.length !== story_ids.length) {
      return new Response(
        JSON.stringify({ error: "You can only update your own stories" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.status) updateData.status = updates.status;
    if (updates.scheduled_at) updateData.scheduled_at = updates.scheduled_at;

    // Perform bulk update
    const { error: updateError } = await supabase
      .from("stories")
      .update(updateData)
      .in("id", story_ids);

    if (updateError) {
      console.error("Error updating stories:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update stories" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Bulk updated ${story_ids.length} stories for user ${user.id}`);

    return new Response(
      JSON.stringify({ success: true, updated: story_ids.length }),
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
