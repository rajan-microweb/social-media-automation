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
import { Sparkles, Linkedin } from "lucide-react";
import { AiPromptModal } from "@/components/AiPromptModal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface LinkedInCredentials {
  personal_info: {
    name: string;
    avatar_url: string;
    linkedin_id: string;
  };
  company_info: Array<{
    company_name: string;
    company_id: string;
    company_logo: string;
  }>;
  access_token: string;
}

interface LinkedInAccount {
  id: string;
  name: string;
  avatar: string;
  type: 'personal' | 'company';
}

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
  const [linkedinAccounts, setLinkedinAccounts] = useState<LinkedInAccount[]>([]);
  const [loadingLinkedInAccounts, setLoadingLinkedInAccounts] = useState(false);
  
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

  // AI-generated URLs
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");

  // Available platforms based on post type
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);

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

  // Reset form when type changes
  useEffect(() => {
    if (typeOfPost) {
      // Update available platforms
      setAvailablePlatforms(PLATFORM_MAP[typeOfPost] || []);
      // Reset selected platforms
      setPlatforms([]);
      setLinkedinAccountType([]);
      setLinkedinAccounts([]);
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

  // Fetch LinkedIn accounts when LinkedIn is selected
  useEffect(() => {
    const fetchLinkedInAccounts = async () => {
      if (!platforms.includes("linkedin") || !user) return;
      
      setLoadingLinkedInAccounts(true);
      try {
        const { data, error } = await supabase.functions.invoke('get-platform-integration', {
          body: { platform_name: 'linkedin', user_id: user.id }
        });

        if (error) throw error;

        if (data?.data && data.data.length > 0) {
          const credentials = data.data[0].credentials as LinkedInCredentials;
          const accounts: LinkedInAccount[] = [];

          // Add personal account
          if (credentials.personal_info) {
            accounts.push({
              id: credentials.personal_info.linkedin_id,
              name: credentials.personal_info.name,
              avatar: credentials.personal_info.avatar_url,
              type: 'personal'
            });
          }

          // Add company accounts
          if (credentials.company_info) {
            credentials.company_info.forEach(company => {
              accounts.push({
                id: company.company_id,
                name: company.company_name,
                avatar: company.company_logo,
                type: 'company'
              });
            });
          }

          setLinkedinAccounts(accounts);
        }
      } catch (error) {
        console.error('Error fetching LinkedIn accounts:', error);
        toast.error("Failed to load LinkedIn accounts");
      } finally {
        setLoadingLinkedInAccounts(false);
      }
    };

    fetchLinkedInAccounts();
  }, [platforms, user]);

  const handlePlatformChange = (platform: string, checked: boolean) => {
    // Check if platform is connected before allowing selection (case-insensitive)
    const isConnected = connectedPlatforms.some(p => p.toLowerCase() === platform.toLowerCase());
    
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

  const handleLinkedinAccountTypeChange = (accountId: string) => {
    if (linkedinAccountType.includes(accountId)) {
      setLinkedinAccountType(linkedinAccountType.filter((id) => id !== accountId));
    } else {
      setLinkedinAccountType([...linkedinAccountType, accountId]);
    }
  };

  const openAiModal = (field: "text" | "image" | "video" | "pdf", target: string) => {
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
      
      // Priority: AI URLs over file uploads
      if (imageUrl || videoUrl || pdfUrl) {
        if (typeOfPost === "image" || typeOfPost === "carousel") {
          uploadedUrl = imageUrl;
        } else if (typeOfPost === "video" || typeOfPost === "shorts") {
          uploadedUrl = videoUrl;
        } else if (typeOfPost === "pdf") {
          uploadedUrl = pdfUrl;
        }
      } else if (mediaFile) {
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

      // Handle article thumbnail upload
      if (typeOfPost === "article") {
        if (articleThumbnailUrl) {
          thumbnailUrl = articleThumbnailUrl;
        } else if (articleThumbnailFile) {
          thumbnailUrl = await uploadFile(articleThumbnailFile, "images");
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
            : typeOfPost === "article"
            ? thumbnailUrl || ""
            : "",
        video:
          typeOfPost === "video" || typeOfPost === "shorts"
            ? uploadedUrl || ""
            : "",
        pdf: typeOfPost === "pdf" ? uploadedUrl || "" : "",
        title: articleTitle || "",
        description: articleDescription || undefined,
        url: articleUrl || undefined,
        tags: [
          youtubeTitle ? `youtube_title:${youtubeTitle}` : "",
          youtubeDescription ? `youtube_description:${youtubeDescription}` : "",
          instagramTags ? `instagram_tags:${instagramTags}` : "",
          facebookTags ? `facebook_tags:${facebookTags}` : "",
        ].filter(Boolean),
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
        title: data.title ?? "",
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
  const showPdfTextContent = typeOfPost === "pdf";
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
                  <div className="flex flex-wrap gap-3">
                    {availablePlatforms.map((platform) => {
                      const isSelected = platforms.includes(platform.toLowerCase());
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
                                  <linearGradient id="instagram-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#FFDC80"/>
                                    <stop offset="25%" stopColor="#FCAF45"/>
                                    <stop offset="50%" stopColor="#F77737"/>
                                    <stop offset="75%" stopColor="#F56040"/>
                                    <stop offset="100%" stopColor="#FD1D1D"/>
                                  </linearGradient>
                                  <linearGradient id="instagram-gradient-2" x1="0%" y1="100%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#FFDC80"/>
                                    <stop offset="10%" stopColor="#FCAF45"/>
                                    <stop offset="30%" stopColor="#F77737"/>
                                    <stop offset="60%" stopColor="#C13584"/>
                                    <stop offset="100%" stopColor="#833AB4"/>
                                  </linearGradient>
                                </defs>
                                <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#instagram-gradient-2)"/>
                                <circle cx="12" cy="12" r="4" fill="none" stroke="white" strokeWidth="1.5"/>
                                <circle cx="17.5" cy="6.5" r="1.5" fill="white"/>
                              </svg>
                            );
                          case 'linkedin':
                            return (
                              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#0A66C2">
                                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                              </svg>
                            );
                          case 'youtube':
                            return (
                              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#FF0000">
                                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                              </svg>
                            );
                          case 'twitter':
                            return (
                              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#000000">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
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

              {/* LinkedIn Account Type - Show when LinkedIn is selected */}
              {showLinkedinAccountType && (
                <div className="space-y-2">
                  <Label>
                    LinkedIn Account Type <span className="text-destructive">*</span>
                  </Label>
                  {loadingLinkedInAccounts ? (
                    <div className="text-sm text-muted-foreground">Loading accounts...</div>
                  ) : linkedinAccounts.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      Please connect your LinkedIn account first from the Accounts page.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {linkedinAccounts.map((account) => (
                        <div key={account.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`li-${account.id}`}
                            checked={linkedinAccountType.includes(account.id)}
                            onCheckedChange={() => handleLinkedinAccountTypeChange(account.id)}
                          />
                          <label htmlFor={`li-${account.id}`} className="text-sm cursor-pointer flex items-center gap-2">
                            <Avatar className="w-6 h-6">
                              <AvatarImage src={account.avatar || undefined} alt={account.name} />
                              <AvatarFallback className="bg-[#0077B5]">
                                <Linkedin className="w-3 h-3 text-white" />
                              </AvatarFallback>
                            </Avatar>
                            <span>{account.name} ({account.type === 'personal' ? 'Personal' : 'Company'})</span>
                          </label>
                        </div>
                      ))}
                    </div>
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
                          src={articleThumbnailUrl || (articleThumbnailFile ? URL.createObjectURL(articleThumbnailFile) : "")}
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
                      onClick={() => openAiModal(
                        typeOfPost === "pdf" ? "pdf" : 
                        (typeOfPost === "video" || typeOfPost === "shorts") ? "video" : "image",
                        "media"
                      )}
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
                      typeOfPost === "image" || typeOfPost === "carousel"
                        ? "image/*"
                        : typeOfPost === "video" || typeOfPost === "shorts"
                        ? "video/*"
                        : typeOfPost === "pdf"
                        ? "application/pdf"
                        : "*"
                    }
                    required={showMediaUpload && !imageUrl && !videoUrl && !pdfUrl}
                  />
                  {mediaFile && (
                    <p className="text-sm text-muted-foreground">
                      Selected: {mediaFile.name}
                    </p>
                  )}
                  
                  {/* Media Preview */}
                  {(mediaFile || imageUrl || videoUrl || pdfUrl) && (
                    <div className="mt-3 p-3 border rounded-lg bg-muted/30">
                      <p className="text-sm font-medium mb-2">Preview:</p>
                      
                      {/* Image Preview */}
                      {(typeOfPost === "image" || typeOfPost === "carousel") && (
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
                      
                      {/* PDF Preview */}
                      {typeOfPost === "pdf" && (
                        <>
                          {mediaFile && (
                            <div className="flex items-center gap-2 p-3 bg-background rounded-md">
                              <div className="text-2xl">📄</div>
                              <div>
                                <p className="text-sm font-medium">{mediaFile.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {(mediaFile.size / 1024).toFixed(2)} KB
                                </p>
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
                  {(typeOfPost === "video") && (platforms.includes("facebook") || platforms.includes("instagram")) && (
                    <p className="text-sm text-blue-600">
                      (In Facebook and Instagram, Video will be posted as Reel)
                    </p>
                  )}
                </div>
              )}

              {/* PDF Text Content - Show only for PDF type */}
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
                  <div className="text-xs text-muted-foreground text-right">
                    {textContent.length}/2000
                  </div>
                </div>
              )}

              {/* YouTube Fields - Show when YouTube selected and type is video */}
              {showYoutubeFields && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <h3 className="font-semibold">YouTube Fields</h3>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="youtubeTitle">
                        Video Title <span className="text-destructive">*</span>
                      </Label>
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
                      required={showYoutubeFields}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="youtubeDescription">
                        Video Description <span className="text-destructive">*</span>
                      </Label>
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

      <AiPromptModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onGenerate={handleAiGenerate}
        fieldType={aiModalField}
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
