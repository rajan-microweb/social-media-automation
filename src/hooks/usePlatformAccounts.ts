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

interface LinkedInCredentials {
  personal_info?: {
    name: string;
    avatar_url: string;
    linkedin_id: string;
  };
  company_info?: Array<{
    company_name: string;
    company_id: string;
    company_logo: string;
  }>;
}

interface FacebookCredentials {
  personal_info?: {
    name: string;
    avatar_url: string;
    user_id: string;
  };
  pages?: Array<{
    page_id: string;
    page_name: string;
    avatar_url?: string;
  }>;
  // Legacy format
  page_id?: string;
  page_name?: string;
  page_info?: {
    avatar_url?: string;
  };
}

interface InstagramCredentials {
  accounts?: Array<{
    ig_id: string;
    ig_username: string;
    avatar_url?: string;
    account_name?: string;
  }>;
  // Legacy format
  ig_business_id?: string;
  ig_username?: string;
  ig_avatar?: string;
}

interface YouTubeCredentials {
  personal_info?: {
    name: string;
    avatar_url: string;
    user_id: string;
    channel_id?: string;
    channel_name?: string;
  };
  channels?: Array<{
    channel_id: string;
    channel_name: string;
    avatar_url?: string;
  }>;
  // Legacy format
  accessToken?: string;
  clientId?: string;
}

interface TwitterCredentials {
  personal_info?: {
    user_id: string;
    username: string;
    name?: string;
    avatar_url?: string;
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
          .select("platform_name, credentials")
          .eq("user_id", userId)
          .eq("status", "active")
          .in("platform_name", selectedPlatforms);

        if (error) throw error;

        const allAccounts: PlatformAccount[] = [];

        data?.forEach((integration) => {
          const platformName = integration.platform_name.toLowerCase();
          const credentials = integration.credentials as Record<string, unknown>;

          // --- LINKEDIN ---
          if (platformName === "linkedin") {
            const creds = credentials as unknown as LinkedInCredentials;
            if (creds.personal_info) {
              allAccounts.push({
                id: creds.personal_info.linkedin_id,
                name: creds.personal_info.name,
                avatar: creds.personal_info.avatar_url,
                type: 'personal',
                platform: 'linkedin'
              });
            }
            if (creds.company_info) {
              creds.company_info.forEach(company => {
                allAccounts.push({
                  id: company.company_id,
                  name: company.company_name,
                  avatar: company.company_logo,
                  type: 'company',
                  platform: 'linkedin'
                });
              });
            }
          }

          // --- FACEBOOK ---
          if (platformName === "facebook") {
            const creds = credentials as unknown as FacebookCredentials;
            // Personal account
            if (creds.personal_info) {
              allAccounts.push({
                id: creds.personal_info.user_id,
                name: creds.personal_info.name,
                avatar: creds.personal_info.avatar_url,
                type: 'personal',
                platform: 'facebook'
              });
            }
            // Pages array (new format)
            if (Array.isArray(creds.pages)) {
              creds.pages.forEach(page => {
                allAccounts.push({
                  id: page.page_id,
                  name: page.page_name,
                  avatar: page.avatar_url || null,
                  type: 'page',
                  platform: 'facebook'
                });
              });
            }
            // Legacy single page format
            else if (creds.page_id) {
              allAccounts.push({
                id: creds.page_id,
                name: creds.page_name || "Facebook Page",
                avatar: creds.page_info?.avatar_url || null,
                type: 'page',
                platform: 'facebook'
              });
            }
          }

          // --- INSTAGRAM ---
          if (platformName === "instagram") {
            const creds = credentials as unknown as InstagramCredentials;
            // Accounts array - use ig_id as the account identifier
            if (Array.isArray(creds.accounts)) {
              creds.accounts.forEach(account => {
                allAccounts.push({
                  id: account.ig_id,
                  name: account.account_name || `@${account.ig_username}`,
                  avatar: account.avatar_url || null,
                  type: 'personal',
                  platform: 'instagram'
                });
              });
            }
            // Legacy single account format
            else if (creds.ig_business_id) {
              allAccounts.push({
                id: creds.ig_business_id,
                name: `@${creds.ig_username}`,
                avatar: creds.ig_avatar || null,
                type: 'personal',
                platform: 'instagram'
              });
            }
          }

          // --- YOUTUBE ---
          if (platformName === "youtube") {
            const creds = credentials as unknown as YouTubeCredentials;
            // Personal account
            if (creds.personal_info) {
              allAccounts.push({
                id: creds.personal_info.user_id || creds.personal_info.channel_id || 'yt-personal',
                name: creds.personal_info.name || creds.personal_info.channel_name || 'YouTube Account',
                avatar: creds.personal_info.avatar_url || null,
                type: 'personal',
                platform: 'youtube'
              });
            }
            // Channels array
            if (Array.isArray(creds.channels)) {
              creds.channels.forEach(channel => {
                allAccounts.push({
                  id: channel.channel_id,
                  name: channel.channel_name,
                  avatar: channel.avatar_url || null,
                  type: 'channel',
                  platform: 'youtube'
                });
              });
            }
            // Legacy format - just tokens stored
            if (!creds.personal_info && !creds.channels && (creds.accessToken || creds.clientId)) {
              allAccounts.push({
                id: creds.clientId || 'youtube-legacy',
                name: 'YouTube Account',
                avatar: null,
                type: 'channel',
                platform: 'youtube'
              });
            }
          }

          // --- TWITTER ---
          if (platformName === "twitter") {
            const creds = credentials as unknown as TwitterCredentials;
            if (creds.personal_info) {
              allAccounts.push({
                id: creds.personal_info.user_id,
                name: creds.personal_info.name || `@${creds.personal_info.username}`,
                avatar: creds.personal_info.avatar_url || null,
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
