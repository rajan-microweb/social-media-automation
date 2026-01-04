import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, BookOpen, Linkedin, Facebook, Instagram, Youtube, Twitter } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface ActivityItem {
  id: string;
  title: string;
  type: "post" | "story";
  status: string;
  platforms: string[] | null;
  updated_at: string;
}

interface RecentActivityFeedProps {
  items: ActivityItem[];
  loading?: boolean;
}

const platformIcons: Record<string, React.ElementType> = {
  linkedin: Linkedin,
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
  twitter: Twitter,
  x: Twitter,
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "published":
      return "bg-chart-3";
    case "scheduled":
      return "bg-accent";
    default:
      return "bg-muted";
  }
};

export function RecentActivityFeed({ items, loading }: RecentActivityFeedProps) {
  const navigate = useNavigate();

  const handleClick = (item: ActivityItem) => {
    if (item.type === "post") {
      navigate(`/posts/${item.id}/edit`);
    } else {
      navigate(`/stories/${item.id}/edit`);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div
            key={`${item.type}-${item.id}`}
            onClick={() => handleClick(item)}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
          >
            {/* Type Icon */}
            <div className="flex-shrink-0">
              {item.type === "post" ? (
                <FileText className="h-4 w-4 text-muted-foreground" />
              ) : (
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              )}
            </div>

            {/* Title */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.title || "Untitled"}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
              </p>
            </div>

            {/* Platform Icons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {item.platforms?.slice(0, 3).map((platform) => {
                const Icon = platformIcons[platform.toLowerCase()];
                return Icon ? (
                  <Icon key={platform} className="h-3.5 w-3.5 text-muted-foreground" />
                ) : null;
              })}
            </div>

            {/* Status Badge */}
            <Badge className={`${getStatusColor(item.status)} text-xs flex-shrink-0`}>
              {item.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
