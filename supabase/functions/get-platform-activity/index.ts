import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PlatformActivityItem {
  id: string;
  platform: string;
  accountName: string;
  accountId: string;
  content: string;
  mediaUrl?: string;
  permalink?: string;
  publishedAt: string;
  engagement?: {
    likes?: number;
    comments?: number;
    shares?: number;
    views?: number;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Fetching platform activity for user: ${user.id}`);

    // Get all active platform integrations
    const { data: integrations, error: intError } = await supabase
      .from("platform_integrations")
      .select("platform_name, credentials, credentials_encrypted")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (intError) {
      console.error("Failed to fetch integrations:", intError);
      throw intError;
    }

    console.log(`Found ${integrations?.length || 0} active integrations`);

    const allActivities: PlatformActivityItem[] = [];

    // Process each platform in parallel
    const activityPromises = (integrations || []).map(async (integration) => {
      const platform = integration.platform_name.toLowerCase();
      let credentials = integration.credentials;

      // Decrypt if needed
      if (integration.credentials_encrypted && typeof credentials === "string") {
        const { data: decrypted } = await supabase.rpc("decrypt_credentials", {
          encrypted_creds: credentials,
        });
        credentials = decrypted;
      }

      console.log(`Processing ${platform} integration`);

      try {
        switch (platform) {
          case "linkedin":
            return await fetchLinkedInActivity(credentials);
          case "facebook":
            return await fetchFacebookActivity(credentials);
          case "instagram":
            return await fetchInstagramActivity(credentials);
          case "youtube":
            return await fetchYouTubeActivity(credentials);
          case "twitter":
            return await fetchTwitterActivity(credentials);
          default:
            return [];
        }
      } catch (error) {
        console.error(`Failed to fetch ${platform} activity:`, error);
        return [];
      }
    });

    const results = await Promise.allSettled(activityPromises);
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        allActivities.push(...result.value);
      }
    });

    // Sort by publishedAt descending and limit to 10
    const sortedActivities = allActivities
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 10);

    console.log(`Returning ${sortedActivities.length} activity items`);

    return new Response(JSON.stringify({ activities: sortedActivities }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in get-platform-activity:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function fetchLinkedInActivity(credentials: any): Promise<PlatformActivityItem[]> {
  const items: PlatformActivityItem[] = [];
  const accessToken = credentials?.access_token;
  if (!accessToken) return items;

  const personalInfo = credentials?.personal_info;
  const companies = credentials?.company_info || [];

  // Fetch personal posts
  if (personalInfo?.linkedin_id) {
    try {
      const personUrn = personalInfo.linkedin_id.startsWith("urn:li:person:")
        ? personalInfo.linkedin_id
        : `urn:li:person:${personalInfo.linkedin_id}`;

      const response = await fetch(
        `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(${encodeURIComponent(personUrn)})&count=5`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const posts = data.elements || [];
        posts.forEach((post: any) => {
          const text = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text || "";
          items.push({
            id: post.id,
            platform: "linkedin",
            accountName: personalInfo.name || "LinkedIn Personal",
            accountId: personUrn,
            content: text,
            permalink: `https://www.linkedin.com/feed/update/${post.id}`,
            publishedAt: new Date(post.created?.time || Date.now()).toISOString(),
          });
        });
      }
    } catch (e) {
      console.error("LinkedIn personal posts error:", e);
    }
  }

  // Fetch company posts
  for (const company of companies) {
    try {
      const orgUrn = company.company_id?.startsWith("urn:li:organization:")
        ? company.company_id
        : `urn:li:organization:${company.company_id}`;

      const response = await fetch(
        `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(${encodeURIComponent(orgUrn)})&count=5`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const posts = data.elements || [];
        posts.forEach((post: any) => {
          const text = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text || "";
          items.push({
            id: post.id,
            platform: "linkedin",
            accountName: company.company_name || "LinkedIn Company",
            accountId: orgUrn,
            content: text,
            permalink: `https://www.linkedin.com/feed/update/${post.id}`,
            publishedAt: new Date(post.created?.time || Date.now()).toISOString(),
          });
        });
      }
    } catch (e) {
      console.error("LinkedIn company posts error:", e);
    }
  }

  return items;
}

async function fetchFacebookActivity(credentials: any): Promise<PlatformActivityItem[]> {
  const items: PlatformActivityItem[] = [];
  const accessToken = credentials?.access_token || credentials?.page_access_token;
  if (!accessToken) return items;

  const pages = credentials?.pages || [];
  // Handle legacy format
  if (credentials?.page_id && !pages.length) {
    pages.push({ page_id: credentials.page_id, page_name: credentials.page_name || "Facebook Page" });
  }

  for (const page of pages) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${page.page_id}/feed?fields=id,message,created_time,permalink_url,shares,likes.summary(true),comments.summary(true)&limit=5&access_token=${accessToken}`
      );

      if (response.ok) {
        const data = await response.json();
        const posts = data.data || [];
        posts.forEach((post: any) => {
          items.push({
            id: post.id,
            platform: "facebook",
            accountName: page.page_name || "Facebook Page",
            accountId: page.page_id,
            content: post.message || "",
            permalink: post.permalink_url,
            publishedAt: post.created_time,
            engagement: {
              likes: post.likes?.summary?.total_count || 0,
              comments: post.comments?.summary?.total_count || 0,
              shares: post.shares?.count || 0,
            },
          });
        });
      }
    } catch (e) {
      console.error("Facebook page posts error:", e);
    }
  }

  return items;
}

async function fetchInstagramActivity(credentials: any): Promise<PlatformActivityItem[]> {
  const items: PlatformActivityItem[] = [];
  const accessToken = credentials?.access_token;
  if (!accessToken) return items;

  const accounts = credentials?.accounts || [];
  // Handle legacy format
  if (credentials?.ig_business_id && !accounts.length) {
    accounts.push({ ig_business_id: credentials.ig_business_id, ig_username: credentials.ig_username });
  }

  for (const account of accounts) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${account.ig_business_id}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=5&access_token=${accessToken}`
      );

      if (response.ok) {
        const data = await response.json();
        const media = data.data || [];
        media.forEach((item: any) => {
          items.push({
            id: item.id,
            platform: "instagram",
            accountName: `@${account.ig_username}` || "Instagram",
            accountId: account.ig_business_id,
            content: item.caption || "",
            mediaUrl: item.media_type === "VIDEO" ? item.thumbnail_url : item.media_url,
            permalink: item.permalink,
            publishedAt: item.timestamp,
            engagement: {
              likes: item.like_count || 0,
              comments: item.comments_count || 0,
            },
          });
        });
      }
    } catch (e) {
      console.error("Instagram media error:", e);
    }
  }

  return items;
}

async function fetchYouTubeActivity(credentials: any): Promise<PlatformActivityItem[]> {
  const items: PlatformActivityItem[] = [];
  const accessToken = credentials?.access_token;
  if (!accessToken) return items;

  const channels = credentials?.channels || [];

  for (const channel of channels) {
    try {
      // First get uploads playlist
      const channelRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channel.channel_id}&access_token=${accessToken}`
      );

      if (!channelRes.ok) continue;

      const channelData = await channelRes.json();
      const uploadsPlaylist = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylist) continue;

      // Get recent uploads
      const videosRes = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylist}&maxResults=5&access_token=${accessToken}`
      );

      if (videosRes.ok) {
        const videosData = await videosRes.json();
        const videos = videosData.items || [];
        videos.forEach((video: any) => {
          const snippet = video.snippet;
          items.push({
            id: snippet.resourceId?.videoId || video.id,
            platform: "youtube",
            accountName: channel.channel_name || "YouTube Channel",
            accountId: channel.channel_id,
            content: snippet.title || "",
            mediaUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
            permalink: `https://www.youtube.com/watch?v=${snippet.resourceId?.videoId}`,
            publishedAt: snippet.publishedAt,
          });
        });
      }
    } catch (e) {
      console.error("YouTube videos error:", e);
    }
  }

  return items;
}

async function fetchTwitterActivity(credentials: any): Promise<PlatformActivityItem[]> {
  const items: PlatformActivityItem[] = [];
  const accessToken = credentials?.access_token;
  const userId = credentials?.personal_info?.user_id;
  if (!accessToken || !userId) return items;

  try {
    const response = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=5&tweet.fields=created_at,public_metrics`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      const tweets = data.data || [];
      tweets.forEach((tweet: any) => {
        items.push({
          id: tweet.id,
          platform: "twitter",
          accountName: credentials.personal_info?.name || `@${credentials.personal_info?.username}` || "Twitter",
          accountId: userId,
          content: tweet.text || "",
          permalink: `https://twitter.com/${credentials.personal_info?.username}/status/${tweet.id}`,
          publishedAt: tweet.created_at || new Date().toISOString(),
          engagement: {
            likes: tweet.public_metrics?.like_count || 0,
            comments: tweet.public_metrics?.reply_count || 0,
            shares: tweet.public_metrics?.retweet_count || 0,
          },
        });
      });
    }
  } catch (e) {
    console.error("Twitter tweets error:", e);
  }

  return items;
}
