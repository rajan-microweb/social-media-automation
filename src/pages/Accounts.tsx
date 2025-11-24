import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Facebook, Instagram, Linkedin, Twitter } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface SocialAccount {
  id: string;
  platform: string;
  icon: React.ComponentType<{ className?: string }>;
  accountName: string | null;
  isConnected: boolean;
  color: string;
}

export default function Accounts() {
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

  const handleConnect = (accountId: string, platform: string) => {
    toast.success(`Connecting to ${platform}...`);
    // Placeholder for actual connection logic
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
                      onClick={() => handleDisconnect(account.id, account.platform)}
                    >
                      Disconnect
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
