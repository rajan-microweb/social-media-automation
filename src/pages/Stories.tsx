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
  const [bulkLoading, setBulkLoading] = useState(false);

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

  // Filtered and sorted stories
  const filteredStories = useMemo(() => {
    let result = [...stories];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          s.title?.toLowerCase().includes(term) ||
          s.text?.toLowerCase().includes(term) ||
          s.description?.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter) {
      result = result.filter((s) => s.status === statusFilter);
    }

    // Platform filter
    if (platformFilter.length > 0) {
      result = result.filter((s) =>
        s.platforms?.some((platform) => platformFilter.includes(platform))
      );
    }

    // Date range filter
    if (dateRange?.from) {
      result = result.filter((s) => {
        const storyDate = new Date(s.created_at);
        if (dateRange.to) {
          return storyDate >= dateRange.from! && storyDate <= dateRange.to;
        }
        return storyDate >= dateRange.from!;
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
  }, [stories, searchTerm, statusFilter, platformFilter, dateRange, sortBy, sortOrder]);

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
    setSelectedIds(new Set(filteredStories.map((s) => s.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    setBulkLoading(true);
    try {
      const { error } = await supabase.functions.invoke("bulk-delete-stories", {
        body: { story_ids: Array.from(selectedIds) },
      });

      if (error) throw error;
      toast.success(`Deleted ${selectedIds.size} stories`);
      clearSelection();
      fetchStories();
    } catch (error) {
      toast.error("Failed to delete stories");
      console.error(error);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    setBulkLoading(true);
    try {
      const { error } = await supabase.functions.invoke("bulk-update-stories", {
        body: { story_ids: Array.from(selectedIds), updates: { status } },
      });

      if (error) throw error;
      toast.success(`Updated ${selectedIds.size} stories to ${status}`);
      clearSelection();
      fetchStories();
    } catch (error) {
      toast.error("Failed to update stories");
      console.error(error);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkSchedule = async (date: Date) => {
    setBulkLoading(true);
    try {
      const { error } = await supabase.functions.invoke("bulk-update-stories", {
        body: {
          story_ids: Array.from(selectedIds),
          updates: {
            status: "scheduled",
            scheduled_at: date.toISOString(),
          },
        },
      });

      if (error) throw error;
      toast.success(`Scheduled ${selectedIds.size} stories`);
      clearSelection();
      fetchStories();
    } catch (error) {
      toast.error("Failed to schedule stories");
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
            <h1 className="text-3xl font-bold">Stories</h1>
            <p className="text-muted-foreground">Manage your social media stories</p>
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
            <Button onClick={() => navigate("/stories/create")}>
              <Plus className="mr-2 h-4 w-4" />
              Create Story
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
            totalCount={filteredStories.length}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onBulkDelete={handleBulkDelete}
            onBulkStatusChange={handleBulkStatusChange}
            onBulkSchedule={handleBulkSchedule}
            isLoading={bulkLoading}
          />
        )}

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : filteredStories.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                {stories.length === 0
                  ? "No stories yet. Create your first story!"
                  : "No stories match your filters."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredStories.map((story) => (
              <Card
                key={story.id}
                className={`relative transition-all ${
                  selectedIds.has(story.id)
                    ? "ring-2 ring-primary"
                    : "hover:shadow-md"
                }`}
              >
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedIds.has(story.id)}
                      onCheckedChange={() => toggleSelection(story.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 flex items-start justify-between">
                      <CardTitle className="text-lg">
                        {story.type_of_story ? story.type_of_story.charAt(0).toUpperCase() + story.type_of_story.slice(1) : "Story"}
                      </CardTitle>
                      <Badge className={getStatusColor(story.status)}>
                        {story.status}
                      </Badge>
                    </div>
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
