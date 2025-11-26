import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Facebook, Instagram, Linkedin, Twitter } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ConnectedAccount {
  id: string;
  platform: string;
  accountId: string;
  accountName: string;
  accountType: 'personal' | 'company';
  avatarUrl: string | null;
  platformIcon: React.ComponentType<{ className?: string }>;
  platformColor: string;
}

interface PlatformConfig {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

export default function Accounts() {
  const { user } = useAuth();
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);

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
    twitter: {
      name: "Twitter",
      icon: Twitter,
      color: "text-[#1DA1F2]",
    },
  };

  useEffect(() => {
    const fetchConnectedAccounts = async () => {
      const { data: { user } } = await supabase.auth.getUser();
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

          if (platformName === "linkedin" && credentials) {
            // Add personal account if exists
            if (credentials.personal_info) {
              accounts.push({
                id: `${platformName}-personal-${credentials.personal_info.sub}`,
                platform: config.name,
                accountId: credentials.personal_info.sub,
                accountName: credentials.personal_info.name || "LinkedIn User",
                accountType: "personal",
                avatarUrl: credentials.personal_info.picture || null,
                platformIcon: config.icon,
                platformColor: config.color,
              });
            }

            // Add company accounts
            if (credentials.company_info && Array.isArray(credentials.company_info)) {
              credentials.company_info.forEach((company: any) => {
                accounts.push({
                  id: `${platformName}-company-${company.id}`,
                  platform: config.name,
                  accountId: company.id,
                  accountName: company.localizedName || company.name || "Company",
                  accountType: "company",
                  avatarUrl: company.logoUrl || null,
                  platformIcon: config.icon,
                  platformColor: config.color,
                });
              });
            }
          }
          // Add similar parsing for other platforms if needed in the future
        });

        setConnectedAccounts(accounts);
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleConnect = (platform: string) => {
    if (platform === "LinkedIn") {
      if (!user?.id) {
        toast.error("Please log in to connect your account");
        return;
      }

      const oauthUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=772ig6g3u4jlcp&redirect_uri=https://n8n.srv1044933.hstgr.cloud/webhook/linkedin-callback&state=${user.id}&scope=openid%20profile%20email%20w_member_social%20w_organization_social%20rw_organization_admin%20r_organization_social`;
      
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      window.open(
        oauthUrl,
        "LinkedIn OAuth",
        `width=${width},height=${height},left=${left},top=${top}`
      );
      
      toast.success("Opening LinkedIn authentication...");
    } else {
      toast.success(`Connecting to ${platform}...`);
    }
  };

  const handleDisconnect = async (platformName: string) => {
    if (!user?.id) {
      toast.error("Please log in to disconnect your account");
      return;
    }

    try {
      const platformKey = Object.keys(platformConfigs).find(
        key => platformConfigs[key].name === platformName
      );

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
    }
  };

  // Group accounts by platform
  const accountsByPlatform = connectedAccounts.reduce((acc, account) => {
    if (!acc[account.platform]) {
      acc[account.platform] = [];
    }
    acc[account.platform].push(account);
    return acc;
  }, {} as Record<string, ConnectedAccount[]>);

  // Get all platform names
  const allPlatforms = Object.values(platformConfigs).map(p => p.name);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Social Media Accounts</h1>
            <p className="text-muted-foreground mt-2">
              Connect and manage your social media accounts
            </p>
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
          <p className="text-muted-foreground mt-2">
            Connect and manage your social media accounts
          </p>
        </div>

        {/* Display accounts grouped by platform */}
        {allPlatforms.map((platformName) => {
          const platformKey = Object.keys(platformConfigs).find(
            key => platformConfigs[key].name === platformName
          );
          const config = platformKey ? platformConfigs[platformKey] : null;
          const platformAccounts = accountsByPlatform[platformName] || [];
          const Icon = config?.icon || Linkedin;

          return (
            <div key={platformName} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted/50">
                    <Icon className={`h-6 w-6 ${config?.color || 'text-foreground'}`} />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">{platformName}</h2>
                    <p className="text-sm text-muted-foreground">
                      {platformAccounts.length > 0 
                        ? `${platformAccounts.length} account${platformAccounts.length > 1 ? 's' : ''} connected`
                        : 'Not connected'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {platformAccounts.length > 0 && (
                    <Button
                      variant="destructive"
                      onClick={() => handleDisconnect(platformName)}
                    >
                      Disconnect
                    </Button>
                  )}
                  <Button
                    variant={platformAccounts.length > 0 ? "outline" : "default"}
                    onClick={() => handleConnect(platformName)}
                  >
                    {platformAccounts.length > 0 ? '+ Add Account' : 'Connect'}
                  </Button>
                </div>
              </div>

              {platformAccounts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {platformAccounts.map((account) => {
                    const AccountIcon = account.platformIcon;
                    return (
                      <Card
                        key={account.id}
                        className="hover:shadow-lg transition-all duration-300 border-border/50"
                      >
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
                                <h3 className="font-semibold text-sm truncate mb-1">
                                  {account.accountName}
                                </h3>
                                <Badge 
                                  variant="secondary" 
                                  className="text-xs"
                                >
                                  {account.accountType === 'personal' ? 'Personal' : 'Company'}
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
      </div>
    </DashboardLayout>
  );
}
