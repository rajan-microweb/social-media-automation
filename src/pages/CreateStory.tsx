import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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

export default function CreateStory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [typeOfStory, setTypeOfStory] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
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
    if (typeOfStory) {
      const newPlatforms = PLATFORM_MAP[typeOfStory] || [];
      setAvailablePlatforms(newPlatforms);
      setPlatforms([]);
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
    
    // Check if any platform is connected
    if (connectedPlatforms.length === 0) {
      setAlertMessage("Please connect at least one social media account before creating a story.");
      setAlertPlatform("");
      setShowConnectionAlert(true);
      return;
    }
    
    setLoading(true);

    try {
      let uploadedImageUrl = "";
      let uploadedVideoUrl = "";

      // Priority: AI URLs over file uploads
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
        image: uploadedImageUrl || "",
        video: uploadedVideoUrl || "",
        scheduled_at: scheduledAt || undefined,
        status: scheduledAt ? "scheduled" : "draft",
      };

      storySchema.parse(storyData);

      const { error } = await supabase.from("stories").insert({
        user_id: user!.id,
        title: "",
        type_of_story: storyData.type_of_story,
        platforms: storyData.platforms,
        text: storyData.text ?? null,
        image: storyData.image || null,
        video: storyData.video || null,
        scheduled_at: storyData.scheduled_at ?? null,
        status: storyData.status,
      });

      if (error) throw error;

      toast.success("Story created successfully!");
      navigate("/stories");
    } catch (error: any) {
      console.error("Error creating story:", error);
      toast.error(error.message || "Failed to create story");
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

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
          <h1 className="text-3xl font-bold">Create Story</h1>
          <p className="text-muted-foreground">Create a new social media story</p>
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
                  <div className="flex flex-wrap gap-3">
                    {availablePlatforms.map((platform) => {
                      const isSelected = platforms.includes(platform);
                      const platformLower = platform.toLowerCase();
                      
                      const getPlatformIcon = () => {
                        switch (platformLower) {
                          case 'facebook':
                            return (
                              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#1877F2">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                              </svg>
                            );
                          case 'instagram':
                            return (
                              <svg viewBox="0 0 24 24" className="w-8 h-8">
                                <defs>
                                  <linearGradient id="ig-gradient-create-story" x1="0%" y1="100%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#FFDC80"/>
                                    <stop offset="10%" stopColor="#FCAF45"/>
                                    <stop offset="30%" stopColor="#F77737"/>
                                    <stop offset="60%" stopColor="#C13584"/>
                                    <stop offset="100%" stopColor="#833AB4"/>
                                  </linearGradient>
                                </defs>
                                <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#ig-gradient-create-story)"/>
                                <circle cx="12" cy="12" r="4" fill="none" stroke="white" strokeWidth="1.5"/>
                                <circle cx="17.5" cy="6.5" r="1.5" fill="white"/>
                              </svg>
                            );
                          default:
                            return null;
                        }
                      };

                      return (
                        <button
                          key={platform}
                          type="button"
                          onClick={() => handlePlatformChange(platform, !isSelected)}
                          className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all min-w-[100px] ${
                            isSelected
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-border hover:border-muted-foreground/50 bg-card'
                          }`}
                        >
                          {getPlatformIcon()}
                          <span className="mt-2 text-sm font-medium text-foreground">{platform}</span>
                        </button>
                      );
                    })}
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
                    <Label htmlFor="media">
                      {getMediaLabel()} <span className="text-destructive">*</span>
                    </Label>
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
                    required={showMediaUpload && !imageUrl && !videoUrl}
                  />
                  {mediaFile && (
                    <p className="text-sm text-muted-foreground">
                      Selected: {mediaFile.name}
                    </p>
                  )}
                  
                  {/* Media Preview */}
                  {(mediaFile || imageUrl || videoUrl) && (
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
                      {uploading ? "Uploading..." : "Creating..."}
                    </>
                  ) : (
                    "Create Story"
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
