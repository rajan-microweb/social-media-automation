import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Instagram, Linkedin, Twitter, ShieldAlert, X, Monitor, Brain, Facebook, Youtube } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PlatformConnectDialog } from "@/components/PlatformConnectDialog";

interface ConnectedAccount {
  id: string;
  platform: string;
  accountId: string;
  accountName: string;
  accountType: "personal" | "company";
  avatarUrl: string | null;
  platformIcon: React.ComponentType<{ className?: string }>;
  platformColor: string;
}

interface PlatformConfig {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  isApiKey?: boolean;
}

interface LoginActivitySession {
  userId: string;
  maskedEmail: string;
  connectedAt: string;
  lastUpdated: string;
  matchedAccounts: {
    accountName: string;
    accountType: string;
    linkedinId: string;
  }[];
}

export default function Accounts() {
  const { user } = useAuth();
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loginActivity, setLoginActivity] = useState<LoginActivitySession[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);
  const [disconnectDialog, setDisconnectDialog] = useState<{ open: boolean; platformName: string | null }>({
    open: false,
    platformName: null,
  });

  // State for generic platform connect dialog (including OpenAI)
  const [platformDialog, setPlatformDialog] = useState<{ open: boolean; platform: string | null }>({
    open: false,
    platform: null,
  });

  const platformConfigs: Record<string, PlatformConfig> = {
    linkedin: {
      name: "LinkedIn",
      icon: Linkedin,
      color: "text-[#0A66C2]",
    },
    facebook: {
      name: "Facebook",
      icon: Facebook,
      color: "text-[#1877F3]",
    },
    instagram: {
      name: "Instagram",
      icon: Instagram,
      color: "text-[#E4405F]",
    },
    twitter: {
      name: "Twitter",
      icon: Twitter,
      color: "text-[#1DA1F2]",
    },
    youtube: {
      name: "YouTube",
      icon: Youtube,
      color: "text-[#FF0000]",
    },
    openai: {
      name: "OpenAI",
      icon: Brain,
      color: "text-[#10A37F]",
      isApiKey: true,
    },
  };

  // Get all LinkedIn IDs from connected accounts
  const getLinkedInIds = (accounts: ConnectedAccount[]): string[] => {
    return accounts.filter((acc) => acc.platform === "LinkedIn").map((acc) => acc.accountId);
  };

  // Fetch login activity
  const fetchLoginActivity = async (linkedinIds: string[]) => {
    if (!user?.id || linkedinIds.length === 0) {
      setLoginActivity([]);
      return;
    }

    setLoadingActivity(true);
    try {
      const response = await supabase.functions.invoke("get-login-activity", {
        body: {
          user_id: user.id,
          linkedin_ids: linkedinIds,
        },
      });

      if (response.error) {
        console.error("Error fetching login activity:", response.error);
        return;
      }

      setLoginActivity(response.data?.loginActivity || []);
    } catch (error) {
      console.error("Error fetching login activity:", error);
    } finally {
      setLoadingActivity(false);
    }
  };

  // Revoke access for another session
  const handleRevokeAccess = async (session: LoginActivitySession) => {
    if (!user?.id) return;

    setRevokingSession(session.userId);
    try {
      const linkedinIds = session.matchedAccounts.map((acc) => acc.linkedinId);

      const response = await supabase.functions.invoke("revoke-other-session", {
        body: {
          requesting_user_id: user.id,
          target_user_id: session.userId,
          linkedin_ids: linkedinIds,
        },
      });

      if (response.error) {
        toast.error("Failed to revoke access");
        console.error("Error revoking access:", response.error);
        return;
      }

      toast.success("Access revoked successfully");
      // Refresh login activity
      const linkedInIds = getLinkedInIds(connectedAccounts);
      await fetchLoginActivity(linkedInIds);
    } catch (error) {
      console.error("Error revoking access:", error);
      toast.error("Failed to revoke access");
    } finally {
      setRevokingSession(null);
    }
  };

  const fetchConnectedAccounts = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("platform_integrations")
      .select("platform_name, credentials")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (error) {
      console.error("Error fetching integrations:", error);
      setLoading(false);
      return;
    }

    if (data) {
      const accounts: ConnectedAccount[] = [];

      data.forEach((integration) => {
        const platformName = integration.platform_name.toLowerCase();
        const config = platformConfigs[platformName];

        if (!config) return;

        const credentials = integration.credentials as any;

        // Handle all platforms dynamically based on their credentials structure
        if (credentials) {
          // Add personal account if exists
          if (credentials.personal_info) {
            const providerId =
              credentials.personal_info.linkedin_id ||
              credentials.personal_info.provider_id ||
              credentials.personal_info.user_id ||
              `${platformName}-personal`;
            accounts.push({
              id: `${platformName}-personal-${providerId}`,
              platform: config.name,
              accountId: providerId,
              accountName: credentials.personal_info.name || `${config.name} User`,
              accountType: "personal",
              avatarUrl: credentials.personal_info.avatar_url || null,
              platformIcon: config.icon,
              platformColor: config.color,
            });
          }

          // Add company/page accounts if exists
          if (credentials.company_info && Array.isArray(credentials.company_info)) {
            credentials.company_info.forEach((company: any) => {
              accounts.push({
                id: `${platformName}-company-${company.company_id || company.page_id}`,
                platform: config.name,
                accountId: company.company_id || company.page_id,
                accountName: company.company_name || company.page_name || "Company",
                accountType: "company",
                avatarUrl: company.company_logo || company.page_logo || null,
                platformIcon: config.icon,
                platformColor: config.color,
              });
            });
          }

          // Handle OpenAI - show as connected with masked key
          if (platformName === "openai" && (credentials.api_key || credentials.masked_key)) {
            accounts.push({
              id: `openai-api-${user.id}`,
              platform: config.name,
              accountId: credentials.masked_key || "sk-...****",
              accountName: credentials.masked_key || "API Key Connected",
              accountType: "personal",
              avatarUrl: null,
              platformIcon: config.icon,
              platformColor: config.color,
            });
          }

          // Handle platforms with just access tokens (no personal_info/company_info structure yet)
          if (!credentials.personal_info && !credentials.company_info && platformName !== "openai") {
            if (credentials.access_token || credentials.accessToken) {
              accounts.push({
                id: `${platformName}-connected-${user.id}`,
                platform: config.name,
                accountId: `${platformName}-${user.id}`,
                accountName: `${config.name} Account`,
                accountType: "personal",
                avatarUrl: null,
                platformIcon: config.icon,
                platformColor: config.color,
              });
            }
          }
        }
      });

      setConnectedAccounts(accounts);

      // Fetch login activity after getting connected accounts
      const linkedInIds = accounts.filter((acc) => acc.platform === "LinkedIn").map((acc) => acc.accountId);
      await fetchLoginActivity(linkedInIds);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchConnectedAccounts();

    // Set up realtime subscription
    const channel = supabase
      .channel("platform-integrations-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "platform_integrations",
        },
        () => {
          // Refetch accounts when changes occur
          fetchConnectedAccounts();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleConnect = (platform: string) => {
    if (!user?.id) {
      toast.error("Please log in to connect your account");
      return;
    }

    // Open the platform dialog for all platforms including OpenAI
    setPlatformDialog({ open: true, platform });
  };

  // Handle submit from PlatformConnectDialog
  const handlePlatformDialogSubmit = async (fields: Record<string, string>) => {
    if (!user?.id || !platformDialog.platform) {
      toast.error("User not logged in or platform not specified");
      return;
    }

    // Map display name to key used in DB (lowercase)
    const platformKey =
      Object.keys(platformConfigs).find(
        (key) => platformConfigs[key].name.toLowerCase() === platformDialog.platform?.toLowerCase(),
      ) || platformDialog.platform.toLowerCase();

    // POST credentials to external webhook (same flow for all platforms including OpenAI)
    try {
      const response = await fetch("https://n8n.srv1044933.hstgr.cloud/webhook/fetch-credentials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform_name: platformKey,
          user_id: user.id,
          ...fields,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      toast.success(`${platformDialog.platform} credentials submitted successfully!`);
    } catch (error) {
      console.error("Error submitting credentials:", error);
      toast.error(`Failed to submit credentials: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    setPlatformDialog({ open: false, platform: null });
  };

  const openDisconnectDialog = (platformName: string) => {
    setDisconnectDialog({ open: true, platformName });
  };

  const handleDisconnect = async () => {
    const platformName = disconnectDialog.platformName;
    if (!platformName || !user?.id) {
      toast.error("Please log in to disconnect your account");
      return;
    }

    try {
      const platformKey = Object.keys(platformConfigs).find((key) => platformConfigs[key].name === platformName);

      if (!platformKey) {
        toast.error("Invalid platform");
        return;
      }

      const { error } = await supabase
        .from("platform_integrations")
        .delete()
        .eq("user_id", user.id)
        .eq("platform_name", platformKey);

      if (error) {
        console.error("Error disconnecting platform:", error);
        toast.error("Failed to disconnect platform");
        return;
      }

      toast.success(`${platformName} disconnected successfully`);
    } catch (error) {
      console.error("Error disconnecting platform:", error);
      toast.error("Failed to disconnect platform");
    } finally {
      setDisconnectDialog({ open: false, platformName: null });
    }
  };

  // Group accounts by platform
  const accountsByPlatform = connectedAccounts.reduce(
    (acc, account) => {
      if (!acc[account.platform]) {
        acc[account.platform] = [];
      }
      acc[account.platform].push(account);
      return acc;
    },
    {} as Record<string, ConnectedAccount[]>,
  );

  // Get all platform names (excluding API key platforms for the main list)
  const socialPlatforms = Object.entries(platformConfigs)
    .filter(([_, config]) => !config.isApiKey)
    .map(([_, config]) => config.name);

  // Get API key platforms
  const apiKeyPlatforms = Object.entries(platformConfigs)
    .filter(([_, config]) => config.isApiKey)
    .map(([key, config]) => ({ key, ...config }));

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Social Media Accounts</h1>
            <p className="text-muted-foreground mt-2">Connect and manage your social media accounts</p>
          </div>
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading accounts...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Platform Connect Dialog for all platforms including OpenAI */}
      <PlatformConnectDialog
        open={platformDialog.open}
        platform={platformDialog.platform}
        onClose={() => setPlatformDialog({ open: false, platform: null })}
        onSubmit={handlePlatformDialogSubmit}
      />
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Social Media Accounts</h1>
          <p className="text-muted-foreground mt-2">Connect and manage your social media accounts</p>
        </div>

        {/* Login Activity Alert */}
        {loginActivity.length > 0 && (
          <div className="space-y-4">
            <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
              <ShieldAlert className="h-5 w-5" />
              <AlertTitle className="text-lg font-semibold">Security Alert</AlertTitle>
              <AlertDescription className="mt-2">
                <p className="mb-4">
                  Your connected account(s) are also logged in on {loginActivity.length} other session
                  {loginActivity.length > 1 ? "s" : ""}. If you don't recognize this activity, consider changing your
                  LinkedIn password.
                </p>

                <div className="space-y-3">
                  {loginActivity.map((session, index) => (
                    <Card key={index} className="bg-background/50 border-border">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-muted">
                              <Monitor className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-medium">{session.maskedEmail}</p>
                              <p className="text-sm text-muted-foreground">
                                Connected on{" "}
                                {new Date(session.connectedAt).toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {session.matchedAccounts.map((acc, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    {acc.accountName} ({acc.accountType})
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRevokeAccess(session)}
                            disabled={revokingSession === session.userId}
                          >
                            {revokingSession === session.userId ? "Revoking..." : "Remove Access"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* API Key Integrations Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">AI Integrations</h2>
          {apiKeyPlatforms.map(({ key, name, icon: Icon, color }) => {
            const platformAccounts = accountsByPlatform[name] || [];
            const isConnected = platformAccounts.length > 0;
            const connectedAccount = platformAccounts[0];

            return (
              <div key={key} className="space-y-4">
                {/* Header Row: Same as your current code */}
                <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted/50">
                      <Icon className={`h-6 w-6 ${color}`} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {isConnected ? (
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-green-500" />
                            Connected ({connectedAccount?.accountName || "API Key"})
                          </span>
                        ) : (
                          "Not connected"
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isConnected && (
                      <Button variant="destructive" onClick={() => openDisconnectDialog(name)}>
                        Disconnect
                      </Button>
                    )}
                    <Button variant={isConnected ? "outline" : "default"} onClick={() => handleConnect(name)}>
                      {isConnected ? "Update Key" : "Connect"}
                    </Button>
                  </div>
                </div>
                {/* --- NEW CARD GRID FOR AI --- */}
                {isConnected && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {platformAccounts.map((account) => (
                      <Card key={account.id} className="hover:shadow-lg transition-all duration-300 border-border/50">
                        <CardHeader className="space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                              <Icon className={`h-6 w-6 ${color}`} />
                            </div>
                            <div>
                              <CardTitle className="text-base">{account.accountName}</CardTitle>
                              <Badge variant="secondary" className="mt-1 text-xs bg-green-500/10 text-green-600">
                                API Active
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span className="h-2 w-2 rounded-full bg-green-500" />
                              Connected
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Social Media Platforms Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Social Media Platforms</h2>
          {socialPlatforms.map((platformName) => {
            const platformKey = Object.keys(platformConfigs).find((key) => platformConfigs[key].name === platformName);
            const config = platformKey ? platformConfigs[platformKey] : null;
            const platformAccounts = accountsByPlatform[platformName] || [];
            const Icon = config?.icon || Linkedin;

            return (
              <div key={platformName} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted/50">
                      <Icon className={`h-6 w-6 ${config?.color || "text-foreground"}`} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{platformName}</h3>
                      <p className="text-sm text-muted-foreground">
                        {platformAccounts.length > 0
                          ? `${platformAccounts.length} account${platformAccounts.length > 1 ? "s" : ""} connected`
                          : "Not connected"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {platformAccounts.length > 0 && (
                      <Button variant="destructive" onClick={() => openDisconnectDialog(platformName)}>
                        Disconnect
                      </Button>
                    )}
                    <Button
                      variant={platformAccounts.length > 0 ? "outline" : "default"}
                      onClick={() => handleConnect(platformName)}
                    >
                      {platformAccounts.length > 0 ? "+ Add Account" : "Connect"}
                    </Button>
                  </div>
                </div>

                {platformAccounts.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {platformAccounts.map((account) => {
                      const AccountIcon = account.platformIcon;
                      return (
                        <Card key={account.id} className="hover:shadow-lg transition-all duration-300 border-border/50">
                          <CardHeader className="space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                {account.avatarUrl ? (
                                  <img
                                    src={account.avatarUrl}
                                    alt={account.accountName}
                                    className="h-12 w-12 rounded-full object-cover border-2 border-border"
                                  />
                                ) : (
                                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                                    <AccountIcon className={`h-6 w-6 ${account.platformColor}`} />
                                  </div>
                                )}
                                <div>
                                  <CardTitle className="text-base">{account.accountName}</CardTitle>
                                  <Badge
                                    variant="secondary"
                                    className={`mt-1 text-xs ${
                                      account.accountType === "personal"
                                        ? "bg-blue-500/10 text-blue-600"
                                        : "bg-purple-500/10 text-purple-600"
                                    }`}
                                  >
                                    {account.accountType === "personal" ? "Personal" : "Company"}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span className="h-2 w-2 rounded-full bg-green-500" />
                                Connected
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Disconnect Dialog */}
        <AlertDialog
          open={disconnectDialog.open}
          onOpenChange={(open) => setDisconnectDialog({ open, platformName: null })}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect {disconnectDialog.platformName}?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to disconnect your {disconnectDialog.platformName} account? You will need to
                reconnect to use this platform's features again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDisconnect}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
