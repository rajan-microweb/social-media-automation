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
import { ExternalLink, Info, CheckCircle2, ArrowRight } from "lucide-react";
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

interface InstructionStep {
  text: string;
  link?: string;
  linkText?: string;
}

interface PlatformDocConfig {
  fields: PlatformFieldConfig[];
  steps: InstructionStep[];
  docUrl: string;
  docLabel: string;
}

// Platform-specific configurations with detailed steps and direct links
const platformConfigs: Record<string, PlatformDocConfig> = {
  linkedin: {
    fields: [
      { label: "Access Token", name: "accessToken", placeholder: "Enter your LinkedIn access token", required: true },
      {
        label: "Refresh Token",
        name: "refreshToken",
        placeholder: "Enter your LinkedIn refresh token",
        required: true,
      },
    ],
    steps: [
      {
        text: "Go to the LinkedIn Developer Portal and sign in with your LinkedIn account",
        link: "https://www.linkedin.com/developers/apps",
        linkText: "Open LinkedIn Developer Portal",
      },
      {
        text: "Click 'Create app' to create a new application. Fill in the app name, LinkedIn Page, and logo",
        link: "https://www.linkedin.com/developers/apps/new",
        linkText: "Create New App",
      },
      {
        text: "Once created, go to the 'Auth' tab to find your Client ID and Client Secret",
      },
      {
        text: "Request access to 'Sign In with LinkedIn using OpenID Connect' and 'Share on LinkedIn' products in the 'Products' tab",
      },
      {
        text: "For the Marketing Developer Platform (posting to pages), apply for access under 'Products' → 'Advertising API'",
        link: "https://www.linkedin.com/developers/apps",
        linkText: "Request API Access",
      },
      {
        text: "Add your OAuth 2.0 Redirect URL in the 'Auth' tab (e.g., https://your-domain.com/callback)",
      },
      {
        text: "Generate an access token using OAuth 2.0 flow with scopes: w_member_social, r_liteprofile, rw_organization_admin",
      },
      {
        text: "If available, also generate a refresh token to automatically renew your access when it expires (access tokens expire in 60 days)",
      },
    ],
    docUrl: "https://learn.microsoft.com/en-us/linkedin/marketing/",
    docLabel: "LinkedIn Marketing API Docs",
  },
  facebook: {
    fields: [
      { label: "App ID", name: "appId", placeholder: "Your Facebook App ID", required: true },
      {
        label: "App Secret",
        name: "appSecret",
        type: "password",
        placeholder: "Your Facebook App Secret",
        required: true,
      },
      { label: "Access Token", name: "accessToken", placeholder: "Page or User access token", required: true },
    ],
    steps: [
      {
        text: "Go to Meta for Developers and log in with your Facebook account",
        link: "https://developers.facebook.com/",
        linkText: "Open Meta for Developers",
      },
      {
        text: "Click 'My Apps' in the top right, then 'Create App'",
        link: "https://developers.facebook.com/apps/create/",
        linkText: "Create New App",
      },
      {
        text: "Select 'Business' as the app type and complete the setup wizard",
      },
      {
        text: "Go to App Settings → Basic to find your App ID and App Secret",
        link: "https://developers.facebook.com/apps/",
        linkText: "View Your Apps",
      },
      {
        text: "Add 'Facebook Login' product: Go to 'Add Products' and click 'Set Up' on Facebook Login",
      },
      {
        text: "Configure OAuth settings: Add your redirect URI and enable 'Client OAuth Login'",
      },
      {
        text: "Use the Graph API Explorer to generate an access token with pages_manage_posts and pages_read_engagement permissions",
        link: "https://developers.facebook.com/tools/explorer/",
        linkText: "Open Graph API Explorer",
      },
      {
        text: "For long-lived tokens, exchange your short-lived token using the Access Token Tool",
        link: "https://developers.facebook.com/tools/accesstoken/",
        linkText: "Access Token Tool",
      },
    ],
    docUrl: "https://developers.facebook.com/docs/pages-api/",
    docLabel: "Facebook Pages API Docs",
  },
  instagram: {
    fields: [
      { label: "App ID", name: "appId", placeholder: "Your Instagram App ID", required: true },
      {
        label: "App Secret",
        name: "appSecret",
        type: "password",
        placeholder: "Your Instagram App Secret",
        required: true,
      },
      { label: "Access Token", name: "accessToken", placeholder: "Instagram Graph API access token", required: true },
    ],
    steps: [
      {
        text: "First, ensure you have a Facebook Business Page connected to your Instagram Professional account",
        link: "https://business.facebook.com/",
        linkText: "Open Business Suite",
      },
      {
        text: "Go to Meta for Developers and create a new app (or use existing Facebook app)",
        link: "https://developers.facebook.com/apps/",
        linkText: "Open Meta for Developers",
      },
      {
        text: "Add the 'Instagram Graph API' product: Go to 'Add Products' → 'Instagram Graph API' → 'Set Up'",
      },
      {
        text: "Go to App Settings → Basic to find your App ID and App Secret",
      },
      {
        text: "Connect your Instagram account: Go to 'Instagram Graph API' → 'Add Instagram Tester' or use Facebook Login",
      },
      {
        text: "Generate an access token using Graph API Explorer with instagram_basic, instagram_content_publish, and pages_show_list permissions",
        link: "https://developers.facebook.com/tools/explorer/",
        linkText: "Open Graph API Explorer",
      },
      {
        text: "Convert to long-lived token: Exchange your token using the Access Token Debugger and Token Extension endpoint",
        link: "https://developers.facebook.com/tools/debug/accesstoken/",
        linkText: "Access Token Debugger",
      },
    ],
    docUrl: "https://developers.facebook.com/docs/instagram-api/",
    docLabel: "Instagram Graph API Docs",
  },
  threads: {
    fields: [
      { label: "App ID", name: "appId", placeholder: "Your Threads App ID", required: true },
      {
        label: "App Secret",
        name: "appSecret",
        type: "password",
        placeholder: "Your Threads App Secret",
        required: true,
      },
      { label: "Access Token", name: "accessToken", placeholder: "Threads API access token", required: true },
    ],
    steps: [
      {
        text: "Go to Meta for Developers portal and sign in",
        link: "https://developers.facebook.com/",
        linkText: "Open Meta for Developers",
      },
      {
        text: "Create a new app or open your existing Instagram/Facebook app",
        link: "https://developers.facebook.com/apps/",
        linkText: "View Your Apps",
      },
      {
        text: "Add the Threads API product: Go to 'Add Products' → find 'Threads API' → click 'Set Up'",
      },
      {
        text: "Configure Threads settings: Add your redirect URI and enable required permissions",
      },
      {
        text: "Request permissions: threads_basic (read profile), threads_content_publish (post content)",
      },
      {
        text: "Generate an access token using the Threads API with OAuth 2.0 authorization flow",
      },
      {
        text: "Test your integration using the Threads API endpoints before going live",
        link: "https://developers.facebook.com/docs/threads/",
        linkText: "View Threads API Docs",
      },
    ],
    docUrl: "https://developers.facebook.com/docs/threads/",
    docLabel: "Threads API Documentation",
  },
  twitter: {
    fields: [
      { label: "API Key (Consumer Key)", name: "apiKey", placeholder: "Your Twitter API Key", required: true },
      {
        label: "API Secret (Consumer Secret)",
        name: "apiSecret",
        type: "password",
        placeholder: "Your Twitter API Secret",
        required: true,
      },
      { label: "Access Token", name: "accessToken", placeholder: "Your access token", required: true },
      {
        label: "Access Token Secret",
        name: "accessTokenSecret",
        type: "password",
        placeholder: "Your access token secret",
        required: true,
      },
    ],
    steps: [
      {
        text: "Go to the Twitter/X Developer Portal and sign in with your Twitter account",
        link: "https://developer.twitter.com/en/portal/dashboard",
        linkText: "Open Developer Portal",
      },
      {
        text: "Create a new Project: Click 'Projects & Apps' → '+ New Project'. Name your project and select a use case",
        link: "https://developer.twitter.com/en/portal/projects/new",
        linkText: "Create New Project",
      },
      {
        text: "Create an App within your project: After creating the project, you'll be prompted to create an app",
      },
      {
        text: "Set up User Authentication: Go to your App → 'Settings' → 'User authentication settings' → 'Set up'",
      },
      {
        text: "Enable OAuth 1.0a with 'Read and Write' permissions. Add your callback URL",
      },
      {
        text: "Get API Keys: Go to 'Keys and tokens' tab → Under 'Consumer Keys', click 'Regenerate' to get your API Key and Secret",
      },
      {
        text: "Generate Access Token: Under 'Authentication Tokens', click 'Generate' to get Access Token and Access Token Secret",
      },
      {
        text: "IMPORTANT: Make sure to save all 4 credentials immediately - the secrets are only shown once!",
      },
    ],
    docUrl: "https://developer.x.com/en/docs/twitter-api",
    docLabel: "Twitter/X API Documentation",
  },
  youtube: {
    fields: [
      { label: "Client ID", name: "clientId", placeholder: "Your Google/YouTube Client ID", required: true },
      {
        label: "Client Secret",
        name: "clientSecret",
        type: "password",
        placeholder: "Your Google/YouTube Client Secret",
        required: true,
      },
      { label: "Access Token", name: "accessToken", placeholder: "Your YouTube access token", required: true },
      {
        label: "Refresh Token",
        name: "refreshToken",
        type: "password",
        placeholder: "Your YouTube refresh token",
        required: true,
      },
    ],
    steps: [
      {
        text: "Go to Google Cloud Console and create a new project or select an existing one",
        link: "https://console.cloud.google.com/",
        linkText: "Open Google Cloud Console",
      },
      {
        text: "Enable the YouTube Data API v3: Go to 'APIs & Services' → 'Library' → Search for 'YouTube Data API v3' → Click 'Enable'",
        link: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
        linkText: "Enable YouTube API",
      },
      {
        text: "Create OAuth credentials: Go to 'APIs & Services' → 'Credentials' → '+ Create Credentials' → 'OAuth client ID'",
        link: "https://console.cloud.google.com/apis/credentials",
        linkText: "Create Credentials",
      },
      {
        text: "Configure OAuth consent screen if prompted: Add app name, user support email, and developer contact",
      },
      {
        text: "Select 'Web application' as the application type. Add your n8n webhook URL as an Authorized redirect URI",
      },
      {
        text: "Copy the Client ID and Client Secret after creation",
      },
      {
        text: "Use n8n OAuth2 node to complete the authorization flow: Configure with Client ID, Client Secret, and scopes (youtube.upload, youtube.readonly)",
      },
      {
        text: "After successful OAuth flow in n8n, copy the Access Token and Refresh Token from the n8n credential",
      },
    ],
    docUrl: "https://developers.google.com/youtube/v3/getting-started",
    docLabel: "YouTube Data API Docs",
  },
  openai: {
    fields: [{ label: "API Key", name: "apiKey", type: "password", placeholder: "sk-...", required: true }],
    steps: [
      {
        text: "Go to the OpenAI Platform and sign in (or create an account if you don't have one)",
        link: "https://platform.openai.com/",
        linkText: "Open OpenAI Platform",
      },
      {
        text: "Navigate to the API Keys section in your account settings",
        link: "https://platform.openai.com/api-keys",
        linkText: "Go to API Keys",
      },
      {
        text: "Click '+ Create new secret key' to generate a new API key",
      },
      {
        text: "Give your key a descriptive name (e.g., 'SMA Integration') and set permissions",
      },
      {
        text: "Copy the API key immediately - it won't be shown again! Keys start with 'sk-'",
      },
      {
        text: "Make sure you have billing set up: Go to Settings → Billing to add a payment method",
        link: "https://platform.openai.com/settings/organization/billing/overview",
        linkText: "Set Up Billing",
      },
      {
        text: "Check your usage limits: You can set spending limits to control costs",
        link: "https://platform.openai.com/settings/organization/limits",
        linkText: "View Usage Limits",
      },
    ],
    docUrl: "https://platform.openai.com/docs/api-reference",
    docLabel: "OpenAI API Reference",
  },
};

// Zod schemas for platform-specific validation
const createValidationSchema = (platform: string) => {
  const config = platformConfigs[platform.toLowerCase()];
  if (!config) return z.object({});

  const schemaFields: Record<string, z.ZodString | z.ZodOptional<z.ZodString>> = {};
  config.fields.forEach((field) => {
    if (field.required) {
      schemaFields[field.name] = z.string().min(1, `${field.label} is required`);
    } else {
      schemaFields[field.name] = z.string().optional();
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

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      onSubmit(form);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">Connect {platform}</DialogTitle>
          <DialogDescription>
            Follow the detailed steps to obtain your credentials, then enter them to connect.
          </DialogDescription>
        </DialogHeader>

        {config ? (
          <form onSubmit={handleSubmit}>
            {/* 3-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left column - reserved for future use */}
              {/* <div className="hidden lg:block" /> */}

              {/* Center column - Credential form */}
              <div className="space-y-5">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Enter your credentials
                </h4>

                {errors.general && <p className="text-sm text-destructive">{errors.general}</p>}

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
                    {errors[field.name] && <p className="text-xs text-destructive mt-1">{errors[field.name]}</p>}
                  </div>
                ))}

                <DialogFooter className="pt-4 flex-col sm:flex-row gap-2">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isSubmitting} className="w-full sm:w-auto">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                    {isSubmitting ? "Connecting..." : "Connect"}
                  </Button>
                </DialogFooter>
              </div>

              {/* Right column - Instructions */}
              <div className="space-y-4 border-l border-border pl-6">
                <h4 className="text-sm font-semibold text-foreground">Step-by-step instructions:</h4>

                <ol className="space-y-3">
                  {config.steps.map((step, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold mt-0.5">
                        {index + 1}
                      </span>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm text-muted-foreground leading-relaxed">{step.text}</p>
                        {step.link && (
                          <a
                            href={step.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <ArrowRight className="h-3 w-3" />
                            {step.linkText || "Open Link"}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>

                {/* Documentation Link */}
                <Alert className="bg-primary/5 border-primary/20 mt-4">
                  <Info className="h-4 w-4 text-primary" />
                  <AlertDescription>
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
              </div>
            </div>
          </form>
        ) : (
          <div className="py-8 text-center text-muted-foreground">Platform configuration not found.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
