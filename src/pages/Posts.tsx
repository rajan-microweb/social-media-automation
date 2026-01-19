import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { FilterBar } from "@/components/posts/FilterBar";
import { BulkActionToolbar } from "@/components/posts/BulkActionToolbar";
import { SortDropdown, SortField, SortOrder } from "@/components/posts/SortDropdown";
import { PlatformActivityFeed } from "@/components/posts/PlatformActivityFeed";
import { usePlatformActivity } from "@/hooks/usePlatformActivity";

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
  const [bulkLoading, setBulkLoading] = useState(false);

  // Platform activity hook
  const { activities: platformActivities, loading: platformActivityLoading, refresh: refreshPlatformActivity } = usePlatformActivity(user?.id);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  // Sort state
  const [sortBy, setSortBy] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

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
      const { error } = await supabase
        .from("posts")
        .delete()
        .eq("id", id)
        .eq("user_id", user!.id);

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

  // Filtered and sorted posts
  const filteredPosts = useMemo(() => {
    let result = [...posts];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (p) =>
          p.title?.toLowerCase().includes(term) ||
          p.text?.toLowerCase().includes(term) ||
          p.description?.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter) {
      result = result.filter((p) => p.status === statusFilter);
    }

    // Platform filter
    if (platformFilter.length > 0) {
      result = result.filter((p) =>
        p.platforms?.some((platform) => platformFilter.includes(platform))
      );
    }

    // Date range filter
    if (dateRange?.from) {
      result = result.filter((p) => {
        const postDate = new Date(p.created_at);
        if (dateRange.to) {
          return postDate >= dateRange.from! && postDate <= dateRange.to;
        }
        return postDate >= dateRange.from!;
      });
    }

    // Sorting
    result.sort((a, b) => {
      let aVal: string | null = null;
      let bVal: string | null = null;

      switch (sortBy) {
        case "created_at":
          aVal = a.created_at;
          bVal = b.created_at;
          break;
        case "scheduled_at":
          aVal = a.scheduled_at;
          bVal = b.scheduled_at;
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "title":
          aVal = a.title;
          bVal = b.title;
          break;
      }

      if (!aVal && !bVal) return 0;
      if (!aVal) return sortOrder === "asc" ? 1 : -1;
      if (!bVal) return sortOrder === "asc" ? -1 : 1;

      const comparison = aVal.localeCompare(bVal);
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [posts, searchTerm, statusFilter, platformFilter, dateRange, sortBy, sortOrder]);

  // Selection handlers
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredPosts.map((p) => p.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    setBulkLoading(true);
    try {
      const { error } = await supabase.functions.invoke("bulk-delete-posts", {
        body: { post_ids: Array.from(selectedIds) },
      });

      if (error) throw error;
      toast.success(`Deleted ${selectedIds.size} posts`);
      clearSelection();
      fetchPosts();
    } catch (error) {
      toast.error("Failed to delete posts");
      console.error(error);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    setBulkLoading(true);
    try {
      const { error } = await supabase.functions.invoke("bulk-update-posts", {
        body: { post_ids: Array.from(selectedIds), updates: { status } },
      });

      if (error) throw error;
      toast.success(`Updated ${selectedIds.size} posts to ${status}`);
      clearSelection();
      fetchPosts();
    } catch (error) {
      toast.error("Failed to update posts");
      console.error(error);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkSchedule = async (date: Date) => {
    setBulkLoading(true);
    try {
      const { error } = await supabase.functions.invoke("bulk-update-posts", {
        body: {
          post_ids: Array.from(selectedIds),
          updates: {
            status: "scheduled",
            scheduled_at: date.toISOString(),
          },
        },
      });

      if (error) throw error;
      toast.success(`Scheduled ${selectedIds.size} posts`);
      clearSelection();
      fetchPosts();
    } catch (error) {
      toast.error("Failed to schedule posts");
      console.error(error);
    } finally {
      setBulkLoading(false);
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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Posts</h1>
            <p className="text-muted-foreground">Manage your social media posts</p>
          </div>
          <div className="flex items-center gap-2">
            <SortDropdown
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={(field, order) => {
                setSortBy(field);
                setSortOrder(order);
              }}
            />
            <Button onClick={() => navigate("/posts/create")}>
              <Plus className="mr-2 h-4 w-4" />
              Create Post
            </Button>
          </div>
        </div>

        <FilterBar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          platformFilter={platformFilter}
          onPlatformChange={setPlatformFilter}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />

        {selectedIds.size > 0 && (
          <BulkActionToolbar
            selectedCount={selectedIds.size}
            totalCount={filteredPosts.length}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onBulkDelete={handleBulkDelete}
            onBulkStatusChange={handleBulkStatusChange}
            onBulkSchedule={handleBulkSchedule}
            isLoading={bulkLoading}
          />
        )}

        <PlatformActivityFeed 
          items={platformActivities} 
          loading={platformActivityLoading} 
          onRefresh={refreshPlatformActivity}
        />

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : filteredPosts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                {posts.length === 0
                  ? "No posts yet. Create your first post!"
                  : "No posts match your filters."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredPosts.map((post) => (
              <Card
                key={post.id}
                className={`relative transition-all ${
                  selectedIds.has(post.id)
                    ? "ring-2 ring-primary"
                    : "hover:shadow-md"
                }`}
              >
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedIds.has(post.id)}
                      onCheckedChange={() => toggleSelection(post.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 flex items-start justify-between">
                      <CardTitle className="text-lg">{post.title || "Untitled"}</CardTitle>
                      <Badge className={getStatusColor(post.status)}>
                        {post.status}
                      </Badge>
                    </div>
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
