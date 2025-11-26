import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Facebook, Instagram, Linkedin, Twitter } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface SocialAccount {
  id: string;
  platform: string;
  icon: React.ComponentType<{ className?: string }>;
  accountName: string | null;
  isConnected: boolean;
  color: string;
}

export default function Accounts() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<SocialAccount[]>([
    {
      id: "1",
      platform: "Facebook",
      icon: Facebook,
      accountName: null,
      isConnected: false,
      color: "text-[#1877F2]",
    },
    {
      id: "2",
      platform: "Instagram",
      icon: Instagram,
      accountName: null,
      isConnected: false,
      color: "text-[#E4405F]",
    },
    {
      id: "3",
      platform: "LinkedIn",
      icon: Linkedin,
      accountName: null,
      isConnected: false,
      color: "text-[#0A66C2]",
    },
    {
      id: "4",
      platform: "Twitter",
      icon: Twitter,
      accountName: null,
      isConnected: false,
      color: "text-[#1DA1F2]",
    },
  ]);

  useEffect(() => {
    const checkExistingIntegrations = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("platform_integrations")
        .select("platform_name")
        .eq("user_id", user.id);

      if (error) {
        console.error("Error fetching integrations:", error);
        return;
      }

      if (data) {
        setAccounts((prev) =>
          prev.map((acc) => {
            const integration = data.find(
              (d) => d.platform_name === acc.platform.toLowerCase()
            );
            return integration
              ? { ...acc, isConnected: true, accountName: `${acc.platform} Account` }
              : acc;
          })
        );
      }
    };

    checkExistingIntegrations();

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
        (payload) => {
          if (payload.new && typeof payload.new === "object" && "platform_name" in payload.new) {
            const platformName = payload.new.platform_name as string;
            setAccounts((prev) =>
              prev.map((acc) =>
                acc.platform.toLowerCase() === platformName
                  ? { ...acc, isConnected: true, accountName: `${acc.platform} Account` }
                  : acc
              )
            );
            toast.success(`${platformName.charAt(0).toUpperCase() + platformName.slice(1)} connected successfully!`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleConnect = (accountId: string, platform: string) => {
    if (platform === "LinkedIn") {
      if (!user?.id) {
        toast.error("Please log in to connect your account");
        return;
      }

      const oauthUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=772ig6g3u4jlcp&redirect_uri=https://n8n.srv1044933.hstgr.cloud/webhook/linkedin-callback&state=${user.id}&scope=openid%20profile%20email%20w_member_social%20w_organization_social%20rw_organization_admin%20r_organization_social`;
      
      // Open OAuth in popup window
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

  const handleDisconnect = (accountId: string, platform: string) => {
    setAccounts((prev) =>
      prev.map((acc) =>
        acc.id === accountId
          ? { ...acc, isConnected: false, accountName: null }
          : acc
      )
    );
    toast.success(`Disconnected from ${platform}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Social Media Accounts</h1>
          <p className="text-muted-foreground mt-2">
            Connect and manage your social media accounts
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {accounts.map((account) => {
            const Icon = account.icon;
            return (
              <Card
                key={account.id}
                className="hover:shadow-lg transition-all duration-300 border-border/50"
              >
                <CardHeader className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <Icon className={`h-8 w-8 ${account.color}`} />
                    </div>
                    {account.isConnected && (
                      <Badge variant="secondary" className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                        Connected
                      </Badge>
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-xl">{account.platform}</CardTitle>
                    <CardDescription className="mt-1">
                      {account.isConnected && account.accountName
                        ? account.accountName
                        : "Not Connected"}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {account.isConnected ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled
                    >
                      ✅ Connected
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => handleConnect(account.id, account.platform)}
                    >
                      Connect
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
