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
import { toast } from "sonner";
import { z } from "zod";

// Platform configuration based on post type
const PLATFORM_MAP: Record<string, string[]> = {
  onlyText: ["Facebook", "LinkedIn"],
  image: ["Facebook", "Instagram", "LinkedIn"],
  carousel: ["Facebook", "Instagram", "LinkedIn"],
  video: ["Facebook", "Instagram", "LinkedIn", "YouTube"],
  shorts: ["Facebook", "Instagram", "YouTube"],
  article: ["LinkedIn"],
  pdf: ["LinkedIn"],
};

const postSchema = z.object({
  type_of_post: z.string().min(1, "Type of post is required"),
  platforms: z.array(z.string()).min(1, "At least one platform is required"),
  account_type: z.string().optional(),
  text: z.string().max(5000).optional(),
  image: z.string().url().optional().or(z.literal("")),
  video: z.string().url().optional().or(z.literal("")),
  pdf: z.string().url().optional().or(z.literal("")),
  title: z.string().optional(),
  description: z.string().max(2000).optional(),
  url: z.string().url().optional().or(z.literal("")),
  tags: z.array(z.string()).optional(),
  status: z.enum(["draft", "scheduled", "published"]),
  scheduled_at: z.string().optional(),
});

export default function CreatePost() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [typeOfPost, setTypeOfPost] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [linkedinAccountType, setLinkedinAccountType] = useState<string[]>([]);
  const [textContent, setTextContent] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [articleDescription, setArticleDescription] = useState("");
  const [articleUrl, setArticleUrl] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeDescription, setYoutubeDescription] = useState("");
  const [instagramTags, setInstagramTags] = useState("");
  const [facebookTags, setFacebookTags] = useState("");
  const [status, setStatus] = useState("draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [uploading, setUploading] = useState(false);

  // Available platforms based on post type
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);

  // Reset form when type changes
  useEffect(() => {
    if (typeOfPost) {
      // Update available platforms
      setAvailablePlatforms(PLATFORM_MAP[typeOfPost] || []);
      // Reset selected platforms
      setPlatforms([]);
      setLinkedinAccountType([]);
      // Reset platform-specific fields
      setYoutubeTitle("");
      setYoutubeDescription("");
      setInstagramTags("");
      setFacebookTags("");
    } else {
      setAvailablePlatforms([]);
      setPlatforms([]);
    }
  }, [typeOfPost]);

  const handlePlatformChange = (platform: string, checked: boolean) => {
    if (checked) {
      setPlatforms([...platforms, platform.toLowerCase()]);
    } else {
      setPlatforms(platforms.filter((p) => p !== platform.toLowerCase()));
    }
  };

  const handleLinkedinAccountTypeChange = (type: string, checked: boolean) => {
    if (checked) {
      setLinkedinAccountType([...linkedinAccountType, type]);
    } else {
      setLinkedinAccountType(linkedinAccountType.filter((t) => t !== type));
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setUploading(true);

    try {
      // Upload file if present
      let uploadedUrl = null;
      if (mediaFile) {
        let folder = "";
        if (typeOfPost === "image" || typeOfPost === "carousel") {
          folder = "images";
        } else if (typeOfPost === "video" || typeOfPost === "shorts") {
          folder = "videos";
        } else if (typeOfPost === "pdf") {
          folder = "pdfs";
        }
        
        if (folder) {
          uploadedUrl = await uploadFile(mediaFile, folder);
        }
      }

      // Build account_type string
      let accountTypeValue = "";
      if (platforms.includes("linkedin") && linkedinAccountType.length > 0) {
        accountTypeValue = linkedinAccountType.join(",");
      }

      const data = {
        type_of_post: typeOfPost,
        platforms: platforms,
        account_type: accountTypeValue || undefined,
        text: textContent || undefined,
        image:
          typeOfPost === "image" || typeOfPost === "carousel"
            ? uploadedUrl || ""
            : "",
        video:
          typeOfPost === "video" || typeOfPost === "shorts"
            ? uploadedUrl || ""
            : "",
        pdf: typeOfPost === "pdf" ? uploadedUrl || "" : "",
        title: articleTitle || undefined,
        description: articleDescription || undefined,
        url: articleUrl || undefined,
        tags: [
          youtubeTitle ? `youtube_title:${youtubeTitle}` : "",
          youtubeDescription ? `youtube_description:${youtubeDescription}` : "",
          instagramTags ? `instagram_tags:${instagramTags}` : "",
          facebookTags ? `facebook_tags:${facebookTags}` : "",
        ].filter(Boolean),
        status: status,
        scheduled_at: scheduledAt || undefined,
      };

      postSchema.parse(data);

      const { error } = await supabase.from("posts").insert({
        user_id: user!.id,
        type_of_post: data.type_of_post,
        platforms: data.platforms,
        account_type: data.account_type ?? null,
        text: data.text ?? null,
        image: data.image || null,
        video: data.video || null,
        pdf: data.pdf || null,
        title: data.title ?? null,
        description: data.description ?? null,
        url: data.url || null,
        tags: data.tags.length > 0 ? data.tags : null,
        status: data.status,
        scheduled_at: data.scheduled_at ?? null,
      });

      if (error) throw error;

      toast.success("Post created successfully");
      navigate("/posts");
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error(error.message || "Failed to create post");
      }
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  // Field visibility logic
  const showTextContent = typeOfPost && typeOfPost !== "pdf";
  const showArticleFields = typeOfPost === "article";
  const showMediaUpload = typeOfPost && typeOfPost !== "onlyText" && typeOfPost !== "article";
  const showYoutubeFields = platforms.includes("youtube") && typeOfPost === "video";
  const showInstagramFields = platforms.includes("instagram");
  const showFacebookFields = platforms.includes("facebook");
  const showLinkedinAccountType = platforms.includes("linkedin");
  const showSchedule = typeOfPost !== "";

  // Media label based on type
  const getMediaLabel = () => {
    if (typeOfPost === "image") return "Upload Image";
    if (typeOfPost === "carousel") return "Upload Images (Multiple)";
    if (typeOfPost === "video") return "Upload Video (landscape)";
    if (typeOfPost === "shorts") return "Upload Video (portrait)";
    if (typeOfPost === "pdf") return "Upload PDF";
    return "Upload Media";
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
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
              {/* Type of Post - Always visible */}
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

              {/* Platforms - Show when type is selected */}
              {typeOfPost && (
                <div className="space-y-2">
                  <Label>
                    Platforms <span className="text-destructive">*</span>
                  </Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {availablePlatforms.map((platform) => (
                      <div key={platform} className="flex items-center space-x-2">
                        <Checkbox
                          id={platform.toLowerCase()}
                          checked={platforms.includes(platform.toLowerCase())}
                          onCheckedChange={(checked) =>
                            handlePlatformChange(platform, checked as boolean)
                          }
                        />
                        <Label htmlFor={platform.toLowerCase()} className="cursor-pointer">
                          {platform}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* LinkedIn Account Type - Show when LinkedIn is selected */}
              {showLinkedinAccountType && (
                <div className="space-y-2">
                  <Label>
                    LinkedIn Account Type <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="li-personal"
                        checked={linkedinAccountType.includes("personal")}
                        onCheckedChange={(checked) =>
                          handleLinkedinAccountTypeChange("personal", checked as boolean)
                        }
                      />
                      <Label htmlFor="li-personal" className="cursor-pointer">
                        Personal
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="li-company"
                        checked={linkedinAccountType.includes("company")}
                        onCheckedChange={(checked) =>
                          handleLinkedinAccountTypeChange("company", checked as boolean)
                        }
                      />
                      <Label htmlFor="li-company" className="cursor-pointer">
                        Company
                      </Label>
                    </div>
                  </div>
                </div>
              )}

              {/* Text Content - Show for all except PDF */}
              {showTextContent && (
                <div className="space-y-2">
                  <Label htmlFor="textContent">Text Content (Optional)</Label>
                  <Textarea
                    id="textContent"
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder="Write your post text..."
                  />
                  <div className="text-xs text-muted-foreground text-right">
                    {textContent.length}/2000
                  </div>
                </div>
              )}

              {/* Article Fields - Show only for article type */}
              {showArticleFields && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
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
                      required={showArticleFields}
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
                      rows={3}
                      placeholder="Enter description..."
                      required={showArticleFields}
                    />
                  </div>

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
                      required={showArticleFields}
                    />
                  </div>
                </div>
              )}

              {/* Media Upload - Show for image, carousel, video, shorts, pdf */}
              {showMediaUpload && (
                <div className="space-y-2">
                  <Label htmlFor="mediaFile">
                    {getMediaLabel()} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="mediaFile"
                    type="file"
                    onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                    accept={
                      typeOfPost === "image" || typeOfPost === "carousel"
                        ? "image/*"
                        : typeOfPost === "video" || typeOfPost === "shorts"
                        ? "video/*"
                        : typeOfPost === "pdf"
                        ? "application/pdf"
                        : "*"
                    }
                    required={showMediaUpload}
                  />
                  {mediaFile && (
                    <p className="text-sm text-muted-foreground">
                      Selected: {mediaFile.name}
                    </p>
                  )}
                  {(typeOfPost === "video") && (platforms.includes("facebook") || platforms.includes("instagram")) && (
                    <p className="text-sm text-blue-600">
                      (In Facebook and Instagram, Video will be posted as Reel)
                    </p>
                  )}
                </div>
              )}

              {/* YouTube Fields - Show when YouTube selected and type is video */}
              {showYoutubeFields && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
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
                      required={showYoutubeFields}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="youtubeDescription">
                      Video Description <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="youtubeDescription"
                      value={youtubeDescription}
                      onChange={(e) => setYoutubeDescription(e.target.value)}
                      rows={3}
                      placeholder="Enter video description..."
                      required={showYoutubeFields}
                    />
                  </div>
                </div>
              )}

              {/* Instagram Fields - Show when Instagram selected */}
              {showInstagramFields && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <h3 className="font-semibold">Instagram Fields</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="instagramTags">
                      Instagram Tags <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="instagramTags"
                      value={instagramTags}
                      onChange={(e) => setInstagramTags(e.target.value)}
                      placeholder="Enter username of Instagram profile to tag or mention..."
                      required={showInstagramFields}
                    />
                  </div>
                </div>
              )}

              {/* Facebook Fields - Show when Facebook selected */}
              {showFacebookFields && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <h3 className="font-semibold">Facebook Fields</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="facebookTags">
                      Facebook Tags <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="facebookTags"
                      value={facebookTags}
                      onChange={(e) => setFacebookTags(e.target.value)}
                      placeholder="Enter URLs of Facebook Profile to tag or mention..."
                      required={showFacebookFields}
                    />
                  </div>
                </div>
              )}

              {/* Schedule - Show when type is selected */}
              {showSchedule && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="status">
                      Status <span className="text-destructive">*</span>
                    </Label>
                    <Select value={status} onValueChange={setStatus} required>
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

                  <div className="space-y-2">
                    <Label htmlFor="scheduledAt">
                      Schedule Date & Time <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="scheduledAt"
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      required={showSchedule}
                    />
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              {typeOfPost && (
                <div className="flex gap-3">
                  <Button type="submit" disabled={loading || uploading}>
                    {uploading ? "Uploading..." : loading ? "Creating..." : "Submit"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => navigate("/posts")}>
                    Cancel
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
