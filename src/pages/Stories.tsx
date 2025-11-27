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

interface Story {
  id: string;
  title: string;
  description: string;
  status: string;
  scheduled_at: string | null;
  type_of_story: string | null;
  platforms: string[] | null;
  text: string | null;
  image: string | null;
  video: string | null;
  created_at: string;
}

export default function Stories() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchStories();
  }, [user]);

  const fetchStories = async () => {
    const { data, error } = await supabase
      .from("stories")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load stories");
    } else {
      setStories(data || []);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke('delete-story', {
        body: { story_id: id, user_id: user!.id }
      });

      if (error) {
        toast.error("Failed to delete story");
      } else {
        toast.success("Story deleted");
        fetchStories();
      }
    } catch (error) {
      toast.error("Failed to delete story");
      console.error('Error deleting story:', error);
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
            <h1 className="text-3xl font-bold">Stories</h1>
            <p className="text-muted-foreground">Manage your social media stories</p>
          </div>
          <Button onClick={() => navigate("/stories/create")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Story
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : stories.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No stories yet. Create your first story!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {stories.map((story) => (
              <Card key={story.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">
                      {story.type_of_story ? story.type_of_story.charAt(0).toUpperCase() + story.type_of_story.slice(1) : "Story"}
                    </CardTitle>
                    <Badge className={getStatusColor(story.status)}>
                      {story.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {story.type_of_story && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold">Type:</span> {story.type_of_story}
                    </p>
                  )}
                  {story.platforms && story.platforms.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold">Platforms:</span> {story.platforms.join(", ")}
                    </p>
                  )}
                  {story.text && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {story.text}
                    </p>
                  )}
                  {(story.image || story.video) && (
                    <div className="mt-2">
                      {story.image && (
                        <img 
                          src={story.image} 
                          alt="Story preview" 
                          className="w-full h-32 object-cover rounded"
                        />
                      )}
                      {story.video && (
                        <video 
                          src={story.video} 
                          className="w-full h-32 object-cover rounded"
                        />
                      )}
                    </div>
                  )}
                  {story.scheduled_at && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold">Scheduled:</span> {format(new Date(story.scheduled_at), "PPp")}
                    </p>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/stories/${story.id}/edit`)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(story.id)}
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
