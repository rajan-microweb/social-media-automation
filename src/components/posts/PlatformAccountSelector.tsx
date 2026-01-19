import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Linkedin, Facebook, Instagram, Youtube } from "lucide-react";
import { PlatformAccount } from "@/hooks/usePlatformAccounts";

interface PlatformAccountSelectorProps {
  accounts: PlatformAccount[];
  selectedAccountIds: string[];
  onAccountToggle: (accountId: string) => void;
  loading?: boolean;
  platform: string;
}

const getPlatformIcon = (platform: string) => {
  switch (platform) {
    case 'linkedin':
      return <Linkedin className="w-3 h-3 text-white" />;
    case 'facebook':
      return <Facebook className="w-3 h-3 text-white" />;
    case 'instagram':
      return <Instagram className="w-3 h-3 text-white" />;
    case 'youtube':
      return <Youtube className="w-3 h-3 text-white" />;
    case 'twitter':
      return (
        <svg viewBox="0 0 24 24" className="w-3 h-3" fill="white">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      );
    default:
      return null;
  }
};

const getPlatformColor = (platform: string) => {
  switch (platform) {
    case 'linkedin':
      return 'bg-[#0077B5]';
    case 'facebook':
      return 'bg-[#1877F2]';
    case 'instagram':
      return 'bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F77737]';
    case 'youtube':
      return 'bg-[#FF0000]';
    case 'twitter':
      return 'bg-black';
    default:
      return 'bg-muted';
  }
};

const getAccountTypeLabel = (type: PlatformAccount['type']) => {
  switch (type) {
    case 'personal':
      return 'Personal';
    case 'company':
      return 'Company';
    case 'page':
      return 'Page';
    case 'channel':
      return 'Channel';
    default:
      return type;
  }
};

const getPlatformLabel = (platform: string) => {
  switch (platform) {
    case 'linkedin':
      return 'LinkedIn';
    case 'facebook':
      return 'Facebook';
    case 'instagram':
      return 'Instagram';
    case 'youtube':
      return 'YouTube';
    case 'twitter':
      return 'Twitter/X';
    default:
      return platform;
  }
};

export function PlatformAccountSelector({
  accounts,
  selectedAccountIds,
  onAccountToggle,
  loading = false,
  platform,
}: PlatformAccountSelectorProps) {
  const platformAccounts = accounts.filter(a => a.platform === platform);

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading {getPlatformLabel(platform)} accounts...
      </div>
    );
  }

  if (platformAccounts.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Please connect your {getPlatformLabel(platform)} account first from the Accounts page.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>
        {getPlatformLabel(platform)} Accounts <span className="text-destructive">*</span>
      </Label>
      <div className="space-y-2">
        {platformAccounts.map((account) => (
          <div key={`${account.platform}-${account.id}`} className="flex items-center space-x-2">
            <Checkbox
              id={`${account.platform}-${account.id}`}
              checked={selectedAccountIds.includes(account.id)}
              onCheckedChange={() => onAccountToggle(account.id)}
            />
            <label
              htmlFor={`${account.platform}-${account.id}`}
              className="text-sm cursor-pointer flex items-center gap-2"
            >
              <Avatar className="w-6 h-6">
                <AvatarImage src={account.avatar || undefined} alt={account.name} />
                <AvatarFallback className={getPlatformColor(account.platform)}>
                  {getPlatformIcon(account.platform)}
                </AvatarFallback>
              </Avatar>
              <span>
                {account.name} ({getAccountTypeLabel(account.type)})
              </span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
