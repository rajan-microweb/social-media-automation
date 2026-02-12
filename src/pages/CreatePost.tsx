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
import { toast } from "sonner";
import { z } from "zod";
import { Sparkles, X, Plus, Loader2, Facebook, Instagram, Linkedin, Youtube, Twitter } from "lucide-react";
import { convertFileToJpeg, isJpegFile, convertToJpeg, convertUrlToJpegFile } from "@/lib/imageUtils";
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
import { usePlatformAccounts } from "@/hooks/usePlatformAccounts";
import { PlatformAccountSelector } from "@/components/posts/PlatformAccountSelector";

// Platform configuration based on post type
const PLATFORM_MAP: Record<string, string[]> = {
  onlyText: ["Facebook", "LinkedIn"],
  image: ["Facebook", "Instagram", "LinkedIn"],
  carousel: ["Facebook", "Instagram", "LinkedIn"],
  video: ["Facebook", "Instagram", "LinkedIn"],
  shorts: ["Facebook", "Instagram"],
  article: ["LinkedIn"],
  pdf: ["LinkedIn"],
};

// Replace the old metadataItemSchema with this:
const metadataSchema = z.record(z.string(), z.string()).optional();

const postSchema = z.object({
  type_of_post: z.string().min(1, "Type of post is required"),
  platforms: z.array(z.string()).min(1, "At least one platform is required"),
  account_type: z.string().optional(),
  text: z.string().max(5000).optional(),
  image: z.string().url().optional().or(z.literal("")),
  video: z.string().url().optional().or(z.literal("")),
  pdf: z.string().url().optional().or(z.literal("")),
  tags: z.array(z.string()).optional(),
  metadata: metadataSchema,
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
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  // Use the platform accounts hook
  const { accounts: platformAccounts, loading: loadingPlatformAccounts } = usePlatformAccounts(user?.id, platforms);

  // Platform connection state
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [showConnectionAlert, setShowConnectionAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertPlatform, setAlertPlatform] = useState("");
  const [textContent, setTextContent] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [postDescription, setPostDescription] = useState("");
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
  const [articleThumbnailFile, setArticleThumbnailFile] = useState<File | null>(null);
  const [articleThumbnailUrl, setArticleThumbnailUrl] = useState("");

  // AI Modal state
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalField, setAiModalField] = useState<"text" | "image" | "video" | "pdf">("text");
  const [aiModalTarget, setAiModalTarget] = useState<string>("");

  // OpenAI connection state
  const [openaiConnected, setOpenaiConnected] = useState(false);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [showOpenAIAlert, setShowOpenAIAlert] = useState(false);

  // AI-generated URLs
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");

  // Carousel state - multiple images
  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const [carouselFiles, setCarouselFiles] = useState<File[]>([]);
  const [carouselGenerating, setCarouselGenerating] = useState(false);
  const [carouselAiPrompt, setCarouselAiPrompt] = useState("");

  // Available platforms based on post type
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);

  // Fetch connected platforms on mount
  useEffect(() => {
    const fetchConnectedPlatforms = async () => {
      if (!user) return;

      const { data } = await supabase
        .from("platform_integrations")
        .select("platform_name, credentials")
        .eq("user_id", user.id);

      if (data) {
        const platformNames = data.map((p) => p.platform_name);
        setConnectedPlatforms(platformNames);
        // Check if OpenAI is connected and get API key
        const openaiIntegration = data.find((p) => p.platform_name.toLowerCase() === "openai");
        setOpenaiConnected(!!openaiIntegration);
        if (openaiIntegration?.credentials && typeof openaiIntegration.credentials === "object") {
          setOpenaiApiKey((openaiIntegration.credentials as any).api_key || "");
        }
      }
    };

    fetchConnectedPlatforms();
  }, [user]);

  // Reset form when type changes
  useEffect(() => {
    if (typeOfPost) {
      // Update available platforms
      setAvailablePlatforms(PLATFORM_MAP[typeOfPost] || []);
      // Reset selected platforms
      setPlatforms([]);
      setSelectedAccountIds([]);
      // Reset platform-specific fields
      setYoutubeTitle("");
      setYoutubeDescription("");
      setInstagramTags("");
      setFacebookTags("");
      // Reset carousel images when switching away from carousel
      if (typeOfPost !== "carousel") {
        setCarouselImages([]);
        setCarouselFiles([]);
      }
    } else {
      setAvailablePlatforms([]);
      setPlatforms([]);
    }
  }, [typeOfPost]);

  // Reset selected accounts when platforms change (but only when accounts have loaded)
  useEffect(() => {
    if (loadingPlatformAccounts) return; // Don't filter while loading
    // Filter out account IDs that no longer belong to selected platforms
    const validAccountIds = selectedAccountIds.filter((id) => platformAccounts.some((account) => account.id === id));
    if (validAccountIds.length !== selectedAccountIds.length) {
      setSelectedAccountIds(validAccountIds);
    }
  }, [platforms, platformAccounts, loadingPlatformAccounts]);

  const handlePlatformChange = (platform: string, checked: boolean) => {
    // Check if platform is connected before allowing selection (case-insensitive)
    const isConnected = connectedPlatforms.some((p) => p.toLowerCase() === platform.toLowerCase());

    if (checked && !isConnected) {
      setAlertMessage(`Please connect your ${platform} account first to select this platform.`);
      setAlertPlatform(platform);
      setShowConnectionAlert(true);
      return;
    }

    if (checked) {
      setPlatforms([...platforms, platform.toLowerCase()]);
    } else {
      setPlatforms(platforms.filter((p) => p !== platform.toLowerCase()));
    }
  };

  const handleAccountToggle = (accountId: string) => {
    if (selectedAccountIds.includes(accountId)) {
      setSelectedAccountIds(selectedAccountIds.filter((id) => id !== accountId));
    } else {
      setSelectedAccountIds([...selectedAccountIds, accountId]);
    }
  };

  const openAiModal = (field: "text" | "image" | "video" | "pdf", target: string) => {
    if (!openaiConnected) {
      setShowOpenAIAlert(true);
      return;
    }
    setAiModalField(field);
    setAiModalTarget(target);
    setAiModalOpen(true);
  };

  const handleAiGenerate = async (content: string) => {
    if (aiModalTarget === "textContent") {
      setTextContent(content);
    } else if (aiModalTarget === "postTitle") {
      setPostTitle(content);
    } else if (aiModalTarget === "postDescription") {
      setPostDescription(content);
    } else if (aiModalTarget === "articleTitle") {
      setArticleTitle(content);
    } else if (aiModalTarget === "articleDescription") {
      setArticleDescription(content);
    } else if (aiModalTarget === "youtubeTitle") {
      setYoutubeTitle(content);
    } else if (aiModalTarget === "youtubeDescription") {
      setYoutubeDescription(content);
    } else if (aiModalTarget === "articleThumbnail") {
      setArticleThumbnailUrl(content);
      setArticleThumbnailFile(null);
      toast.success("AI-generated thumbnail URL loaded");
    } else if (aiModalTarget === "media") {
      // For media, content is a URL from AI - store it directly
      if (typeOfPost === "image" || typeOfPost === "carousel") {
        setImageUrl(content);
      } else if (typeOfPost === "video" || typeOfPost === "shorts") {
        setVideoUrl(content);
      } else if (typeOfPost === "pdf") {
        setPdfUrl(content);
      }
      setMediaFile(null); // Clear file if URL is set
      toast.success("AI-generated media URL loaded");
    }
  };

  const uploadFile = async (file: File, folder: string): Promise<string> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;

    const { error: uploadError } = await supabase.storage.from("post-media").upload(filePath, file);

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("post-media").getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Check if any platform is connected
    if (connectedPlatforms.length === 0) {
      setAlertMessage("Please connect at least one social media account before creating a post.");
      setAlertPlatform("");
      setShowConnectionAlert(true);
      return;
    }

    setLoading(true);
    setUploading(true);

    try {
      // Check for AI-generated URLs first, otherwise upload file if present
      let uploadedUrl = null;
      let thumbnailUrl = null;

      // Handle carousel separately - multiple images stored as comma-separated URLs
      if (typeOfPost === "carousel") {
        const allCarouselUrls: string[] = [...carouselImages]; // AI-generated URLs

        // Upload any files that were selected
        for (const file of carouselFiles) {
          const url = await uploadFile(file, "images");
          allCarouselUrls.push(url);
        }

        if (allCarouselUrls.length === 0) {
          toast.error("Please add at least one image for the carousel");
          setLoading(false);
          setUploading(false);
          return;
        }

        if (allCarouselUrls.length > 10) {
          toast.error("Maximum 10 images allowed for carousel");
          setLoading(false);
          setUploading(false);
          return;
        }

        uploadedUrl = allCarouselUrls.join(",");
      } else if (imageUrl || videoUrl || pdfUrl) {
        // Priority: AI URLs over file uploads for non-carousel
        if (typeOfPost === "image") {
          uploadedUrl = imageUrl;
        } else if (typeOfPost === "video" || typeOfPost === "shorts") {
          uploadedUrl = videoUrl;
        } else if (typeOfPost === "pdf") {
          uploadedUrl = pdfUrl;
        }
      } else if (mediaFile) {
        let folder = "";
        if (typeOfPost === "image") {
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

      // Handle article thumbnail upload
      if (typeOfPost === "article") {
        if (articleThumbnailUrl) {
          thumbnailUrl = articleThumbnailUrl;
        } else if (articleThumbnailFile) {
          thumbnailUrl = await uploadFile(articleThumbnailFile, "images");
        }
      }

      // Build account_type string from selected accounts
      let accountTypeValue = "";
      if (selectedAccountIds.length > 0) {
        accountTypeValue = selectedAccountIds.join(",");
      }

      // Build metadata object with platform+post-type specific fields
      const metadataObject: Record<string, string> = {};

      // Article URL stored in metadata
      if (typeOfPost === "article" && platforms.includes("linkedin")) {
        if (articleTitle) metadataObject["title"] = articleTitle;
        if (articleDescription) metadataObject["description"] = articleDescription;
        if (articleUrl) metadataObject["url"] = articleUrl;
      }

      // Video + YouTube specific fields
      if ((typeOfPost === "video" || typeOfPost === "shorts") && platforms.includes("youtube")) {
        if (youtubeTitle) metadataObject["title"] = youtubeTitle;
        if (youtubeDescription) metadataObject["description"] = youtubeDescription;
      }

      // Build tags array for platform-specific hashtags only
      const tagsArray: string[] = [];

      // Instagram tags
      if (platforms.includes("instagram") && instagramTags) {
        tagsArray.push(`instagram_tags:${instagramTags}`);
      }

      // Facebook tags
      if (platforms.includes("facebook") && facebookTags) {
        tagsArray.push(`facebook_tags:${facebookTags}`);
      }

      const data = {
        type_of_post: typeOfPost,
        platforms: platforms,
        account_type: accountTypeValue || undefined,
        text: textContent || undefined,
        image:
          typeOfPost === "image" || typeOfPost === "carousel"
            ? uploadedUrl || ""
            : typeOfPost === "article"
              ? thumbnailUrl || ""
              : "",
        video: typeOfPost === "video" || typeOfPost === "shorts" ? uploadedUrl || "" : "",
        pdf: typeOfPost === "pdf" ? uploadedUrl || "" : "",
        tags: tagsArray,
        metadata: metadataObject, // Use the new object structure here
        status: status,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
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
        title: postTitle || "Untitled",
        description: postDescription || null,
        url: null,
        tags: data.tags.length > 0 ? data.tags : null,
        metadata: Object.keys(data.metadata).length > 0 ? data.metadata : null,
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

  // State for conversion progress
  const [isConverting, setIsConverting] = useState(false);

  // Carousel-specific functions
  const handleCarouselFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 10 - getTotalCarouselCount();

    if (files.length > remaining) {
      toast.error(`You can only add ${remaining} more images`);
      return;
    }

    // Check if Instagram carousel - convert non-JPEG files
    const isInstaCarousel = typeOfPost === "carousel" && platforms.includes("instagram");

    if (isInstaCarousel) {
      setIsConverting(true);
      const convertedFiles: File[] = [];

      for (const file of files) {
        // Convert to JPEG if needed
        if (isJpegFile(file)) {
          convertedFiles.push(file);
        } else {
          toast.info(`Converting ${file.name} to JPEG...`);
          try {
            const jpegFile = await convertFileToJpeg(file);
            convertedFiles.push(jpegFile);
          } catch (convError) {
            console.error("Conversion error:", convError);
            toast.error(`Failed to convert ${file.name} to JPEG`);
          }
        }
      }

      setCarouselFiles([...carouselFiles, ...convertedFiles]);
      setIsConverting(false);
    } else {
      // Non-Instagram carousel - just add files directly
      setCarouselFiles([...carouselFiles, ...files]);
    }
  };

  const generateCarouselAiImage = async () => {
    if (!openaiConnected) {
      setShowOpenAIAlert(true);
      return;
    }

    if (!carouselAiPrompt.trim()) {
      toast.error("Please enter a prompt for AI image generation");
      return;
    }

    setCarouselGenerating(true);

    try {
      const response = await fetch(
        "https://fcfdyivyjidzqjtanalq.supabase.co/functions/v1/upload-ai-media",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imagePrompt: carouselAiPrompt,
            userId: user?.id,
            apiKey: openaiApiKey,
            platforms: [platforms.includes("instagram") ? "instagram" : "general"],
            typeOfPost: "carousel",
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`AI generation failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.imageUrl) {
        // For Instagram carousel, convert AI-generated images to JPEG
        const isInstaCarousel = typeOfPost === "carousel" && platforms.includes("instagram");

        if (isInstaCarousel) {
          try {
            const jpegFile = await convertUrlToJpegFile(data.imageUrl, `carousel-${Date.now()}.jpg`);
            setCarouselImages([...carouselImages, data.imageUrl]);
          } catch (error) {
            console.error("JPEG conversion error:", error);
            toast.error("Failed to process AI-generated image");
          }
        } else {
          setCarouselImages([...carouselImages, data.imageUrl]);
        }

        setCarouselAiPrompt("");
        toast.success("AI image added to carousel");
      } else {
        toast.error("No image URL received from AI");
      }
    } catch (error: any) {
      console.error("AI generation error:", error);
      toast.error(error.message || "Failed to generate image");
    } finally {
      setCarouselGenerating(false);
    }
  };

  const getTotalCarouselCount = () => carouselImages.length + carouselFiles.length;

  const removeCarouselImage = (index: number) => {
    if (index < carouselImages.length) {
      setCarouselImages(carouselImages.filter((_, i) => i !== index));
    } else {
      setCarouselFiles(carouselFiles.filter((_, i) => i !== index - carouselImages.length));
    }
  };

  // Field visibility logic
  const showTextContent = typeOfPost && typeOfPost !== "pdf";
  const showPdfTextContent = typeOfPost === "pdf";
  const showArticleFields = typeOfPost === "article";
  const showMediaUpload = typeOfPost && typeOfPost !== "onlyText" && typeOfPost !== "article";
  const showYoutubeFields = platforms.includes("youtube") && typeOfPost === "video";
  const showInstagramFields = platforms.includes("instagram");
  const showFacebookFields = platforms.includes("facebook");
  const showAccountSelectors = platforms.length > 0;
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

  // Platform icon config for card-style selection
  const platformIcons: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
    Facebook: { icon: Facebook, color: "text-[#1877F3]", bg: "border-[#1877F3]" },
    Instagram: { icon: Instagram, color: "text-[#E4405F]", bg: "border-[#E4405F]" },
    LinkedIn: { icon: Linkedin, color: "text-[#0A66C2]", bg: "border-[#0A66C2]" },
    YouTube: { icon: Youtube, color: "text-[#FF0000]", bg: "border-[#FF0000]" },
    Twitter: { icon: Twitter, color: "text-[#1DA1F2]", bg: "border-[#1DA1F2]" },
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Create Post</h1>
          <p className="text-muted-foreground">Create a new social media post</p>
        </div>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* Post Details Header */}
              <h2 className="text-xl font-semibold">Post Details</h2>

              {/* Post Title */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="postTitle">Post Title</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => openAiModal("text", "postTitle")} className="text-xs h-auto py-1">
                    <Sparkles className="mr-1 h-3.5 w-3.5" /> AI Generate
                  </Button>
                </div>
                <Input id="postTitle" value={postTitle} onChange={(e) => setPostTitle(e.target.value)} placeholder="Enter post title..." />
              </div>

              {/* Post Description */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="postDescription">Post Description (Optional)</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => openAiModal("text", "postDescription")} className="text-xs h-auto py-1">
                    <Sparkles className="mr-1 h-3.5 w-3.5" /> AI Generate
                  </Button>
                </div>
                <Textarea id="postDescription" value={postDescription} onChange={(e) => setPostDescription(e.target.value)} placeholder="Enter post description..." rows={3} maxLength={5000} />
                <p className="text-xs text-muted-foreground text-right mt-1">{postDescription.length}/5000</p>
              </div>

              {/* Type of Post */}
              <div>
                <Label>Type of Post <span className="text-destructive">*</span></Label>
                <Select value={typeOfPost} onValueChange={setTypeOfPost}>
                  <SelectTrigger className="mt-1">
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

              {typeOfPost && (
                <>
                  {/* Platforms */}
                  <div>
                    <Label>Platforms <span className="text-destructive">*</span></Label>
                    <div className="flex flex-wrap gap-3 mt-2">
                      {availablePlatforms.map((platform) => {
                        const isSelected = platforms.includes(platform.toLowerCase());
                        const iconConfig = platformIcons[platform];
                        const PlatformIcon = iconConfig?.icon || Linkedin;
                        return (
                          <button
                            key={platform}
                            type="button"
                            onClick={() => handlePlatformChange(platform, !isSelected)}
                            className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all min-w-[70px] ${
                              isSelected
                                ? `${iconConfig?.bg || "border-primary"} bg-background shadow-sm`
                                : "border-border hover:border-muted-foreground/50"
                            }`}
                          >
                            <PlatformIcon className={`h-7 w-7 ${iconConfig?.color || "text-foreground"}`} />
                            <span className="text-xs font-medium">{platform}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Account selectors */}
                  {showAccountSelectors && (
                    <div>
                      {platforms.map((platform) => (
                        <PlatformAccountSelector
                          key={platform}
                          accounts={platformAccounts}
                          selectedAccountIds={selectedAccountIds}
                          onAccountToggle={handleAccountToggle}
                          loading={loadingPlatformAccounts}
                          platform={platform}
                        />
                      ))}
                    </div>
                  )}

                  {/* Text Content */}
                  {(showTextContent || showPdfTextContent) && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label>Text Content (Optional)</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={() => openAiModal("text", "textContent")} className="text-xs h-auto py-1">
                          <Sparkles className="mr-1 h-3.5 w-3.5" /> AI Generate
                        </Button>
                      </div>
                      <Textarea
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value)}
                        placeholder={showPdfTextContent ? "Write accompanying text for your PDF post..." : "Write your post text..."}
                        rows={4}
                        maxLength={2000}
                      />
                      <p className="text-xs text-muted-foreground text-right mt-1">{textContent.length}/2000</p>
                    </div>
                  )}

                  {/* Carousel Images */}
                  {typeOfPost === "carousel" && (
                    <div className="space-y-3">
                      <Label>Carousel Images ({getTotalCarouselCount()}/10) <span className="text-destructive">*</span></Label>

                      {/* AI Generate section */}
                      <div className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-1 text-sm font-medium">
                          <Sparkles className="h-4 w-4" /> AI Generate Images
                        </div>
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            placeholder="Describe the image you want to generate..."
                            value={carouselAiPrompt}
                            onChange={(e) => setCarouselAiPrompt(e.target.value)}
                            disabled={carouselGenerating}
                          />
                          <Button type="button" onClick={generateCarouselAiImage} disabled={carouselGenerating || !carouselAiPrompt.trim()} size="sm">
                            {carouselGenerating ? <Loader2 className="animate-spin mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}
                            Generate
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">Generate images one by one. Each generation adds one image to the carousel.</p>
                      </div>

                      {/* File upload */}
                      <div>
                        <Label className="text-sm">Or Upload Images from Device</Label>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleCarouselFilesChange}
                          disabled={isConverting || getTotalCarouselCount() >= 10}
                          className="mt-1 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-muted file:text-foreground hover:file:bg-muted/80"
                        />
                      </div>

                      {/* Preview grid */}
                      {getTotalCarouselCount() > 0 ? (
                        <div className="grid grid-cols-5 gap-2">
                          {carouselImages.map((url, idx) => (
                            <div key={`img-${idx}`} className="relative">
                              <img src={url} alt={`Carousel ${idx}`} className="w-full h-20 object-cover rounded" />
                              <button type="button" onClick={() => removeCarouselImage(idx)} className="absolute top-1 right-1 bg-black/50 rounded-full p-0.5 text-white">
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                          {carouselFiles.map((file, idx) => (
                            <div key={`file-${idx}`} className="relative">
                              <img src={URL.createObjectURL(file)} alt={`File ${idx}`} className="w-full h-20 object-cover rounded" />
                              <button type="button" onClick={() => removeCarouselImage(idx + carouselImages.length)} className="absolute top-1 right-1 bg-black/50 rounded-full p-0.5 text-white">
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-3 border rounded-lg">
                          No images added yet. Generate with AI or upload from your device.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Media upload (non-carousel) */}
                  {showMediaUpload && typeOfPost !== "carousel" && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label>{getMediaLabel()} <span className="text-destructive">*</span></Label>
                        {(typeOfPost === "image") && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => openAiModal("image", "media")} className="text-xs h-auto py-1">
                            <Sparkles className="mr-1 h-3.5 w-3.5" /> AI Generate
                          </Button>
                        )}
                        {(typeOfPost === "video" || typeOfPost === "shorts") && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => openAiModal("video", "media")} className="text-xs h-auto py-1">
                            <Sparkles className="mr-1 h-3.5 w-3.5" /> AI Generate
                          </Button>
                        )}
                        {typeOfPost === "pdf" && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => openAiModal("pdf", "media")} className="text-xs h-auto py-1">
                            <Sparkles className="mr-1 h-3.5 w-3.5" /> AI Generate
                          </Button>
                        )}
                      </div>
                      <input
                        type="file"
                        accept={
                          typeOfPost === "image" ? "image/*"
                            : typeOfPost === "video" || typeOfPost === "shorts" ? "video/*"
                            : typeOfPost === "pdf" ? "application/pdf"
                            : undefined
                        }
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            setMediaFile(e.target.files[0]);
                            setImageUrl("");
                            setVideoUrl("");
                            setPdfUrl("");
                          }
                        }}
                        className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-muted file:text-foreground hover:file:bg-muted/80"
                      />
                    </div>
                  )}

                  {/* Article fields */}
                  {showArticleFields && (
                    <div className="border rounded-lg p-4 space-y-4">
                      <h3 className="font-semibold">Article Fields</h3>

                      <div>
                        <Label htmlFor="articleTitle">Article Title (Optional)</Label>
                        <Input id="articleTitle" value={articleTitle} onChange={(e) => setArticleTitle(e.target.value)} placeholder="Enter article title..." />
                      </div>

                      <div>
                        <Label htmlFor="articleDescription">Article Description (Optional)</Label>
                        <Textarea id="articleDescription" value={articleDescription} onChange={(e) => setArticleDescription(e.target.value)} placeholder="Enter article description..." rows={3} />
                      </div>

                      <div>
                        <Label htmlFor="articleUrl">Article URL (Optional)</Label>
                        <Input id="articleUrl" value={articleUrl} onChange={(e) => setArticleUrl(e.target.value)} placeholder="https://..." />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label>Upload Thumbnail (Optional)</Label>
                          <Button type="button" variant="ghost" size="sm" onClick={() => openAiModal("image", "articleThumbnail")} className="text-xs h-auto py-1">
                            <Sparkles className="mr-1 h-3.5 w-3.5" /> AI Generate
                          </Button>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              setArticleThumbnailFile(e.target.files[0]);
                              setArticleThumbnailUrl("");
                            }
                          }}
                          className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-muted file:text-foreground hover:file:bg-muted/80"
                        />
                      </div>
                    </div>
                  )}

                  {/* YouTube specific fields */}
                  {showYoutubeFields && (
                    <div className="border rounded-lg p-4 space-y-4">
                      <h3 className="font-semibold">YouTube Details</h3>
                      <div>
                        <Label htmlFor="youtubeTitle">YouTube Title</Label>
                        <Input id="youtubeTitle" value={youtubeTitle} onChange={(e) => setYoutubeTitle(e.target.value)} placeholder="Enter YouTube video title" />
                      </div>
                      <div>
                        <Label htmlFor="youtubeDescription">YouTube Description</Label>
                        <Textarea id="youtubeDescription" value={youtubeDescription} onChange={(e) => setYoutubeDescription(e.target.value)} placeholder="Enter YouTube video description" rows={3} />
                      </div>
                    </div>
                  )}

                  {/* Instagram tags */}
                  {showInstagramFields && (
                    <div>
                      <Label>Instagram Hashtags</Label>
                      <Textarea value={instagramTags} onChange={(e) => setInstagramTags(e.target.value)} placeholder="Enter Instagram hashtags separated by spaces" rows={2} className="mt-1" />
                    </div>
                  )}

                  {/* Facebook tags */}
                  {showFacebookFields && (
                    <div>
                      <Label>Facebook Hashtags</Label>
                      <Textarea value={facebookTags} onChange={(e) => setFacebookTags(e.target.value)} placeholder="Enter Facebook hashtags separated by spaces" rows={2} className="mt-1" />
                    </div>
                  )}

                  {/* Status and Schedule - side by side */}
                  {showSchedule && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Status <span className="text-destructive">*</span></Label>
                        <Select value={status} onValueChange={setStatus}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                            <SelectItem value="published">Published</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="scheduledAt">Schedule Date & Time <span className="text-destructive">*</span></Label>
                        <Input
                          id="scheduledAt"
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Submit / Cancel */}
          {typeOfPost && (
            <div className="flex gap-3 mt-6">
              <Button type="submit" disabled={loading || uploading}>
                {loading || uploading ? (
                  <><Loader2 className="animate-spin mr-2 h-4 w-4" /> Saving...</>
                ) : (
                  "Submit"
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate("/posts")}>
                Cancel
              </Button>
            </div>
          )}
        </form>
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
            <AlertDialogTitle>Platform Not Connected</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>{alertMessage}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => navigate("/accounts")}>Connect Account</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showOpenAIAlert} onOpenChange={setShowOpenAIAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>OpenAI Not Connected</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>Please connect your OpenAI account to generate content with AI.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => navigate("/accounts")}>Connect OpenAI</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
