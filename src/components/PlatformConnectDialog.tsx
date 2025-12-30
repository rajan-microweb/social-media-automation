import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, Info, CheckCircle2 } from "lucide-react";
import { z } from "zod";

interface PlatformConnectDialogProps {
  open: boolean;
  platform: string | null;
  onClose: () => void;
  onSubmit: (fields: Record<string, string>) => void;
}

interface PlatformFieldConfig {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}

interface PlatformDocConfig {
  fields: PlatformFieldConfig[];
  steps: string[];
  docUrl: string;
  docLabel: string;
}

// Platform-specific configurations with steps and documentation
const platformConfigs: Record<string, PlatformDocConfig> = {
  linkedin: {
    fields: [
      { label: "Access Token", name: "accessToken", placeholder: "Enter your LinkedIn access token", required: true },
    ],
    steps: [
      "Go to LinkedIn Developer Portal and create a new app",
      "Request access to the Marketing Developer Platform",
      "Under OAuth 2.0 settings, add your redirect URLs",
      "Generate an access token with required scopes (r_liteprofile, w_member_social)",
      "Copy the access token and paste it below",
    ],
    docUrl: "https://learn.microsoft.com/en-us/linkedin/marketing/",
    docLabel: "LinkedIn Marketing API Documentation",
  },
  facebook: {
    fields: [
      { label: "App ID", name: "appId", placeholder: "Your Facebook App ID", required: true },
      { label: "App Secret", name: "appSecret", type: "password", placeholder: "Your Facebook App Secret", required: true },
      { label: "Access Token", name: "accessToken", placeholder: "Page or User access token", required: true },
    ],
    steps: [
      "Go to Facebook Developers and create a new app",
      "Select 'Business' as the app type",
      "Add the 'Facebook Login' and 'Pages API' products",
      "Navigate to Settings > Basic to find your App ID and App Secret",
      "Use the Graph API Explorer to generate an access token with pages_manage_posts permission",
    ],
    docUrl: "https://developers.facebook.com/docs/pages-api/",
    docLabel: "Facebook Pages API Documentation",
  },
  instagram: {
    fields: [
      { label: "App ID", name: "appId", placeholder: "Your Instagram App ID", required: true },
      { label: "App Secret", name: "appSecret", type: "password", placeholder: "Your Instagram App Secret", required: true },
      { label: "Access Token", name: "accessToken", placeholder: "Instagram Graph API access token", required: true },
    ],
    steps: [
      "Create a Facebook App and add Instagram Basic Display or Instagram Graph API",
      "For Business accounts, connect your Instagram account to a Facebook Page",
      "Configure OAuth settings with your redirect URI",
      "Generate a long-lived access token using the Token Generator",
      "Ensure you have instagram_basic and instagram_content_publish permissions",
    ],
    docUrl: "https://developers.facebook.com/docs/instagram-api/",
    docLabel: "Instagram Graph API Documentation",
  },
  threads: {
    fields: [
      { label: "App ID", name: "appId", placeholder: "Your Threads App ID", required: true },
      { label: "App Secret", name: "appSecret", type: "password", placeholder: "Your Threads App Secret", required: true },
      { label: "Access Token", name: "accessToken", placeholder: "Threads API access token", required: true },
    ],
    steps: [
      "Access the Meta for Developers portal",
      "Create a new app or use your existing Instagram app",
      "Add the Threads API product to your app",
      "Configure permissions: threads_basic, threads_content_publish",
      "Generate an access token and paste it below",
    ],
    docUrl: "https://developers.facebook.com/docs/threads/",
    docLabel: "Threads API Documentation",
  },
  twitter: {
    fields: [
      { label: "API Key", name: "apiKey", placeholder: "Your Twitter API Key", required: true },
      { label: "API Secret", name: "apiSecret", type: "password", placeholder: "Your Twitter API Secret", required: true },
      { label: "Access Token", name: "accessToken", placeholder: "Your access token", required: true },
      { label: "Access Token Secret", name: "accessTokenSecret", type: "password", placeholder: "Your access token secret", required: true },
    ],
    steps: [
      "Go to the Twitter Developer Portal and create a project",
      "Create a new App within your project",
      "Navigate to 'Keys and Tokens' section",
      "Generate API Key and Secret (Consumer Keys)",
      "Generate Access Token and Secret with Read and Write permissions",
    ],
    docUrl: "https://developer.x.com/en/docs/twitter-api",
    docLabel: "Twitter/X API Documentation",
  },
};

// Zod schemas for platform-specific validation
const createValidationSchema = (platform: string) => {
  const config = platformConfigs[platform.toLowerCase()];
  if (!config) return z.object({});

  const schemaFields: Record<string, z.ZodString> = {};
  config.fields.forEach((field) => {
    if (field.required) {
      schemaFields[field.name] = z.string().min(1, `${field.label} is required`);
    } else {
      schemaFields[field.name] = z.string().optional() as unknown as z.ZodString;
    }
  });

  return z.object(schemaFields);
};

export function PlatformConnectDialog({ open, platform, onClose, onSubmit }: PlatformConnectDialogProps) {
  const config = platform ? platformConfigs[platform.toLowerCase()] : null;
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens/closes or platform changes
  useEffect(() => {
    if (open) {
      setForm({});
      setErrors({});
    }
  }, [open, platform]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = (): boolean => {
    if (!platform) return false;

    const schema = createValidationSchema(platform);
    const result = schema.safeParse(form);

    if (!result.success) {
      const newErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        const path = err.path[0] as string;
        newErrors[path] = err.message;
      });
      setErrors(newErrors);
      return false;
    }

    // Additional JSON structure validation
    try {
      // Ensure we can stringify and parse the credentials
      JSON.parse(JSON.stringify(form));
    } catch {
      setErrors({ general: "Invalid credential format" });
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      // Submit credentials as a single JSON object
      onSubmit(form);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Connect {platform}
          </DialogTitle>
          <DialogDescription>
            Follow the steps below to obtain your credentials, then enter them to connect your {platform} account.
          </DialogDescription>
        </DialogHeader>

        {config ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Documentation Link */}
            <Alert className="bg-primary/5 border-primary/20">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription className="flex items-center justify-between">
                <span className="text-sm">Need help? Check the official documentation</span>
                <a
                  href={config.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {config.docLabel}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </AlertDescription>
            </Alert>

            {/* Steps */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">How to get your credentials:</h4>
              <ol className="space-y-2">
                {config.steps.map((step, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Credential Fields */}
            <div className="space-y-4 pt-2">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Enter your credentials
              </h4>
              
              {errors.general && (
                <p className="text-sm text-destructive">{errors.general}</p>
              )}

              {config.fields.map((field) => (
                <div key={field.name}>
                  <label className="block mb-1.5 text-sm font-medium" htmlFor={field.name}>
                    {field.label}
                    {field.required && <span className="text-destructive ml-0.5">*</span>}
                  </label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type={field.type || "text"}
                    value={form[field.name] || ""}
                    onChange={handleChange}
                    placeholder={field.placeholder}
                    className={errors[field.name] ? "border-destructive" : ""}
                  />
                  {errors[field.name] && (
                    <p className="text-xs text-destructive mt-1">{errors[field.name]}</p>
                  )}
                </div>
              ))}
            </div>

            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Connecting..." : "Connect"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            Platform configuration not found.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
