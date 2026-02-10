import { useMemo } from "react";

export interface TokenExpirationInfo {
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  accessTokenDaysRemaining: number | null;
  refreshTokenDaysRemaining: number | null;
  accessTokenStatus: "ok" | "warning" | "expiring" | "expired" | "unknown";
  refreshTokenStatus: "ok" | "warning" | "expiring" | "expired" | "unknown";
  needsReconnect: boolean;
  hasExpirationData: boolean;
  displayText: {
    accessToken: string | null;
    refreshToken: string | null;
  };
}

/**
 * Calculates token expiration status from credentials/metadata
 */
export function calculateTokenExpiration(data: Record<string, unknown> | null): TokenExpirationInfo {
  const now = new Date();

  // Extract expiration timestamps (support multiple formats)
  const accessTokenExpiresAt = (data?.expires_at || data?.expiresAt || data?.access_token_expires_at) as string | null;

  const refreshTokenExpiresAt = (data?.refresh_token_expires_at || data?.refreshTokenExpiresAt) as string | null;

  let accessTokenDaysRemaining: number | null = null;
  let refreshTokenDaysRemaining: number | null = null;
  let accessTokenStatus: TokenExpirationInfo["accessTokenStatus"] = "unknown";
  let refreshTokenStatus: TokenExpirationInfo["refreshTokenStatus"] = "unknown";

  // Calculate access token days remaining
  if (accessTokenExpiresAt) {
    const expiresDate = new Date(accessTokenExpiresAt);
    if (!isNaN(expiresDate.getTime())) {
      accessTokenDaysRemaining = Math.floor((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (accessTokenDaysRemaining <= 0) {
        accessTokenStatus = "expired";
      } else if (accessTokenDaysRemaining <= 7) {
        accessTokenStatus = "expiring";
      } else if (accessTokenDaysRemaining <= 14) {
        accessTokenStatus = "warning";
      } else {
        accessTokenStatus = "ok";
      }
    }
  }

  // Calculate refresh token days remaining
  if (refreshTokenExpiresAt) {
    const expiresDate = new Date(refreshTokenExpiresAt);
    if (!isNaN(expiresDate.getTime())) {
      refreshTokenDaysRemaining = Math.floor((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (refreshTokenDaysRemaining <= 0) {
        refreshTokenStatus = "expired";
      } else if (refreshTokenDaysRemaining <= 7) {
        refreshTokenStatus = "expiring";
      } else if (refreshTokenDaysRemaining <= 30) {
        refreshTokenStatus = "warning";
      } else {
        refreshTokenStatus = "ok";
      }
    }
  }

  // Needs reconnect if refresh token is expiring/expired
  const needsReconnect = refreshTokenStatus === "expired" || refreshTokenStatus === "expiring";

  // Check if we have any expiration data
  const hasExpirationData = accessTokenExpiresAt !== null || refreshTokenExpiresAt !== null;

  // Generate display text
  const displayText = {
    accessToken: formatTimeRemaining(accessTokenDaysRemaining, "Expires in"),
    refreshToken: formatTimeRemaining(refreshTokenDaysRemaining, "Expires in"),
  };

  return {
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    accessTokenDaysRemaining,
    refreshTokenDaysRemaining,
    accessTokenStatus,
    refreshTokenStatus,
    needsReconnect,
    hasExpirationData,
    displayText,
  };
}

/**
 * Formats days remaining into a human-readable string
 */
function formatTimeRemaining(days: number | null, prefix: string): string | null {
  if (days === null) return null;

  if (days <= 0) {
    return "Expired";
  } else if (days === 1) {
    return `${prefix} 1 day`;
  } else if (days < 30) {
    return `${prefix} ${days} days`;
  } else if (days < 365) {
    const months = Math.floor(days / 30);
    const remainingDays = days % 30;
    if (remainingDays > 0 && months < 3) {
      return `${prefix} ${months}mo ${remainingDays}d`;
    }
    return `${prefix} ${months} month${months > 1 ? "s" : ""}`;
  } else {
    const years = Math.floor(days / 365);
    const remainingMonths = Math.floor((days % 365) / 30);
    if (remainingMonths > 0) {
      return `${prefix} ${years}y ${remainingMonths}mo`;
    }
    return `${prefix} ${years} year${years > 1 ? "s" : ""}`;
  }
}

/**
 * Hook to get token expiration info with memoization
 */
export function useTokenExpiration(data: Record<string, unknown> | null): TokenExpirationInfo {
  return useMemo(() => calculateTokenExpiration(data), [data]);
}

/**
 * Returns the appropriate badge variant based on token status
 */
export function getTokenStatusBadgeVariant(
  status: TokenExpirationInfo["accessTokenStatus"] | TokenExpirationInfo["refreshTokenStatus"],
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "expired":
    case "expiring":
      return "destructive";
    case "warning":
      return "secondary";
    case "ok":
      return "outline";
    case "unknown":
    default:
      return "default";
  }
}

/**
 * Returns the appropriate color class based on token status
 */
export function getTokenStatusColor(
  status: TokenExpirationInfo["accessTokenStatus"] | TokenExpirationInfo["refreshTokenStatus"],
): string {
  switch (status) {
    case "expired":
      return "text-destructive";
    case "expiring":
      return "text-orange-500";
    case "warning":
      return "text-yellow-600";
    case "ok":
      return "text-green-600";
    case "unknown":
    default:
      return "text-muted-foreground";
  }
}
