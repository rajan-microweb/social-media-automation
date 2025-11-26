import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { z } from "zod";
import { AiPromptModal } from "@/components/AiPromptModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PLATFORM_MAP: Record<string, string[]> = {
  image: ["Facebook", "Instagram"],
  video: ["Facebook", "Instagram"],
};

const storySchema = z.object({
  type_of_story: z.string().min(1, "Type of story is required"),
  platforms: z.array(z.string()).min(1, "At least one platform is required"),
  text: z.string().optional(),
  image: z.string().url().optional().or(z.literal("")),
  video: z.string().url().optional().or(z.literal("")),
  scheduled_at: z.string().optional(),
});

export default function EditStory() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fetchingStory, setFetchingStory] = useState(true);

  const [typeOfStory, setTypeOfStory] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [existingMediaUrl, setExistingMediaUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);

  // AI Modal state
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalField, setAiModalField] = useState<"text" | "image" | "video">("text");
  const [aiModalTarget, setAiModalTarget] = useState<string>("");

  // AI-generated URLs
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  
  // Platform connection state
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [showConnectionAlert, setShowConnectionAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertPlatform, setAlertPlatform] = useState("");

  // Fetch connected platforms on mount
  useEffect(() => {
    const fetchConnectedPlatforms = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from("platform_integrations")
        .select("platform_name")
        .eq("user_id", user.id);
      
      if (data) {
        const platforms = data.map(p => p.platform_name);
        setConnectedPlatforms(platforms);
      }
    };
    
    fetchConnectedPlatforms();
  }, [user]);

  useEffect(() => {
    if (id && user) {
      fetchStory();
    }
  }, [id, user]);

  const fetchStory = async () => {
    try {
      const { data, error } = await supabase
        .from("stories")
        .select("*")
        .eq("id", id)
        .eq("user_id", user!.id)
        .single();

      if (error) throw error;

      if (data) {
        setTypeOfStory(data.type_of_story || "");
        setPlatforms(data.platforms || []);
        setText(data.text || "");
        if (data.image) setExistingMediaUrl(data.image);
        if (data.video) setExistingMediaUrl(data.video);
        setScheduledAt(data.scheduled_at ? new Date(data.scheduled_at).toISOString().slice(0, 16) : "");
      }
    } catch (error: any) {
      console.error("Error fetching story:", error);
      toast.error("Failed to load story");
      navigate("/stories");
    } finally {
      setFetchingStory(false);
    }
  };

  useEffect(() => {
    if (typeOfStory) {
      const newPlatforms = PLATFORM_MAP[typeOfStory] || [];
      setAvailablePlatforms(newPlatforms);
    }
  }, [typeOfStory]);

  const handlePlatformChange = (platform: string, checked: boolean) => {
    // Check if platform is connected before allowing selection (case-insensitive)
    const isConnected = connectedPlatforms.some(p => p.toLowerCase() === platform.toLowerCase());
    
    if (checked && !isConnected) {
      setAlertMessage(`Please connect your ${platform} account first to select this platform.`);
      setAlertPlatform(platform);
      setShowConnectionAlert(true);
      return;
    }
    
    setPlatforms(prev =>
      checked ? [...prev, platform] : prev.filter(p => p !== platform)
    );
  };

  const openAiModal = (field: "text" | "image" | "video", target: string) => {
    setAiModalField(field);
    setAiModalTarget(target);
    setAiModalOpen(true);
  };

  const handleAiGenerate = async (content: string) => {
    if (aiModalTarget === "textContent") {
      setText(content);
    } else if (aiModalTarget === "media") {
      if (typeOfStory === "image") {
        setImageUrl(content);
      } else if (typeOfStory === "video") {
        setVideoUrl(content);
      }
      setMediaFile(null);
      toast.success("AI-generated media URL loaded");
    }
  };

  const uploadFile = async (file: File, folder: string): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('post-media')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('post-media')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let uploadedImageUrl = existingMediaUrl;
      let uploadedVideoUrl = existingMediaUrl;

      // Priority: AI URLs > new file upload > existing media
      if (imageUrl || videoUrl) {
        if (typeOfStory === "image") {
          uploadedImageUrl = imageUrl;
        } else if (typeOfStory === "video") {
          uploadedVideoUrl = videoUrl;
        }
      } else if (mediaFile) {
        setUploading(true);
        const folder = typeOfStory === "video" ? "videos" : "images";
        const url = await uploadFile(mediaFile, folder);
        
        if (typeOfStory === "video") {
          uploadedVideoUrl = url;
        } else {
          uploadedImageUrl = url;
        }
        setUploading(false);
      }

      const storyData = {
        type_of_story: typeOfStory,
        platforms,
        text: text || undefined,
        image: typeOfStory === "image" ? uploadedImageUrl || "" : "",
        video: typeOfStory === "video" ? uploadedVideoUrl || "" : "",
        scheduled_at: scheduledAt || undefined,
        status: scheduledAt ? "scheduled" : "draft",
      };

      storySchema.parse(storyData);

      const { error } = await supabase
        .from("stories")
        .update({
          type_of_story: storyData.type_of_story,
          platforms: storyData.platforms,
          text: storyData.text ?? null,
          image: storyData.image || null,
          video: storyData.video || null,
          scheduled_at: storyData.scheduled_at ?? null,
          status: storyData.status,
        })
        .eq("id", id)
        .eq("user_id", user!.id);

      if (error) throw error;

      toast.success("Story updated successfully!");
      navigate("/stories");
    } catch (error: any) {
      console.error("Error updating story:", error);
      toast.error(error.message || "Failed to update story");
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  if (fetchingStory) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const showMediaUpload = typeOfStory && typeOfStory !== "";

  const getMediaLabel = () => {
    if (typeOfStory === "image") return "Upload Image";
    if (typeOfStory === "video") return "Upload Video";
    return "Upload Media";
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Edit Story</h1>
          <p className="text-muted-foreground">Update your social media story</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Story Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">

              <div className="space-y-2">
                <Label htmlFor="typeOfStory">Type of Story *</Label>
                <Select value={typeOfStory} onValueChange={setTypeOfStory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {availablePlatforms.length > 0 && (
                <div className="space-y-2">
                  <Label>Platforms *</Label>
                  <div className="flex flex-wrap gap-4">
                    {availablePlatforms.map((platform) => (
                      <div key={platform} className="flex items-center space-x-2">
                        <Checkbox
                          id={platform}
                          checked={platforms.includes(platform)}
                          onCheckedChange={(checked) =>
                            handlePlatformChange(platform, checked as boolean)
                          }
                        />
                        <Label htmlFor={platform} className="cursor-pointer">
                          {platform}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Text Content */}
              {typeOfStory && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="text">Text Content (Optional)</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openAiModal("text", "textContent")}
                      className="h-8 gap-1"
                    >
                      <Sparkles className="h-4 w-4" />
                      AI Generate
                    </Button>
                  </div>
                  <Textarea
                    id="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Write your story text..."
                    rows={4}
                    maxLength={2000}
                  />
                  <div className="text-xs text-muted-foreground text-right">
                    {text.length}/2000
                  </div>
                </div>
              )}

              {/* Media Upload */}
              {showMediaUpload && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="media">{getMediaLabel()}</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openAiModal(typeOfStory === "video" ? "video" : "image", "media")}
                      className="h-8 gap-1"
                    >
                      <Sparkles className="h-4 w-4" />
                      AI Generate
                    </Button>
                  </div>
                  <Input
                    id="media"
                    type="file"
                    onChange={(e) => {
                      setMediaFile(e.target.files?.[0] || null);
                      setImageUrl("");
                      setVideoUrl("");
                    }}
                    accept={typeOfStory === "video" ? "video/*" : "image/*"}
                  />
                  {mediaFile && (
                    <p className="text-sm text-muted-foreground">
                      Selected: {mediaFile.name}
                    </p>
                  )}
                  
                  {/* Media Preview */}
                  {(mediaFile || imageUrl || videoUrl || existingMediaUrl) && (
                    <div className="mt-3 p-3 border rounded-lg bg-muted/30">
                      <p className="text-sm font-medium mb-2">Preview:</p>
                      
                      {typeOfStory === "image" && (
                        <>
                          {mediaFile && (
                            <img 
                              src={URL.createObjectURL(mediaFile)} 
                              alt="Preview" 
                              className="max-h-48 rounded-md object-contain"
                            />
                          )}
                          {imageUrl && (
                            <img 
                              src={imageUrl} 
                              alt="AI Generated Preview" 
                              className="max-h-48 rounded-md object-contain"
                            />
                          )}
                          {!mediaFile && !imageUrl && existingMediaUrl && (
                            <img 
                              src={existingMediaUrl} 
                              alt="Current Media" 
                              className="max-h-48 rounded-md object-contain"
                            />
                          )}
                        </>
                      )}
                      
                      {typeOfStory === "video" && (
                        <>
                          {mediaFile && (
                            <video 
                              src={URL.createObjectURL(mediaFile)} 
                              controls 
                              className="max-h-48 rounded-md"
                            />
                          )}
                          {videoUrl && (
                            <video 
                              src={videoUrl} 
                              controls 
                              className="max-h-48 rounded-md"
                            />
                          )}
                          {!mediaFile && !videoUrl && existingMediaUrl && (
                            <video 
                              src={existingMediaUrl} 
                              controls 
                              className="max-h-48 rounded-md"
                            />
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="scheduledAt">Schedule Date & Time</Label>
                <Input
                  id="scheduledAt"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>

              <div className="flex gap-4">
                <Button
                  type="submit"
                  disabled={loading || uploading}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {uploading ? "Uploading..." : "Updating..."}
                    </>
                  ) : (
                    "Update Story"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/stories")}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <AiPromptModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        fieldType={aiModalField}
        onGenerate={handleAiGenerate}
      />
      
      <AlertDialog open={showConnectionAlert} onOpenChange={setShowConnectionAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Account Connection Required</AlertDialogTitle>
            <AlertDialogDescription>
              {alertMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => navigate("/accounts")}>
              Go to Accounts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
