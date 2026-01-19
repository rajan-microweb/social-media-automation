import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PlatformActivityItem {
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

export function usePlatformActivity(userId: string | undefined) {
  const [activities, setActivities] = useState<PlatformActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setActivities([]);
      return;
    }

    const fetchActivity = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke("get-platform-activity");

        if (fnError) {
          throw fnError;
        }

        setActivities(data?.activities || []);
      } catch (err) {
        console.error("Failed to fetch platform activity:", err);
        setError("Failed to load platform activity");
        // Don't show toast for auth errors since user might not have connected platforms
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
  }, [userId]);

  const refresh = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("get-platform-activity");

      if (fnError) throw fnError;
      setActivities(data?.activities || []);
    } catch (err) {
      console.error("Failed to refresh platform activity:", err);
      toast.error("Failed to refresh activity");
    } finally {
      setLoading(false);
    }
  };

  return { activities, loading, error, refresh };
}
