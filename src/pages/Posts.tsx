import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Post {
  id: string;
  title: string;
  description: string;
  status: string;
  scheduled_at: string | null;
  type_of_post: string | null;
  platforms: string[] | null;
  account_type: string | null;
  text: string | null;
  image: string | null;
  video: string | null;
  pdf: string | null;
  url: string | null;
  tags: string[] | null;
  created_at: string;
}

export default function Posts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchPosts();
  }, [user]);

  const fetchPosts = async () => {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load posts");
    } else {
      setPosts(data || []);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke('delete-post', {
        body: { post_id: id, user_id: user!.id }
      });

      if (error) {
        toast.error("Failed to delete post");
      } else {
        toast.success("Post deleted");
        fetchPosts();
      }
    } catch (error) {
      toast.error("Failed to delete post");
      console.error('Error deleting post:', error);
    }
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Posts</h1>
            <p className="text-muted-foreground">Manage your social media posts</p>
          </div>
          <Button onClick={() => navigate("/posts/create")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Post
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : posts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No posts yet. Create your first post!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Card key={post.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{post.title || "Untitled"}</CardTitle>
                    <Badge className={getStatusColor(post.status)}>
                      {post.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {post.type_of_post && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold">Type:</span> {post.type_of_post}
                    </p>
                  )}
                  {post.platforms && post.platforms.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold">Platforms:</span> {post.platforms.join(", ")}
                    </p>
                  )}
                  {post.text && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {post.text}
                    </p>
                  )}
                  {post.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {post.description}
                    </p>
                  )}
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {post.tags.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {post.scheduled_at && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold">Scheduled:</span> {format(new Date(post.scheduled_at), "PPp")}
                    </p>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/posts/${post.id}/edit`)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(post.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
