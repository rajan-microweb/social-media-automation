import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { 
  FileText, 
  Calendar, 
  CheckCircle2, 
  PlusCircle, 
  Users, 
  Link2, 
  User,
  BookOpen,
  Sparkles,
  ArrowRight
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

interface Stats {
  totalPosts: number;
  scheduledPosts: number;
  publishedPosts: number;
  totalStories: number;
  scheduledStories: number;
  publishedStories: number;
}

interface QuickAction {
  title: string;
  description: string;
  icon: React.ElementType;
  path: string;
  gradient: string;
  adminOnly?: boolean;
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalPosts: 0,
    scheduledPosts: 0,
    publishedPosts: 0,
    totalStories: 0,
    scheduledStories: 0,
    publishedStories: 0,
  });

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      const [postsRes, storiesRes] = await Promise.all([
        supabase.from("posts").select("status").eq("user_id", user.id),
        supabase.from("stories").select("status").eq("user_id", user.id),
      ]);

      const posts = postsRes.data || [];
      const stories = storiesRes.data || [];

      setStats({
        totalPosts: posts.length,
        scheduledPosts: posts.filter((p) => p.status === "scheduled").length,
        publishedPosts: posts.filter((p) => p.status === "published").length,
        totalStories: stories.length,
        scheduledStories: stories.filter((s) => s.status === "scheduled").length,
        publishedStories: stories.filter((s) => s.status === "published").length,
      });
    };

    fetchStats();
  }, [user]);

  const statCards = [
    {
      title: "Total Posts",
      value: stats.totalPosts,
      icon: FileText,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Scheduled Posts",
      value: stats.scheduledPosts,
      icon: Calendar,
      color: "text-chart-4",
      bgColor: "bg-chart-4/10",
    },
    {
      title: "Published Posts",
      value: stats.publishedPosts,
      icon: CheckCircle2,
      color: "text-chart-3",
      bgColor: "bg-chart-3/10",
    },
    {
      title: "Total Stories",
      value: stats.totalStories,
      icon: BookOpen,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      title: "Scheduled Stories",
      value: stats.scheduledStories,
      icon: Calendar,
      color: "text-chart-4",
      bgColor: "bg-chart-4/10",
    },
    {
      title: "Published Stories",
      value: stats.publishedStories,
      icon: CheckCircle2,
      color: "text-chart-3",
      bgColor: "bg-chart-3/10",
    },
  ];

  const quickActions: QuickAction[] = [
    {
      title: "Create Post",
      description: "Schedule a new social media post",
      icon: PlusCircle,
      path: "/posts/create",
      gradient: "from-primary to-accent",
    },
    {
      title: "Create Story",
      description: "Schedule a new story",
      icon: Sparkles,
      path: "/stories/create",
      gradient: "from-chart-3 to-chart-4",
    },
    {
      title: "My Posts",
      description: "View and manage all your posts",
      icon: FileText,
      path: "/posts",
      gradient: "from-accent to-primary",
    },
    {
      title: "My Stories",
      description: "View and manage all your stories",
      icon: BookOpen,
      path: "/stories",
      gradient: "from-chart-4 to-chart-3",
    },
    {
      title: "Connected Accounts",
      description: "Manage your social media accounts",
      icon: Link2,
      path: "/accounts",
      gradient: "from-chart-5 to-chart-4",
    },
    {
      title: "My Profile",
      description: "View and edit your profile",
      icon: User,
      path: "/profile",
      gradient: "from-muted-foreground to-foreground",
    },
    {
      title: "User Management",
      description: "Manage users and roles",
      icon: Users,
      path: "/admin/users",
      gradient: "from-chart-5 to-destructive",
      adminOnly: true,
    },
  ];

  const filteredActions = quickActions.filter(
    (action) => !action.adminOnly || isAdmin
  );

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back! Here's an overview of your content.
          </p>
        </div>

        {/* Stats Grid */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Overview</h2>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.title} className="border-none shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${card.bgColor}`}>
                        <Icon className={`h-4 w-4 ${card.color}`} />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{card.value}</p>
                        <p className="text-xs text-muted-foreground">{card.title}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredActions.map((action) => {
              const Icon = action.icon;
              return (
                <Card
                  key={action.title}
                  className="group cursor-pointer border-none shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden"
                  onClick={() => navigate(action.path)}
                >
                  <CardContent className="p-0">
                    <div className={`h-2 bg-gradient-to-r ${action.gradient}`} />
                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <div className={`p-3 rounded-xl bg-gradient-to-br ${action.gradient} text-primary-foreground`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform group-hover:translate-x-1" />
                      </div>
                      <h3 className="font-semibold mt-4 group-hover:text-primary transition-colors">
                        {action.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {action.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
