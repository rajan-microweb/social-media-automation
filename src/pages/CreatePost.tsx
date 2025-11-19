import { useState } from "react";
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
import { z } from "zod";
import { Sparkles } from "lucide-react";

const postSchema = z.object({
  typeOfPost: z.string().min(1, "Type of post is required"),
  platforms: z.array(z.string()).min(1, "Select at least one platform"),
  textContent: z.string().optional(),
  youtubeTitle: z.string().optional(),
  youtubeDescription: z.string().optional(),
  igTags: z.string().optional(),
  fbTags: z.string().optional(),
  status: z.enum(["draft", "scheduled", "published"]),
  scheduled_at: z.string().optional(),
});

export default function CreatePost() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [typeOfPost, setTypeOfPost] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [showYouTubeFields, setShowYouTubeFields] = useState(false);
  const [showInstagramFields, setShowInstagramFields] = useState(false);
  const [showFacebookFields, setShowFacebookFields] = useState(false);
  const [showLinkedInAccountType, setShowLinkedInAccountType] = useState(false);
  const [linkedInAccountTypes, setLinkedInAccountTypes] = useState<string[]>([]);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiTargetField, setAiTargetField] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);

  const platformOptions = [
    { value: "instagram", label: "Instagram", icon: "📷" },
    { value: "facebook", label: "Facebook", icon: "📘" },
    { value: "linkedin", label: "LinkedIn", icon: "💼" },
    { value: "youtube", label: "YouTube", icon: "📹" },
    { value: "twitter", label: "Twitter", icon: "🐦" },
  ];

  const handlePlatformChange = (platform: string, checked: boolean) => {
    setPlatforms(prev => 
      checked ? [...prev, platform] : prev.filter(p => p !== platform)
    );
    
    if (platform === "youtube") setShowYouTubeFields(checked);
    if (platform === "instagram") setShowInstagramFields(checked);
    if (platform === "facebook") setShowFacebookFields(checked);
    if (platform === "linkedin") setShowLinkedInAccountType(checked);
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
        const targetElement = document.getElementById(aiTargetField) as HTMLTextAreaElement | HTMLInputElement;
        if (targetElement) {
          targetElement.value = data.generatedText;
        }
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
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      typeOfPost: formData.get("typeOfPost") as string,
      platforms,
      textContent: formData.get("textContent") as string,
      youtubeTitle: formData.get("youtubeTitle") as string,
      youtubeDescription: formData.get("youtubeDescription") as string,
      igTags: formData.get("igTags") as string,
      fbTags: formData.get("fbTags") as string,
      status: formData.get("status") as string,
      scheduled_at: formData.get("scheduled_at") as string,
    };

    try {
      postSchema.parse(data);

      const title = data.typeOfPost === "onlyText" 
        ? data.textContent?.substring(0, 100) || "Text Post"
        : data.youtubeTitle || `${data.typeOfPost} Post`;

      const description = data.typeOfPost === "onlyText"
        ? data.textContent
        : data.youtubeDescription || data.textContent;

      const { error } = await supabase.from("posts").insert({
        user_id: user!.id,
        title,
        description: description || null,
        status: data.status,
        scheduled_at: data.scheduled_at || null,
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
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="typeOfPost">Type of Post <span className="text-destructive">*</span></Label>
                <Select name="typeOfPost" value={typeOfPost} onValueChange={setTypeOfPost} required>
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

              {typeOfPost && (
                <div className="space-y-2">
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

              {showLinkedInAccountType && (
                <div className="space-y-2">
                  <Label>LinkedIn Account Type <span className="text-destructive">*</span></Label>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="li-personal"
                        checked={linkedInAccountTypes.includes("personal")}
                        onCheckedChange={(checked) => {
                          setLinkedInAccountTypes(prev =>
                            checked ? [...prev, "personal"] : prev.filter(t => t !== "personal")
                          );
                        }}
                      />
                      <Label htmlFor="li-personal" className="cursor-pointer">Personal</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="li-company"
                        checked={linkedInAccountTypes.includes("company")}
                        onCheckedChange={(checked) => {
                          setLinkedInAccountTypes(prev =>
                            checked ? [...prev, "company"] : prev.filter(t => t !== "company")
                          );
                        }}
                      />
                      <Label htmlFor="li-company" className="cursor-pointer">Company</Label>
                    </div>
                  </div>
                </div>
              )}

              {platforms.length > 0 && (
                <div className="space-y-2 relative">
                  <Label htmlFor="textContent">Text Content (Optional)</Label>
                  <Textarea
                    id="textContent"
                    name="textContent"
                    placeholder="Enter your text content..."
                    rows={5}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-8"
                    onClick={() => openAiModal("textContent")}
                  >
                    <Sparkles className="h-4 w-4 text-primary" />
                  </Button>
                </div>
              )}

              {showYouTubeFields && (
                <div className="space-y-4 p-4 border rounded-lg bg-accent/50">
                  <h3 className="font-semibold">YouTube Fields</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="youtubeTitle">Video Title <span className="text-destructive">*</span></Label>
                    <Input
                      id="youtubeTitle"
                      name="youtubeTitle"
                      placeholder="Enter video title..."
                    />
                  </div>

                  <div className="space-y-2 relative">
                    <Label htmlFor="youtubeDescription">Video Description <span className="text-destructive">*</span></Label>
                    <Textarea
                      id="youtubeDescription"
                      name="youtubeDescription"
                      placeholder="Enter video description..."
                      rows={3}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-8"
                      onClick={() => openAiModal("youtubeDescription")}
                    >
                      <Sparkles className="h-4 w-4 text-primary" />
                    </Button>
                  </div>
                </div>
              )}

              {showInstagramFields && (
                <div className="space-y-2 p-4 border rounded-lg bg-accent/50">
                  <h3 className="font-semibold">Instagram Fields</h3>
                  <Label htmlFor="igTags">Instagram Tags</Label>
                  <Input
                    id="igTags"
                    name="igTags"
                    placeholder="Enter username to tag or mention..."
                  />
                </div>
              )}

              {showFacebookFields && (
                <div className="space-y-2 p-4 border rounded-lg bg-accent/50">
                  <h3 className="font-semibold">Facebook Fields</h3>
                  <Label htmlFor="fbTags">Facebook Tags</Label>
                  <Input
                    id="fbTags"
                    name="fbTags"
                    placeholder="Enter URLs of Facebook Profile to tag..."
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select name="status" defaultValue="draft">
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
                <Label htmlFor="scheduled_at">Schedule Date (Optional)</Label>
                <Input
                  id="scheduled_at"
                  name="scheduled_at"
                  type="datetime-local"
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {loading ? "Creating..." : "Create Post"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/posts")}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

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
            <Button variant="outline" onClick={() => setAiModalOpen(false)} disabled={aiLoading}>
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
