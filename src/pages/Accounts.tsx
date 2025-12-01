import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Facebook, Instagram, Linkedin, Twitter, ShieldAlert, X, Monitor, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Declare global FB SDK type
declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

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
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [fbSdkLoaded, setFbSdkLoaded] = useState(false);
  const [disconnectDialog, setDisconnectDialog] = useState<{ open: boolean; platformName: string | null }>({
    open: false,
    platformName: null,
  });

  // Initialize Facebook SDK
  useEffect(() => {
    // Check if FB SDK is already loaded
    if (window.FB) {
      setFbSdkLoaded(true);
      return;
    }

    // Load Facebook SDK
    window.fbAsyncInit = function () {
      window.FB.init({
        appId: "680667824734498", // Your Facebook App ID
        cookie: true,
        xfbml: true,
        version: "v24.0",
      });
      setFbSdkLoaded(true);
      console.log("Facebook SDK initialized");
    };

    // Load the SDK script
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup if needed
      const existingScript = document.getElementById("facebook-jssdk");
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);

  const platformConfigs: Record<string, PlatformConfig> = {
    linkedin: {
      name: "LinkedIn",
      icon: Linkedin,
      color: "text-[#0A66C2]",
    },
    facebook: {
      name: "Facebook",
      icon: Facebook,
      color: "text-[#1877F2]",
    },
    instagram: {
      name: "Instagram",
      icon: Instagram,
      color: "text-[#E4405F]",
    },
  };

  // Get all LinkedIn IDs from connected accounts
  const getLinkedInIds = (accounts: ConnectedAccount[]): string[] => {
    return accounts
      .filter((acc) => acc.platform === "LinkedIn")
      .map((acc) => acc.accountId);
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

  useEffect(() => {
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

          if ((platformName === "linkedin" || platformName === "facebook") && credentials) {
            // Add personal account if exists
            if (credentials.personal_info) {
              const providerId = credentials.personal_info.linkedin_id || credentials.personal_info.provider_id;
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

            // Add company/page accounts
            if (credentials.company_info && Array.isArray(credentials.company_info)) {
              credentials.company_info.forEach((company: any) => {
                accounts.push({
                  id: `${platformName}-company-${company.company_id}`,
                  platform: config.name,
                  accountId: company.company_id,
                  accountName: company.company_name || (platformName === "facebook" ? "Page" : "Company"),
                  accountType: "company",
                  avatarUrl: company.company_logo || null,
                  platformIcon: config.icon,
                  platformColor: config.color,
                });
              });
            }
          }
        });

        setConnectedAccounts(accounts);

        // Fetch login activity after getting connected accounts
        const linkedInIds = accounts
          .filter((acc) => acc.platform === "LinkedIn")
          .map((acc) => acc.accountId);
        await fetchLoginActivity(linkedInIds);
      }
      setLoading(false);
    };

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
          toast.success("Account connected successfully!");
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Handle Facebook Login
  const handleFacebookConnect = useCallback(() => {
    if (!user?.id) {
      toast.error("Please log in to connect your account");
      return;
    }

    if (!fbSdkLoaded || !window.FB) {
      toast.error("Facebook SDK not loaded. Please try again.");
      return;
    }

    setConnectingPlatform("Facebook");

    window.FB.login(
      async (response: any) => {
        if (response.authResponse) {
          const shortLivedToken = response.authResponse.accessToken;
          console.log("Facebook login successful, exchanging token...");

          try {
            const result = await supabase.functions.invoke("facebook-auth", {
              body: {
                short_lived_token: shortLivedToken,
                user_id: user.id,
              },
            });

            if (result.error) {
              console.error("Facebook auth error:", result.error);
              toast.error("Failed to connect Facebook account");
            } else {
              console.log("Facebook account connected:", result.data);
              toast.success(`Facebook connected! ${result.data?.data?.pages_count || 0} page(s) found.`);
            }
          } catch (error) {
            console.error("Error calling facebook-auth:", error);
            toast.error("Failed to connect Facebook account");
          }
        } else {
          console.log("Facebook login cancelled or failed");
          toast.error("Facebook login was cancelled");
        }
        setConnectingPlatform(null);
      },
      {
        scope: "public_profile,email,pages_show_list,pages_read_engagement,pages_manage_posts",
        return_scopes: true,
      }
    );
  }, [user?.id, fbSdkLoaded]);

  const handleConnect = (platform: string) => {
    if (!user?.id) {
      toast.error("Please log in to connect your account");
      return;
    }

    if (platform === "LinkedIn") {
      const oauthUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=772ig6g3u4jlcp&redirect_uri=https://n8n.srv1044933.hstgr.cloud/webhook/linkedin-callback&state=${user.id}&scope=openid%20profile%20email%20w_member_social%20w_organization_social%20rw_organization_admin%20r_organization_social`;

      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      window.open(oauthUrl, "LinkedIn OAuth", `width=${width},height=${height},left=${left},top=${top}`);
      toast.success("Opening LinkedIn authentication...");
    } else if (platform === "Facebook") {
      handleFacebookConnect();
    } else {
      toast.success(`Connecting to ${platform}...`);
    }
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

  // Get all platform names
  const allPlatforms = Object.values(platformConfigs).map((p) => p.name);

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
                                Connected on {new Date(session.connectedAt).toLocaleDateString("en-US", {
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

        {/* Display accounts grouped by platform */}
        {allPlatforms.map((platformName) => {
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
                    <h2 className="text-xl font-semibold">{platformName}</h2>
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
                    disabled={connectingPlatform === platformName}
                  >
                    {connectingPlatform === platformName ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : platformAccounts.length > 0 ? (
                      "+ Add Account"
                    ) : (
                      "Connect"
                    )}
                  </Button>
                </div>
              </div>

              {platformAccounts.length > 0 ? (
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
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-sm truncate mb-1">{account.accountName}</h3>
                                <Badge variant="secondary" className="text-xs">
                                  {account.accountType === "personal" ? "Personal" : "Company"}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          <Badge
                            variant="secondary"
                            className="w-fit bg-green-500/10 text-green-600 hover:bg-green-500/20"
                          >
                            ✅ Connected
                          </Badge>
                        </CardHeader>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex items-center justify-center py-8">
                    <p className="text-muted-foreground text-sm">
                      No accounts connected. Click "Connect" to add your {platformName} account.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })}

        {/* Disconnect Confirmation Dialog */}
        <AlertDialog open={disconnectDialog.open} onOpenChange={(open) => setDisconnectDialog({ open, platformName: open ? disconnectDialog.platformName : null })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect {disconnectDialog.platformName}?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to disconnect your {disconnectDialog.platformName} account? This will remove all connected accounts for this platform.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDisconnect} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
