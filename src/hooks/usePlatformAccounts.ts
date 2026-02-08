import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PlatformAccount {
  id: string;
  name: string;
  avatar: string | null;
  type: 'personal' | 'company' | 'page' | 'channel';
  platform: string;
}

interface LinkedInMetadata {
  personal_info?: {
    name: string;
    linkedin_id: string;
    picture?: string;
  };
  organizations?: Array<{
    company_name: string;
    company_id: string;
    logo_url?: string;
  }>;
}

interface FacebookMetadata {
  pages?: Array<{
    page_id: string;
    page_name: string;
    picture_url?: string;
  }>;
}

interface InstagramMetadata {
  accounts?: Array<{
    ig_business_id: string;
    ig_username: string;
    profile_picture_url?: string;
    connected_page_id?: string;
    connected_page_name?: string;
  }>;
}

interface YouTubeMetadata {
  channels?: Array<{
    channel_id: string;
    channel_name: string;
    thumbnail_url?: string;
    subscriber_count?: string;
    video_count?: string;
  }>;
}

interface TwitterMetadata {
  user?: {
    id: string;
    username: string;
    name?: string;
    profile_image_url?: string;
  };
}

export function usePlatformAccounts(userId: string | undefined, selectedPlatforms: string[]) {
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAccounts = async () => {
      if (!userId || selectedPlatforms.length === 0) {
        setAccounts([]);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("platform_integrations")
          .select("platform_name, metadata")
          .eq("user_id", userId)
          .eq("status", "active")
          .in("platform_name", selectedPlatforms);

        if (error) throw error;

        const allAccounts: PlatformAccount[] = [];

        data?.forEach((integration) => {
          const platformName = integration.platform_name.toLowerCase();
          const metadata = integration.metadata as Record<string, unknown>;

          if (!metadata || Object.keys(metadata).length === 0) return;

          // --- LINKEDIN ---
          if (platformName === "linkedin") {
            const meta = metadata as unknown as LinkedInMetadata;
            if (meta.personal_info) {
              allAccounts.push({
                id: meta.personal_info.linkedin_id,
                name: meta.personal_info.name,
                avatar: meta.personal_info.picture || null,
                type: 'personal',
                platform: 'linkedin'
              });
            }
            if (meta.organizations) {
              meta.organizations.forEach(org => {
                allAccounts.push({
                  id: org.company_id,
                  name: org.company_name,
                  avatar: org.logo_url || null,
                  type: 'company',
                  platform: 'linkedin'
                });
              });
            }
          }

          // --- FACEBOOK ---
          if (platformName === "facebook") {
            const meta = metadata as unknown as FacebookMetadata;
            if (Array.isArray(meta.pages)) {
              meta.pages.forEach(page => {
                allAccounts.push({
                  id: page.page_id,
                  name: page.page_name,
                  avatar: page.picture_url || null,
                  type: 'page',
                  platform: 'facebook'
                });
              });
            }
          }

          // --- INSTAGRAM ---
          if (platformName === "instagram") {
            const meta = metadata as unknown as InstagramMetadata;
            if (Array.isArray(meta.accounts)) {
              meta.accounts.forEach(account => {
                allAccounts.push({
                  id: account.ig_business_id,
                  name: `@${account.ig_username}`,
                  avatar: account.profile_picture_url || null,
                  type: 'personal',
                  platform: 'instagram'
                });
              });
            }
          }

          // --- YOUTUBE ---
          if (platformName === "youtube") {
            const meta = metadata as unknown as YouTubeMetadata;
            if (Array.isArray(meta.channels)) {
              meta.channels.forEach(channel => {
                allAccounts.push({
                  id: channel.channel_id,
                  name: channel.channel_name,
                  avatar: channel.thumbnail_url || null,
                  type: 'channel',
                  platform: 'youtube'
                });
              });
            }
          }

          // --- TWITTER ---
          if (platformName === "twitter") {
            const meta = metadata as unknown as TwitterMetadata;
            if (meta.user) {
              allAccounts.push({
                id: meta.user.id,
                name: meta.user.name || `@${meta.user.username}`,
                avatar: meta.user.profile_image_url || null,
                type: 'personal',
                platform: 'twitter'
              });
            }
          }
        });

        setAccounts(allAccounts);
      } catch (error) {
        console.error('Error fetching platform accounts:', error);
        toast.error("Failed to load platform accounts");
      } finally {
        setLoading(false);
      }
    };

    fetchAccounts();
  }, [userId, selectedPlatforms.join(',')]);

  return { accounts, loading };
}
