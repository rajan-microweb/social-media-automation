import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export default function CreatePost() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [typeOfPost, setTypeOfPost] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [linkedInAccountTypes, setLinkedInAccountTypes] = useState<string[]>([]);
  const [textContent, setTextContent] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeDescription, setYoutubeDescription] = useState("");
  const [igTags, setIgTags] = useState("");
  const [fbTags, setFbTags] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaCaption, setMediaCaption] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [articleDescription, setArticleDescription] = useState("");
  const [articleUrl, setArticleUrl] = useState("");
  const [status, setStatus] = useState("draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [fileError, setFileError] = useState("");
  
  // AI Modal state
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiTargetField, setAiTargetField] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);

  // Character count
  const textContentMaxLength = 2000;
  const textContentCount = textContent.length;

  // Platform options based on post type
  const getPlatformOptions = () => {
    const typeValue = typeOfPost;
    
    if (typeValue === "onlyText") {
      return [
        { value: "instagram", label: "Instagram", icon: "📷" },
        { value: "facebook", label: "Facebook", icon: "📘" },
        { value: "linkedin", label: "LinkedIn", icon: "💼" },
        { value: "twitter", label: "Twitter", icon: "🐦" },
      ];
    } else if (typeValue === "article") {
      return [
        { value: "linkedin", label: "LinkedIn", icon: "💼" },
        { value: "facebook", label: "Facebook", icon: "📘" },
      ];
    } else if (typeValue === "pdf") {
      return [
        { value: "linkedin", label: "LinkedIn", icon: "💼" },
      ];
    } else if (typeValue === "shorts") {
      return [
        { value: "instagram", label: "Instagram", icon: "📷" },
        { value: "facebook", label: "Facebook", icon: "📘" },
        { value: "youtube", label: "YouTube", icon: "📹" },
      ];
    } else {
      return [
        { value: "instagram", label: "Instagram", icon: "📷" },
        { value: "facebook", label: "Facebook", icon: "📘" },
        { value: "linkedin", label: "LinkedIn", icon: "💼" },
        { value: "youtube", label: "YouTube", icon: "📹" },
        { value: "twitter", label: "Twitter", icon: "🐦" },
      ];
    }
  };

  const platformOptions = getPlatformOptions();

  // Conditional visibility
  const showPlatforms = typeOfPost !== "";
  const showTextContent = typeOfPost !== "";
  const showMediaUpload = typeOfPost !== "" && typeOfPost !== "onlyText" && typeOfPost !== "article";
  const showMediaCaption = showMediaUpload && typeOfPost !== "pdf";
  const showArticleFields = typeOfPost === "article" || typeOfPost === "pdf";
  const showArticleUrl = typeOfPost === "article";
  const showYouTubeFields = platforms.includes("youtube") && (typeOfPost === "video" || typeOfPost === "shorts");
  const showInstagramFields = platforms.includes("instagram");
  const showFacebookFields = platforms.includes("facebook");
  const showLinkedInAccountType = platforms.includes("linkedin");
  const showReelNotice = typeOfPost === "video" && (platforms.includes("facebook") || platforms.includes("instagram"));

  // Reset fields when type changes
  useEffect(() => {
    setPlatforms([]);
    setLinkedInAccountTypes([]);
    setMediaFile(null);
    setFileError("");
  }, [typeOfPost]);

  // File validation
  const validateFile = (file: File | null) => {
    if (!file) return true;
    
    const typeValue = typeOfPost;
    let allowedTypes: string[] = [];
    let maxSize = 0;
    
    if (typeValue === "image") {
      allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      maxSize = 10 * 1024 * 1024; // 10MB
    } else if (typeValue === "carousel") {
      allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      maxSize = 10 * 1024 * 1024;
    } else if (typeValue === "video" || typeValue === "shorts") {
      allowedTypes = ["video/mp4", "video/mov", "video/webm"];
      maxSize = 100 * 1024 * 1024; // 100MB
    } else if (typeValue === "pdf") {
      allowedTypes = ["application/pdf"];
      maxSize = 10 * 1024 * 1024;
    }
    
    if (!allowedTypes.includes(file.type)) {
      setFileError(`Invalid file type. Allowed: ${allowedTypes.join(", ")}`);
      return false;
    }
    
    if (file.size > maxSize) {
      setFileError(`File too large. Max size: ${maxSize / (1024 * 1024)}MB`);
      return false;
    }
    
    setFileError("");
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setMediaFile(file);
    validateFile(file);
  };

  const handlePlatformChange = (platform: string, checked: boolean) => {
    setPlatforms(prev => 
      checked ? [...prev, platform] : prev.filter(p => p !== platform)
    );
  };

  const handleLinkedInAccountTypeChange = (type: string, checked: boolean) => {
    setLinkedInAccountTypes(prev =>
      checked ? [...prev, type] : prev.filter(t => t !== type)
    );
  };

  const openAiModal = (field: string) => {
    setAiTargetField(field);
    setAiModalOpen(true);
    setAiPrompt("");
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    setAiLoading(true);
    try {
      const response = await fetch("https://n8n.srv1044933.hstgr.cloud/webhook/ai-content-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textPrompt: aiPrompt }),
      });

      const data = await response.json();
      
      if (data.generatedText) {
        // Set the generated text to the target field
        if (aiTargetField === "textContent") setTextContent(data.generatedText);
        else if (aiTargetField === "youtubeDescription") setYoutubeDescription(data.generatedText);
        else if (aiTargetField === "mediaCaption") setMediaCaption(data.generatedText);
        
        toast.success("Content generated successfully");
        setAiModalOpen(false);
      } else {
        toast.error("Failed to generate content");
      }
    } catch (error) {
      console.error("AI generation error:", error);
      toast.error("Failed to generate content");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (platforms.length === 0) {
      toast.error("Please select at least one platform");
      return;
    }
    
    if (showMediaUpload && !mediaFile) {
      toast.error("Please upload media");
      return;
    }
    
    if (fileError) {
      toast.error("Please fix file errors");
      return;
    }
    
    setLoading(true);

    try {
      // Prepare title and description
      let title = "";
      let description = "";
      
      if (typeOfPost === "article" || typeOfPost === "pdf") {
        title = articleTitle;
        description = articleDescription;
      } else if (typeOfPost === "video" || typeOfPost === "shorts") {
        title = youtubeTitle || `${typeOfPost} Post`;
        description = youtubeDescription || textContent;
      } else {
        title = textContent?.substring(0, 100) || `${typeOfPost} Post`;
        description = textContent;
      }

      // Upload media if exists
      let mediaUrl = null;
      if (mediaFile) {
        const fileExt = mediaFile.name.split('.').pop();
        const fileName = `${user!.id}-${Date.now()}.${fileExt}`;
        
        const { error: uploadError, data: uploadData } = await supabase.storage
          .from('post-media')
          .upload(fileName, mediaFile);

        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('post-media')
          .getPublicUrl(fileName);
        
        mediaUrl = publicUrl;
      }

      // Insert post
      const { error } = await supabase.from("posts").insert({
        user_id: user!.id,
        title,
        description: description || null,
        media_url: mediaUrl,
        status,
        scheduled_at: scheduledAt || null,
      });

      if (error) throw error;

      toast.success("Post created successfully");
      navigate("/posts");
    } catch (error: any) {
      console.error("Error creating post:", error);
      toast.error(error.message || "Failed to create post");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Create Post</h1>
          <p className="text-muted-foreground">Create a new social media post</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Post Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Type of Post */}
              <div className="space-y-2">
                <Label htmlFor="typeOfPost">
                  Type of Post <span className="text-destructive">*</span>
                </Label>
                <Select value={typeOfPost} onValueChange={setTypeOfPost} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onlyText">Only Text</SelectItem>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="carousel">Carousel (Multiple Images)</SelectItem>
                    <SelectItem value="video">Video (landscape)</SelectItem>
                    <SelectItem value="shorts">Reels/Shorts (portrait)</SelectItem>
                    <SelectItem value="article">Article</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Platforms */}
              {showPlatforms && (
                <div className="space-y-3">
                  <Label>Platforms <span className="text-destructive">*</span></Label>
                  <div className="grid grid-cols-2 gap-3">
                    {platformOptions.map((platform) => (
                      <div key={platform.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={platform.value}
                          checked={platforms.includes(platform.value)}
                          onCheckedChange={(checked) => 
                            handlePlatformChange(platform.value, checked as boolean)
                          }
                        />
                        <Label htmlFor={platform.value} className="flex items-center gap-2 cursor-pointer">
                          <span>{platform.icon}</span>
                          <span>{platform.label}</span>
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* LinkedIn Account Type */}
              {showLinkedInAccountType && (
                <div className="space-y-3">
                  <Label>LinkedIn Account Type <span className="text-destructive">*</span></Label>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="li-personal"
                        checked={linkedInAccountTypes.includes("personal")}
                        onCheckedChange={(checked) => 
                          handleLinkedInAccountTypeChange("personal", checked as boolean)
                        }
                      />
                      <Label htmlFor="li-personal" className="cursor-pointer">Personal</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="li-company"
                        checked={linkedInAccountTypes.includes("company")}
                        onCheckedChange={(checked) => 
                          handleLinkedInAccountTypeChange("company", checked as boolean)
                        }
                      />
                      <Label htmlFor="li-company" className="cursor-pointer">Company</Label>
                    </div>
                  </div>
                </div>
              )}

              {/* Text Content */}
              {showTextContent && (
                <div className="space-y-2 relative">
                  <Label htmlFor="textContent">Text Content (Optional)</Label>
                  <div className="relative">
                    <Textarea
                      id="textContent"
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value.slice(0, textContentMaxLength))}
                      placeholder="Write your post text..."
                      rows={5}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2"
                      onClick={() => openAiModal("textContent")}
                    >
                      <Sparkles className="h-4 w-4 text-primary" />
                    </Button>
                    <div className="absolute right-2 bottom-2 text-xs text-muted-foreground">
                      {textContentCount}/{textContentMaxLength}
                    </div>
                  </div>
                </div>
              )}

              {/* Article Fields */}
              {showArticleFields && (
                <div className="space-y-4 p-4 border rounded-lg bg-accent/50">
                  <h3 className="font-semibold">Article Fields</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="articleTitle">
                      Article Title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="articleTitle"
                      value={articleTitle}
                      onChange={(e) => setArticleTitle(e.target.value)}
                      placeholder="Enter title..."
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="articleDescription">
                      Article Description <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="articleDescription"
                      value={articleDescription}
                      onChange={(e) => setArticleDescription(e.target.value)}
                      placeholder="Enter description..."
                      rows={3}
                      required
                    />
                  </div>

                  {showArticleUrl && (
                    <div className="space-y-2">
                      <Label htmlFor="articleUrl">
                        Article URL <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="articleUrl"
                        type="url"
                        value={articleUrl}
                        onChange={(e) => setArticleUrl(e.target.value)}
                        placeholder="https://..."
                        required
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Upload Media */}
              {showMediaUpload && (
                <div className="space-y-2 relative">
                  <Label htmlFor="mediaFile">
                    Upload Media <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="mediaFile"
                      type="file"
                      onChange={handleFileChange}
                      accept={
                        typeOfPost === "image" || typeOfPost === "carousel" 
                          ? "image/jpeg,image/jpg,image/png,image/webp"
                          : typeOfPost === "video" || typeOfPost === "shorts"
                          ? "video/mp4,video/mov,video/webm"
                          : typeOfPost === "pdf"
                          ? "application/pdf"
                          : "*"
                      }
                      className={fileError ? "border-destructive" : ""}
                    />
                    {(typeOfPost === "image" || typeOfPost === "video") && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1"
                        onClick={() => openAiModal("media")}
                      >
                        <Sparkles className="h-4 w-4 text-primary" />
                      </Button>
                    )}
                  </div>
                  {fileError && (
                    <p className="text-sm text-destructive">{fileError}</p>
                  )}
                  {showReelNotice && (
                    <p className="text-sm text-blue-600">
                      ( In Facebook and Instagram, Video will be posted as Reel )
                    </p>
                  )}
                </div>
              )}

              {/* Media Caption */}
              {showMediaCaption && (
                <div className="space-y-2 relative">
                  <Label htmlFor="mediaCaption">Media Caption (Optional)</Label>
                  <div className="relative">
                    <Textarea
                      id="mediaCaption"
                      value={mediaCaption}
                      onChange={(e) => setMediaCaption(e.target.value)}
                      placeholder="Add a caption for your media..."
                      rows={2}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2"
                      onClick={() => openAiModal("mediaCaption")}
                    >
                      <Sparkles className="h-4 w-4 text-primary" />
                    </Button>
                  </div>
                </div>
              )}

              {/* YouTube Fields */}
              {showYouTubeFields && (
                <div className="space-y-4 p-4 border rounded-lg bg-accent/50">
                  <h3 className="font-semibold">YouTube Fields</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="youtubeTitle">
                      Video Title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="youtubeTitle"
                      value={youtubeTitle}
                      onChange={(e) => setYoutubeTitle(e.target.value)}
                      placeholder="Enter video title..."
                    />
                  </div>

                  <div className="space-y-2 relative">
                    <Label htmlFor="youtubeDescription">
                      Video Description <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Textarea
                        id="youtubeDescription"
                        value={youtubeDescription}
                        onChange={(e) => setYoutubeDescription(e.target.value)}
                        placeholder="Enter video description..."
                        rows={3}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-2"
                        onClick={() => openAiModal("youtubeDescription")}
                      >
                        <Sparkles className="h-4 w-4 text-primary" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Instagram Fields */}
              {showInstagramFields && (
                <div className="space-y-2 p-4 border rounded-lg bg-accent/50">
                  <h3 className="font-semibold">Instagram Fields</h3>
                  <Label htmlFor="igTags">Instagram Tags</Label>
                  <Input
                    id="igTags"
                    value={igTags}
                    onChange={(e) => setIgTags(e.target.value)}
                    placeholder="Enter username to tag or mention..."
                  />
                </div>
              )}

              {/* Facebook Fields */}
              {showFacebookFields && (
                <div className="space-y-2 p-4 border rounded-lg bg-accent/50">
                  <h3 className="font-semibold">Facebook Fields</h3>
                  <Label htmlFor="fbTags">Facebook Tags</Label>
                  <Input
                    id="fbTags"
                    value={fbTags}
                    onChange={(e) => setFbTags(e.target.value)}
                    placeholder="Enter URLs of Facebook Profile to tag..."
                  />
                </div>
              )}

              {/* Status */}
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Schedule Date */}
              {status === "scheduled" && (
                <div className="space-y-2">
                  <Label htmlFor="scheduledAt">
                    Schedule Date & Time <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="scheduledAt"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    required
                  />
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? "Creating..." : "Submit"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/posts")}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* AI Modal */}
      <Dialog open={aiModalOpen} onOpenChange={setAiModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate with AI</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="aiPrompt">Enter your prompt</Label>
              <Textarea
                id="aiPrompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe what content you want to generate..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setAiModalOpen(false)} 
              disabled={aiLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleAiGenerate} disabled={aiLoading}>
              {aiLoading ? "Generating..." : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
