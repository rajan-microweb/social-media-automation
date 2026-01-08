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
import { Sparkles, X, Plus, Loader2, AlertCircle } from "lucide-react";
import { convertFileToJpeg, isJpegFile, convertToJpeg } from "@/lib/imageUtils";
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
  // All title/description fields are optional - platform-specific data stored in tags
  title: z.string().optional(),
  description: z.string().optional(),
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
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  // Use the platform accounts hook
  const { accounts: platformAccounts, loading: loadingPlatformAccounts } = usePlatformAccounts(user?.id, platforms);

  // Platform connection state
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [showConnectionAlert, setShowConnectionAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertPlatform, setAlertPlatform] = useState("");
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

  // Reset selected accounts when platforms change
  useEffect(() => {
    // Filter out account IDs that no longer belong to selected platforms
    const validAccountIds = selectedAccountIds.filter((id) => platformAccounts.some((account) => account.id === id));
    if (validAccountIds.length !== selectedAccountIds.length) {
      setSelectedAccountIds(validAccountIds);
    }
  }, [platforms, platformAccounts]);

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

      // Build tags array with platform+post-type specific fields
      const tagsArray: string[] = [];

      // Article + LinkedIn specific fields
      if (typeOfPost === "article" && platforms.includes("linkedin")) {
        if (articleTitle) tagsArray.push(`article_title:${articleTitle}`);
        if (articleDescription) tagsArray.push(`article_description:${articleDescription}`);
        if (articleUrl) tagsArray.push(`article_url:${articleUrl}`);
      }

      // Video + YouTube specific fields
      if ((typeOfPost === "video" || typeOfPost === "shorts") && platforms.includes("youtube")) {
        if (youtubeTitle) tagsArray.push(`video_title:${youtubeTitle}`);
        if (youtubeDescription) tagsArray.push(`video_description:${youtubeDescription}`);
      }

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
        // Title and description are now optional and not populated from article fields
        title: undefined,
        description: undefined,
        url: undefined,
        tags: tagsArray,
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
        title: "", // Required field, send empty string
        description: data.description ?? null,
        url: data.url ?? null,
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

    // Check if Instagram carousel - need to convert non-JPEG files
    const needsConversion = typeOfPost === "carousel" && platforms.includes("instagram");

    if (needsConversion) {
      setIsConverting(true);
      const convertedFiles: File[] = [];

      for (const file of files) {
        if (isJpegFile(file)) {
          convertedFiles.push(file);
        } else {
          toast.info(`Converting ${file.name} to JPEG...`);
          try {
            const jpegFile = await convertFileToJpeg(file);
            convertedFiles.push(jpegFile);
          } catch (error) {
            console.error("Conversion error:", error);
            toast.error(`Failed to convert ${file.name}`);
            continue;
          }
        }
      }

      setCarouselFiles((prev) => [...prev, ...convertedFiles]);
      setIsConverting(false);
      if (convertedFiles.length > 0) {
        toast.success(`${convertedFiles.length} image(s) added`);
      }
    } else {
      setCarouselFiles((prev) => [...prev, ...files]);
    }
  };

  const removeCarouselFile = (index: number) => {
    setCarouselFiles(carouselFiles.filter((_, i) => i !== index));
  };

  const removeCarouselImage = (index: number) => {
    setCarouselImages(carouselImages.filter((_, i) => i !== index));
  };

  const generateCarouselAiImage = async () => {
    if (!openaiConnected) {
      setShowOpenAIAlert(true);
      return;
    }

    if (!carouselAiPrompt.trim()) {
      toast.error("Please enter a prompt for AI generation");
      return;
    }

    const totalCount = carouselImages.length + carouselFiles.length;
    if (totalCount >= 10) {
      toast.error("Maximum 10 images reached");
      return;
    }

    setCarouselGenerating(true);

    try {
      const payload = {
        userId: user?.id,
        apiKey: openaiApiKey,
        platforms: platforms,
        typeOfPost: typeOfPost,
        imagePrompt: carouselAiPrompt,
      };

      const response = await fetch("https://n8n.srv1248804.hstgr.cloud/webhook/ai-content-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to generate image");
      }

      const data = await response.json();

      if (data.imageUrl) {
        let finalUrl = data.imageUrl;

        // Convert to JPEG if Instagram carousel
        const needsConversion = typeOfPost === "carousel" && platforms.includes("instagram");
        if (needsConversion) {
          toast.info("Converting AI image to JPEG for Instagram...");
          try {
            const jpegBlob = await convertToJpeg(data.imageUrl);
            finalUrl = URL.createObjectURL(jpegBlob);
          } catch (convError) {
            console.error("JPEG conversion error:", convError);
            toast.warning("Could not convert to JPEG, using original format");
          }
        }

        setCarouselImages([...carouselImages, finalUrl]);
        setCarouselAiPrompt(""); // Clear prompt after successful generation
        toast.success(`Image ${carouselImages.length + 1} generated successfully`);
      } else {
        throw new Error("Invalid response from AI generator");
      }
    } catch (error: any) {
      console.error("AI generation error:", error);
      toast.error(error.message || "Failed to generate image");
    } finally {
      setCarouselGenerating(false);
    }
  };

  const getTotalCarouselCount = () => carouselImages.length + carouselFiles.length;

  // Check if Instagram carousel (requires JPEG only)
  const isInstagramCarousel = typeOfPost === "carousel" && platforms.includes("instagram");

  // Field visibility logic
  const showTextContent = typeOfPost && typeOfPost !== "pdf";
  const showPdfTextContent = typeOfPost === "pdf";
  const showArticleFields = typeOfPost === "article";
  const showMediaUpload = typeOfPost && typeOfPost !== "onlyText" && typeOfPost !== "article" && typeOfPost !== "carousel";
  const showCarouselUpload = typeOfPost === "carousel";
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
                  <div className="flex flex-wrap gap-3">
                    {availablePlatforms.map((platform) => {
                      const isSelected = platforms.includes(platform.toLowerCase());
                      const platformLower = platform.toLowerCase();

                      const getPlatformIcon = () => {
                        switch (platformLower) {
                          case "facebook":
                            return (
                              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#1877F2">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                              </svg>
                            );
                          case "instagram":
                            return (
                              <svg viewBox="0 0 24 24" className="w-8 h-8">
                                <defs>
                                  <linearGradient id="instagram-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#FFDC80" />
                                    <stop offset="25%" stopColor="#FCAF45" />
                                    <stop offset="50%" stopColor="#F77737" />
                                    <stop offset="75%" stopColor="#F56040" />
                                    <stop offset="100%" stopColor="#FD1D1D" />
                                  </linearGradient>
                                  <linearGradient id="instagram-gradient-2" x1="0%" y1="100%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#FFDC80" />
                                    <stop offset="10%" stopColor="#FCAF45" />
                                    <stop offset="30%" stopColor="#F77737" />
                                    <stop offset="60%" stopColor="#C13584" />
                                    <stop offset="100%" stopColor="#833AB4" />
                                  </linearGradient>
                                </defs>
                                <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#instagram-gradient-2)" />
                                <circle cx="12" cy="12" r="4" fill="none" stroke="white" strokeWidth="1.5" />
                                <circle cx="17.5" cy="6.5" r="1.5" fill="white" />
                              </svg>
                            );
                          case "linkedin":
                            return (
                              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#0A66C2">
                                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                              </svg>
                            );
                          case "youtube":
                            return (
                              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#FF0000">
                                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                              </svg>
                            );
                          case "twitter":
                            return (
                              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#000000">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
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
                              ? "border-primary bg-primary/5 shadow-sm"
                              : "border-border hover:border-muted-foreground/50 bg-card"
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

              {/* Platform Account Selectors - Show for each selected platform */}
              {showAccountSelectors && (
                <div className="space-y-4">
                  {platforms.includes("linkedin") && (
                    <PlatformAccountSelector
                      accounts={platformAccounts}
                      selectedAccountIds={selectedAccountIds}
                      onAccountToggle={handleAccountToggle}
                      loading={loadingPlatformAccounts}
                      platform="linkedin"
                    />
                  )}
                  {platforms.includes("facebook") && (
                    <PlatformAccountSelector
                      accounts={platformAccounts}
                      selectedAccountIds={selectedAccountIds}
                      onAccountToggle={handleAccountToggle}
                      loading={loadingPlatformAccounts}
                      platform="facebook"
                    />
                  )}
                  {platforms.includes("instagram") && (
                    <PlatformAccountSelector
                      accounts={platformAccounts}
                      selectedAccountIds={selectedAccountIds}
                      onAccountToggle={handleAccountToggle}
                      loading={loadingPlatformAccounts}
                      platform="instagram"
                    />
                  )}
                  {platforms.includes("youtube") && (
                    <PlatformAccountSelector
                      accounts={platformAccounts}
                      selectedAccountIds={selectedAccountIds}
                      onAccountToggle={handleAccountToggle}
                      loading={loadingPlatformAccounts}
                      platform="youtube"
                    />
                  )}
                  {platforms.includes("twitter") && (
                    <PlatformAccountSelector
                      accounts={platformAccounts}
                      selectedAccountIds={selectedAccountIds}
                      onAccountToggle={handleAccountToggle}
                      loading={loadingPlatformAccounts}
                      platform="twitter"
                    />
                  )}
                </div>
              )}

              {/* Text Content - Show for all except PDF */}
              {showTextContent && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="textContent">Text Content (Optional)</Label>
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
                    id="textContent"
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder="Write your post text..."
                  />
                  <div className="text-xs text-muted-foreground text-right">{textContent.length}/2000</div>
                </div>
              )}

              {/* Article Fields - Show only for article type */}
              {showArticleFields && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <h3 className="font-semibold">Article Fields</h3>

              <div className="space-y-2">
                    <Label htmlFor="articleTitle">Article Title (Optional)</Label>
                    <Input
                      id="articleTitle"
                      value={articleTitle}
                      onChange={(e) => setArticleTitle(e.target.value)}
                      placeholder="Enter title..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="articleDescription">Article Description (Optional)</Label>
                    <Textarea
                      id="articleDescription"
                      value={articleDescription}
                      onChange={(e) => setArticleDescription(e.target.value)}
                      rows={3}
                      placeholder="Enter description..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="articleUrl">Article URL (Optional)</Label>
                    <Input
                      id="articleUrl"
                      type="url"
                      value={articleUrl}
                      onChange={(e) => setArticleUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="articleThumbnail">Upload Thumbnail (Optional)</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openAiModal("image", "articleThumbnail")}
                        className="h-8 gap-1"
                      >
                        <Sparkles className="h-4 w-4" />
                        AI Generate
                      </Button>
                    </div>
                    <Input
                      id="articleThumbnail"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setArticleThumbnailFile(file);
                          setArticleThumbnailUrl(""); // Clear AI URL if file is selected
                        }
                      }}
                    />
                    {(articleThumbnailFile || articleThumbnailUrl) && (
                      <div className="mt-2">
                        <p className="text-sm text-muted-foreground mb-2">Preview:</p>
                        <img
                          src={
                            articleThumbnailUrl ||
                            (articleThumbnailFile ? URL.createObjectURL(articleThumbnailFile) : "")
                          }
                          alt="Article thumbnail preview"
                          className="max-w-xs rounded-lg border"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Media Upload - Show for image, carousel, video, shorts, pdf */}
              {showMediaUpload && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="mediaFile">
                      {getMediaLabel()} <span className="text-destructive">*</span>
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        openAiModal(
                          typeOfPost === "pdf"
                            ? "pdf"
                            : typeOfPost === "video" || typeOfPost === "shorts"
                              ? "video"
                              : "image",
                          "media",
                        )
                      }
                      className="h-8 gap-1"
                    >
                      <Sparkles className="h-4 w-4" />
                      AI Generate
                    </Button>
                  </div>
                  <Input
                    id="mediaFile"
                    type="file"
                    onChange={(e) => {
                      setMediaFile(e.target.files?.[0] || null);
                      // Clear AI URLs when file is selected
                      setImageUrl("");
                      setVideoUrl("");
                      setPdfUrl("");
                    }}
                    accept={
                      typeOfPost === "image"
                        ? "image/*"
                        : typeOfPost === "video" || typeOfPost === "shorts"
                          ? "video/*"
                          : typeOfPost === "pdf"
                            ? "application/pdf"
                            : "*"
                    }
                    required={showMediaUpload && !imageUrl && !videoUrl && !pdfUrl}
                  />
                  {mediaFile && <p className="text-sm text-muted-foreground">Selected: {mediaFile.name}</p>}

                  {/* Media Preview */}
                  {(mediaFile || imageUrl || videoUrl || pdfUrl) && (
                    <div className="mt-3 p-3 border rounded-lg bg-muted/30">
                      <p className="text-sm font-medium mb-2">Preview:</p>

                      {/* Image Preview */}
                      {typeOfPost === "image" && (
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

                      {/* Video Preview */}
                      {(typeOfPost === "video" || typeOfPost === "shorts") && (
                        <>
                          {mediaFile && (
                            <video src={URL.createObjectURL(mediaFile)} controls className="max-h-48 rounded-md" />
                          )}
                          {videoUrl && <video src={videoUrl} controls className="max-h-48 rounded-md" />}
                        </>
                      )}

                      {/* PDF Preview */}
                      {typeOfPost === "pdf" && (
                        <>
                          {mediaFile && (
                            <div className="flex items-center gap-2 p-3 bg-background rounded-md">
                              <div className="text-2xl">📄</div>
                              <div>
                                <p className="text-sm font-medium">{mediaFile.name}</p>
                                <p className="text-xs text-muted-foreground">{(mediaFile.size / 1024).toFixed(2)} KB</p>
                              </div>
                            </div>
                          )}
                          {pdfUrl && (
                            <div className="flex items-center gap-2 p-3 bg-background rounded-md">
                              <div className="text-2xl">📄</div>
                              <div>
                                <p className="text-sm font-medium">AI Generated PDF</p>
                                <a
                                  href={pdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline"
                                >
                                  View PDF
                                </a>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {/* Media Notifications */}
                  {typeOfPost === "video" && platforms.includes("instagram") && (
                    <p className="text-sm text-blue-600">(In Instagram, Now Video is posted as Reel...)</p>
                  )}

                  {typeOfPost === "shorts" && platforms.includes("facebook") && (
                    <p className="text-sm text-blue-600">(In Facebook, Now Reel is posted as Video...)</p>
                  )}
                </div>
              )}

              {/* Carousel Upload - Show only for carousel type */}
              {showCarouselUpload && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>
                      Carousel Images ({getTotalCarouselCount()}/10) <span className="text-destructive">*</span>
                    </Label>
                  </div>

                  {/* AI Generation Section */}
                  <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">AI Generate Images</span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Describe the image you want to generate..."
                        value={carouselAiPrompt}
                        onChange={(e) => setCarouselAiPrompt(e.target.value)}
                        disabled={carouselGenerating || getTotalCarouselCount() >= 10}
                      />
                      <Button
                        type="button"
                        onClick={generateCarouselAiImage}
                        disabled={carouselGenerating || getTotalCarouselCount() >= 10 || !carouselAiPrompt.trim()}
                        className="shrink-0"
                      >
                        {carouselGenerating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Plus className="mr-2 h-4 w-4" />
                            Generate
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Generate images one by one. Each generation adds one image to the carousel.
                    </p>
                  </div>

                  {/* Instagram JPEG Notice */}
                  {isInstagramCarousel && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                      <span className="text-amber-700 dark:text-amber-300">
                        Instagram carousels only support JPEG images. Other formats will be automatically converted.
                      </span>
                    </div>
                  )}

                  {/* File Upload Section */}
                  <div className="space-y-2">
                    <Label htmlFor="carouselFiles">Or Upload Images from Device</Label>
                    <Input
                      id="carouselFiles"
                      type="file"
                      accept={isInstagramCarousel ? "image/jpeg,image/jpg" : "image/*"}
                      multiple
                      onChange={handleCarouselFilesChange}
                      disabled={getTotalCarouselCount() >= 10 || isConverting}
                    />
                    {isConverting && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Converting images to JPEG...
                      </div>
                    )}
                  </div>

                  {/* Preview Grid */}
                  {getTotalCarouselCount() > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Preview:</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {/* AI Generated Images */}
                        {carouselImages.map((url, index) => (
                          <div key={`ai-${index}`} className="relative group">
                            <img
                              src={url}
                              alt={`Carousel image ${index + 1}`}
                              className="w-full h-24 object-cover rounded-lg border"
                            />
                            <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded">
                              AI
                            </div>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => removeCarouselImage(index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                              {index + 1}
                            </div>
                          </div>
                        ))}
                        
                        {/* Uploaded Files */}
                        {carouselFiles.map((file, index) => (
                          <div key={`file-${index}`} className="relative group">
                            <img
                              src={URL.createObjectURL(file)}
                              alt={file.name}
                              className="w-full h-24 object-cover rounded-lg border"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => removeCarouselFile(index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                              {carouselImages.length + index + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {getTotalCarouselCount() === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4 border-2 border-dashed rounded-lg">
                      No images added yet. Generate with AI or upload from your device.
                    </p>
                  )}
                </div>
              )}

              {showPdfTextContent && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="pdfTextContent">Text Content (Optional)</Label>
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
                    id="pdfTextContent"
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder="Write accompanying text for your PDF post..."
                  />
                  <div className="text-xs text-muted-foreground text-right">{textContent.length}/2000</div>
                </div>
              )}

              {/* YouTube Fields - Show when YouTube selected and type is video */}
              {showYoutubeFields && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <h3 className="font-semibold">YouTube Fields</h3>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="youtubeTitle">Video Title (Optional)</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openAiModal("text", "youtubeTitle")}
                        className="h-8 gap-1"
                      >
                        <Sparkles className="h-4 w-4" />
                        AI
                      </Button>
                    </div>
                    <Input
                      id="youtubeTitle"
                      value={youtubeTitle}
                      onChange={(e) => setYoutubeTitle(e.target.value)}
                      placeholder="Enter video title..."
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="youtubeDescription">Video Description (Optional)</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openAiModal("text", "youtubeDescription")}
                        className="h-8 gap-1"
                      >
                        <Sparkles className="h-4 w-4" />
                        AI
                      </Button>
                    </div>
                    <Textarea
                      id="youtubeDescription"
                      value={youtubeDescription}
                      onChange={(e) => setYoutubeDescription(e.target.value)}
                      rows={3}
                      placeholder="Enter video description..."
                    />
                  </div>
                </div>
              )}

              {/* Instagram Fields - Show when Instagram selected */}
              {showInstagramFields && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <h3 className="font-semibold">Instagram Fields</h3>

                  <div className="space-y-2">
                    <Label htmlFor="instagramTags">Instagram Tags</Label>
                    <Input
                      id="instagramTags"
                      value={instagramTags}
                      onChange={(e) => setInstagramTags(e.target.value)}
                      placeholder="Enter username of Instagram profile to tag or mention..."
                    />
                  </div>
                </div>
              )}

              {/* Facebook Fields - Show when Facebook selected */}
              {showFacebookFields && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <h3 className="font-semibold">Facebook Fields</h3>

                  <div className="space-y-2">
                    <Label htmlFor="facebookTags">Facebook Tags</Label>
                    <Input
                      id="facebookTags"
                      value={facebookTags}
                      onChange={(e) => setFacebookTags(e.target.value)}
                      placeholder="Enter URLs of Facebook Profile to tag or mention..."
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

      <AiPromptModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onGenerate={handleAiGenerate}
        fieldType={aiModalField}
        context={{
          userId: user?.id,
          apiKey: openaiApiKey,
          platforms: platforms,
          typeOfPost: typeOfPost,
          title: articleTitle,
          description: articleDescription,
        }}
      />

      <AlertDialog open={showConnectionAlert} onOpenChange={setShowConnectionAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Account Connection Required</AlertDialogTitle>
            <AlertDialogDescription>{alertMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => navigate("/accounts")}>Go to Accounts</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showOpenAIAlert} onOpenChange={setShowOpenAIAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>OpenAI Not Connected</AlertDialogTitle>
            <AlertDialogDescription>
              Please connect your OpenAI account first to use AI generation features.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => navigate("/accounts")}>Go to Accounts</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
