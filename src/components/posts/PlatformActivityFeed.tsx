import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Linkedin,
  Facebook,
  Instagram,
  Youtube,
  Twitter,
  ExternalLink,
  Heart,
  MessageCircle,
  Share2,
  RefreshCw,
  Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PlatformActivityItem } from "@/hooks/usePlatformActivity";

interface PlatformActivityFeedProps {
  items: PlatformActivityItem[];
  loading?: boolean;
  onRefresh?: () => void;
}

const platformConfig: Record<
  string,
  { icon: React.ElementType; color: string; bgColor: string }
> = {
  linkedin: { icon: Linkedin, color: "text-[#0A66C2]", bgColor: "bg-[#0A66C2]/10" },
  facebook: { icon: Facebook, color: "text-[#1877F2]", bgColor: "bg-[#1877F2]/10" },
  instagram: { icon: Instagram, color: "text-[#E4405F]", bgColor: "bg-[#E4405F]/10" },
  youtube: { icon: Youtube, color: "text-[#FF0000]", bgColor: "bg-[#FF0000]/10" },
  twitter: { icon: Twitter, color: "text-[#1DA1F2]", bgColor: "bg-[#1DA1F2]/10" },
};

export function PlatformActivityFeed({
  items,
  loading,
  onRefresh,
}: PlatformActivityFeedProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Platform Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Platform Activity
          </CardTitle>
          {onRefresh && (
            <Button variant="ghost" size="sm" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No recent activity from connected platforms
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const config = platformConfig[item.platform] || platformConfig.twitter;
              const PlatformIcon = config.icon;

              return (
                <div
                  key={`${item.platform}-${item.id}`}
                  className="flex gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  {/* Platform Icon */}
                  <div className={`p-2 rounded-full ${config.bgColor} shrink-0`}>
                    <PlatformIcon className={`h-5 w-5 ${config.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{item.accountName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.publishedAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                      {item.permalink && (
                        <a
                          href={item.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>

                    {/* Media thumbnail */}
                    {item.mediaUrl && (
                      <div className="mt-2">
                        <img
                          src={item.mediaUrl}
                          alt=""
                          className="rounded-md max-h-24 object-cover"
                        />
                      </div>
                    )}

                    {/* Text content */}
                    {item.content && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {item.content}
                      </p>
                    )}

                    {/* Engagement stats */}
                    {item.engagement && (
                      <div className="flex items-center gap-4 mt-2">
                        {item.engagement.likes !== undefined && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Heart className="h-3 w-3" />
                            {item.engagement.likes}
                          </span>
                        )}
                        {item.engagement.comments !== undefined && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MessageCircle className="h-3 w-3" />
                            {item.engagement.comments}
                          </span>
                        )}
                        {item.engagement.shares !== undefined && item.engagement.shares > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Share2 className="h-3 w-3" />
                            {item.engagement.shares}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
