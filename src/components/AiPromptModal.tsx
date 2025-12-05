import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AiContext {
  userId?: string;
  apiKey?: string;
  platforms?: string[];
  typeOfPost?: string;
  typeOfStory?: string;
  title?: string;
  description?: string;
}

interface AiPromptModalProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (content: string) => void;
  fieldType: "text" | "image" | "video" | "pdf";
  title?: string;
  context?: AiContext;
}

export function AiPromptModal({
  open,
  onClose,
  onGenerate,
  fieldType,
  title = "AI Content Generator",
  context
}: AiPromptModalProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    setLoading(true);

    try {
      // Build payload with prompt and context
      const payload: Record<string, any> = {
        // Always include context fields
        userId: context?.userId,
        apiKey: context?.apiKey,
        platforms: context?.platforms,
        typeOfPost: context?.typeOfPost,
        typeOfStory: context?.typeOfStory,
        title: context?.title,
        description: context?.description,
      };
      
      // Add the prompt based on field type
      if (fieldType === "text") {
        payload.textPrompt = prompt;
      } else if (fieldType === "image") {
        payload.imagePrompt = prompt;
      } else if (fieldType === "video") {
        payload.videoPrompt = prompt;
      } else if (fieldType === "pdf") {
        payload.pdfPrompt = prompt;
      }

      const response = await fetch(
        "https://n8n.srv1044933.hstgr.cloud/webhook/ai-content-generator",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        throw new Error("Failed to generate content");
      }

      const data = await response.json();

      // Handle different response types
      if (fieldType === "text" && data.text) {
        onGenerate(data.text);
        toast.success("Text generated successfully");
      } else if (fieldType === "image" && data.imageUrl) {
        onGenerate(data.imageUrl);
        toast.success("Image generated successfully");
      } else if (fieldType === "video" && data.videoUrl) {
        onGenerate(data.videoUrl);
        toast.success("Video generated successfully");
      } else if (fieldType === "pdf" && data.pdfUrl) {
        onGenerate(data.pdfUrl);
        toast.success("PDF generated successfully");
      } else {
        throw new Error("Invalid response from AI generator");
      }

      setPrompt("");
      onClose();
    } catch (error: any) {
      console.error("AI generation error:", error);
      toast.error(error.message || "Failed to generate content");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setPrompt("");
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-prompt">Enter your prompt</Label>
            <Textarea
              id="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Describe what you want to generate..."
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}