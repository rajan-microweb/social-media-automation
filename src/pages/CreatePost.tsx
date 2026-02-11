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
import { Sparkles, X, Plus, Loader2 } from "lucide-react";
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

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Create Post</h1>
          <p className="text-muted-foreground">Create a new social media post</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Post Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {[
                { value: "onlyText", label: "Text Only" },
                { value: "image", label: "Image" },
                { value: "carousel", label: "Carousel" },
                { value: "video", label: "Video" },
                { value: "shorts", label: "Shorts" },
                { value: "article", label: "Article" },
                { value: "pdf", label: "PDF" },
              ].map((type) => (
                <button
                  key={type.value}
                  onClick={() => setTypeOfPost(type.value)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    typeOfPost === type.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {typeOfPost && (
          <>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Platforms selection */}
              <Card>
                <CardHeader>
                  <CardTitle>Select Platforms</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4">
                    {availablePlatforms.map((platform) => (
                      <label key={platform} className="inline-flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={platforms.includes(platform.toLowerCase())}
                          onChange={(e) => handlePlatformChange(platform, e.target.checked)}
                        />
                        <span className="capitalize">{platform}</span>
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Account selectors */}
              {showAccountSelectors && (
                <Card>
                  <CardHeader>
                    <CardTitle>Select Accounts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PlatformAccountSelector
                      accounts={platformAccounts}
                      selectedAccountIds={selectedAccountIds}
                      onToggle={handleAccountToggle}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Title and description */}
              <Card>
                <CardHeader>
                  <CardTitle>Post Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="postTitle">Title</Label>
                    <Input
                      id="postTitle"
                      value={postTitle}
                      onChange={(e) => setPostTitle(e.target.value)}
                      placeholder="Enter post title"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openAiModal("text", "postTitle")}
                      className="mt-1"
                    >
                      <Sparkles className="mr-1 h-4 w-4" /> Generate with AI
                    </Button>
                  </div>

                  <div>
                    <Label htmlFor="postDescription">Description</Label>
                    <Textarea
                      id="postDescription"
                      value={postDescription}
                      onChange={(e) => setPostDescription(e.target.value)}
                      placeholder="Enter post description"
                      rows={3}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openAiModal("text", "postDescription")}
                      className="mt-1"
                    >
                      <Sparkles className="mr-1 h-4 w-4" /> Generate with AI
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Text content */}
              {showTextContent && (
                <Card>
                  <CardHeader>
                    <CardTitle>Text Content</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                      placeholder="Enter post text content"
                      rows={5}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openAiModal("text", "textContent")}
                      className="mt-1"
                    >
                      <Sparkles className="mr-1 h-4 w-4" /> Generate with AI
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* PDF text content */}
              {showPdfTextContent && (
                <Card>
                  <CardHeader>
                    <CardTitle>PDF Text Content</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                      placeholder="Enter text content for PDF"
                      rows={5}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openAiModal("text", "textContent")}
                      className="mt-1"
                    >
                      <Sparkles className="mr-1 h-4 w-4" /> Generate with AI
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Media upload */}
              {showMediaUpload && (
                <Card>
                  <CardHeader>
                    <CardTitle>{getMediaLabel()}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {typeOfPost === "carousel" ? (
                      <>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleCarouselFilesChange}
                          disabled={isConverting || carouselFiles.length + carouselImages.length >= 10}
                        />
                        <div className="mt-4 grid grid-cols-4 gap-4">
                          {carouselImages.map((url, idx) => (
                            <div key={`img-${idx}`} className="relative">
                              <img src={url} alt={`Carousel ${idx}`} className="w-full h-24 object-cover rounded" />
                              <button
                                type="button"
                                onClick={() => removeCarouselImage(idx)}
                                className="absolute top-1 right-1 bg-black bg-opacity-50 rounded-full p-1 text-white"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ))}
                          {carouselFiles.map((file, idx) => (
                            <div key={`file-${idx}`} className="relative">
                              <img
                                src={URL.createObjectURL(file)}
                                alt={`Carousel file ${idx}`}
                                className="w-full h-24 object-cover rounded"
                              />
                              <button
                                type="button"
                                onClick={() => removeCarouselImage(idx + carouselImages.length)}
                                className="absolute top-1 right-1 bg-black bg-opacity-50 rounded-full p-1 text-white"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center space-x-2">
                          <Input
                            type="text"
                            placeholder="AI prompt for carousel image"
                            value={carouselAiPrompt}
                            onChange={(e) => setCarouselAiPrompt(e.target.value)}
                            disabled={carouselGenerating}
                          />
                          <Button onClick={generateCarouselAiImage} disabled={carouselGenerating || !carouselAiPrompt.trim()}>
                            {carouselGenerating ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                            Generate AI Image
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <input
                          type="file"
                          accept={
                            typeOfPost === "image" || typeOfPost === "carousel"
                              ? "image/*"
                              : typeOfPost === "video" || typeOfPost === "shorts"
                                ? "video/*"
                                : typeOfPost === "pdf"
                                  ? "application/pdf"
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
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAiModal("image", "media")}
                          disabled={typeOfPost !== "image" && typeOfPost !== "carousel"}
                          className="mt-1"
                        >
                          <Sparkles className="mr-1 h-4 w-4" /> Generate with AI
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAiModal("video", "media")}
                          disabled={typeOfPost !== "video" && typeOfPost !== "shorts"}
                          className="mt-1"
                        >
                          <Sparkles className="mr-1 h-4 w-4" /> Generate with AI
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAiModal("pdf", "media")}
                          disabled={typeOfPost !== "pdf"}
                          className="mt-1"
                        >
                          <Sparkles className="mr-1 h-4 w-4" /> Generate with AI
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Article specific fields */}
              {showArticleFields && (
                <Card>
                  <CardHeader>
                    <CardTitle>Article Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="articleTitle">Article Title</Label>
                      <Input
                        id="articleTitle"
                        value={articleTitle}
                        onChange={(e) => setArticleTitle(e.target.value)}
                        placeholder="Enter article title"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAiModal("text", "articleTitle")}
                        className="mt-1"
                      >
                        <Sparkles className="mr-1 h-4 w-4" /> Generate with AI
                      </Button>
                    </div>

                    <div>
                      <Label htmlFor="articleDescription">Article Description</Label>
                      <Textarea
                        id="articleDescription"
                        value={articleDescription}
                        onChange={(e) => setArticleDescription(e.target.value)}
                        placeholder="Enter article description"
                        rows={3}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAiModal("text", "articleDescription")}
                        className="mt-1"
                      >
                        <Sparkles className="mr-1 h-4 w-4" /> Generate with AI
                      </Button>
                    </div>

                    <div>
                      <Label htmlFor="articleUrl">Article URL</Label>
                      <Input
                        id="articleUrl"
                        value={articleUrl}
                        onChange={(e) => setArticleUrl(e.target.value)}
                        placeholder="Enter article URL"
                      />
                    </div>

                    <div>
                      <Label htmlFor="articleThumbnail">Article Thumbnail URL</Label>
                      <Input
                        id="articleThumbnail"
                        value={articleThumbnailUrl}
                        onChange={(e) => {
                          setArticleThumbnailUrl(e.target.value);
                          setArticleThumbnailFile(null);
                        }}
                        placeholder="Enter thumbnail image URL"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAiModal("image", "articleThumbnail")}
                        className="mt-1"
                      >
                        <Sparkles className="mr-1 h-4 w-4" /> Generate with AI
                      </Button>
                      <div className="mt-2">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              setArticleThumbnailFile(e.target.files[0]);
                              setArticleThumbnailUrl("");
                            }
                          }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* YouTube specific fields */}
              {showYoutubeFields && (
                <Card>
                  <CardHeader>
                    <CardTitle>YouTube Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="youtubeTitle">YouTube Title</Label>
                      <Input
                        id="youtubeTitle"
                        value={youtubeTitle}
                        onChange={(e) => setYoutubeTitle(e.target.value)}
                        placeholder="Enter YouTube video title"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAiModal("text", "youtubeTitle")}
                        className="mt-1"
                      >
                        <Sparkles className="mr-1 h-4 w-4" /> Generate with AI
                      </Button>
                    </div>

                    <div>
                      <Label htmlFor="youtubeDescription">YouTube Description</Label>
                      <Textarea
                        id="youtubeDescription"
                        value={youtubeDescription}
                        onChange={(e) => setYoutubeDescription(e.target.value)}
                        placeholder="Enter YouTube video description"
                        rows={3}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAiModal("text", "youtubeDescription")}
                        className="mt-1"
                      >
                        <Sparkles className="mr-1 h-4 w-4" /> Generate with AI
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Instagram tags */}
              {showInstagramFields && (
                <Card>
                  <CardHeader>
                    <CardTitle>Instagram Hashtags</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={instagramTags}
                      onChange={(e) => setInstagramTags(e.target.value)}
                      placeholder="Enter Instagram hashtags separated by spaces"
                      rows={2}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Facebook tags */}
              {showFacebookFields && (
                <Card>
                  <CardHeader>
                    <CardTitle>Facebook Hashtags</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={facebookTags}
                      onChange={(e) => setFacebookTags(e.target.value)}
                      placeholder="Enter Facebook hashtags separated by spaces"
                      rows={2}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Status and scheduling */}
              {showSchedule && (
                <Card>
                  <CardHeader>
                    <CardTitle>Post Status & Scheduling</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                      </SelectContent>
                    </Select>

                    {status === "scheduled" && (
                      <div>
                        <Label htmlFor="scheduledAt">Scheduled Date & Time</Label>
                        <Input
                          id="scheduledAt"
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end space-x-4">
                <Button type="submit" disabled={loading || uploading}>
                  {loading || uploading ? (
                    <>
                      <Loader2 className="animate-spin mr-2 h-4 w-4" /> Saving...
                    </>
                  ) : (
                    "Create Post"
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate("/posts")}>
                  Cancel
                </Button>
              </div>
            </form>
          </>
        )}
      </div>

      <AiPromptModal
        open={aiModalOpen}
        onOpenChange={setAiModalOpen}
        field={aiModalField}
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
