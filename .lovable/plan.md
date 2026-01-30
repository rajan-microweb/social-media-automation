
# Implementation Plan: 8 Proxy Edge Functions for Secure API Calls

## Overview

This plan creates 8 new edge functions that act as proxies between n8n workflows and external platform APIs. The key security benefit is that **sensitive API credentials never leave the backend** - n8n only passes non-sensitive identifiers like `user_id` or `integration_id`.

## Architecture Pattern

```text
+-------------+                +------------------+                +---------------+
|   n8n       |  user_id only  |  Proxy Edge      |  decrypted     |  External     |
|  Workflow   | -------------> |  Function        | -------------> |  Platform API |
+-------------+                +------------------+                +---------------+
                                      |
                                      | fetch & decrypt
                                      v
                               +------------------+
                               |  platform_       |
                               |  integrations    |
                               |  (encrypted)     |
                               +------------------+
```

---

## Edge Functions to Create

### 1. proxy-validate-openai

**Purpose:** Validate an OpenAI API key by making a test call

**Input:**
```json
{
  "user_id": "uuid",
  "api_key": "sk-..." // Only during initial validation
}
```

**Process:**
1. Call OpenAI API `GET /v1/models` to validate key
2. If valid, encrypt and store in `platform_integrations`
3. Return success/failure (never return the key)

**Output:**
```json
{
  "success": true,
  "message": "OpenAI API key validated and stored"
}
```

---

### 2. proxy-linkedin-fetch-orgs

**Purpose:** Fetch LinkedIn organizations and profile info using stored credentials

**Input:**
```json
{
  "user_id": "uuid"
}
```

**Process:**
1. Fetch LinkedIn integration from database for user
2. Decrypt credentials (access_token)
3. Call LinkedIn API to fetch profile: `GET /v2/userinfo`
4. Call LinkedIn API to fetch organizations: `GET /v2/organizationAcls`
5. Return combined data (without tokens)

**Output:**
```json
{
  "personal_info": {
    "name": "John Doe",
    "linkedin_id": "abc123",
    "avatar_url": "https://..."
  },
  "organizations": [
    {
      "company_name": "Acme Corp",
      "company_id": "org123",
      "company_logo": "https://..."
    }
  ]
}
```

---

### 3. proxy-facebook-exchange-token

**Purpose:** Exchange short-lived Facebook token for long-lived token internally

**Input:**
```json
{
  "user_id": "uuid",
  "short_lived_token": "EAA..." // One-time input from OAuth callback
}
```

**Process:**
1. Use server-side FB_APP_ID and FB_APP_SECRET (stored as secrets)
2. Call Facebook Graph API to exchange token
3. Encrypt and store long-lived token
4. Return success (never return the token)

**Output:**
```json
{
  "success": true,
  "expires_in": 5184000
}
```

---

### 4. proxy-facebook-fetch-pages

**Purpose:** Fetch Facebook pages using stored credentials

**Input:**
```json
{
  "user_id": "uuid"
}
```

**Process:**
1. Fetch Facebook integration from database
2. Decrypt credentials (access_token)
3. Call Facebook Graph API: `GET /me/accounts`
4. Return pages data (without tokens)

**Output:**
```json
{
  "pages": [
    {
      "id": "page123",
      "name": "My Business Page",
      "access_token_stored": true,
      "category": "Business"
    }
  ]
}
```

---

### 5. proxy-instagram-fetch-accounts

**Purpose:** Fetch Instagram business accounts linked to Facebook pages

**Input:**
```json
{
  "user_id": "uuid"
}
```

**Process:**
1. Fetch Facebook integration from database
2. Decrypt credentials
3. For each Facebook page, call: `GET /{page_id}?fields=instagram_business_account`
4. For each IG account, fetch details: `GET /{ig_id}?fields=id,username,profile_picture_url`
5. Return IG accounts (without tokens)

**Output:**
```json
{
  "accounts": [
    {
      "ig_id": "17841234567890",
      "username": "mybusiness",
      "profile_picture_url": "https://..."
    }
  ]
}
```

---

### 6. proxy-youtube-refresh-token

**Purpose:** Refresh YouTube OAuth access token using stored refresh token

**Input:**
```json
{
  "user_id": "uuid"
}
```

**Process:**
1. Fetch YouTube integration from database
2. Decrypt credentials (refresh_token)
3. Use server-side YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET
4. Call Google OAuth: `POST https://oauth2.googleapis.com/token`
5. Update stored access_token with new value
6. Return success (never return tokens)

**Output:**
```json
{
  "success": true,
  "expires_in": 3600
}
```

---

### 7. proxy-youtube-fetch-channel

**Purpose:** Fetch YouTube channel info using stored credentials

**Input:**
```json
{
  "user_id": "uuid"
}
```

**Process:**
1. Fetch YouTube integration from database
2. Decrypt credentials (access_token)
3. Call YouTube API: `GET /youtube/v3/channels?part=snippet&mine=true`
4. Return channel info (without tokens)

**Output:**
```json
{
  "channel": {
    "id": "UC...",
    "title": "My Channel",
    "customUrl": "@mychannel",
    "thumbnail": "https://..."
  }
}
```

---

### 8. proxy-twitter-fetch-user

**Purpose:** Fetch Twitter user info with OAuth 1.0a signing handled server-side

**Input:**
```json
{
  "user_id": "uuid"
}
```

**Process:**
1. Fetch Twitter integration from database
2. Decrypt credentials (consumer_key, consumer_secret, access_token, access_token_secret)
3. Generate OAuth 1.0a signature server-side
4. Call Twitter API: `GET /2/users/me`
5. Return user info (without tokens)

**Output:**
```json
{
  "user": {
    "id": "12345",
    "username": "myhandle",
    "name": "My Name",
    "profile_image_url": "https://..."
  }
}
```

---

## Required Secrets

Add these secrets to the backend before implementation:

| Secret Name | Purpose |
|-------------|---------|
| `FB_APP_ID` | Facebook App ID for token exchange |
| `FB_APP_SECRET` | Facebook App Secret for token exchange |
| `YOUTUBE_CLIENT_ID` | YouTube OAuth Client ID |
| `YOUTUBE_CLIENT_SECRET` | YouTube OAuth Client Secret |
| `TWITTER_CONSUMER_KEY` | Twitter API Consumer Key |
| `TWITTER_CONSUMER_SECRET` | Twitter API Consumer Secret |

---

## n8n Workflow Changes

### Before (Current - Insecure)

```text
n8n receives webhook -> Fetches credentials from DB -> Passes credentials to API nodes -> Makes API calls with exposed tokens
```

### After (Secure Proxy Pattern)

```text
n8n receives webhook -> Calls proxy edge function with only user_id -> Edge function handles everything internally -> Returns only safe data
```

### Workflow Modifications

#### For LinkedIn Node:
**Before:** HTTP Request node with `Authorization: Bearer {{$json.access_token}}`
**After:** HTTP Request node to `proxy-linkedin-fetch-orgs` with only `user_id`

#### For Facebook Token Exchange:
**Before:** HTTP Request with `client_secret={{$env.FB_APP_SECRET}}`
**After:** HTTP Request to `proxy-facebook-exchange-token` with `user_id` and `short_lived_token`

#### For Facebook Pages:
**Before:** HTTP Request with `access_token={{$json.access_token}}`
**After:** HTTP Request to `proxy-facebook-fetch-pages` with only `user_id`

#### For Instagram Accounts:
**Before:** Multiple HTTP Requests with access tokens in URLs
**After:** HTTP Request to `proxy-instagram-fetch-accounts` with only `user_id`

#### For YouTube:
**Before:** OAuth credential stored in n8n, token refresh in n8n
**After:** HTTP Request to `proxy-youtube-refresh-token` and `proxy-youtube-fetch-channel` with only `user_id`

#### For Twitter:
**Before:** OAuth 1.0a credentials stored in n8n node
**After:** HTTP Request to `proxy-twitter-fetch-user` with only `user_id`

---

## Implementation Sequence

1. **Phase 1:** Create shared helper functions
   - Common auth validation
   - Common credential fetching/decryption
   - Rate limiting

2. **Phase 2:** Implement functions in order of dependency
   1. `proxy-validate-openai` (standalone)
   2. `proxy-facebook-exchange-token` (needed first for FB flow)
   3. `proxy-facebook-fetch-pages` (depends on stored token)
   4. `proxy-instagram-fetch-accounts` (depends on FB pages)
   5. `proxy-linkedin-fetch-orgs` (standalone)
   6. `proxy-youtube-refresh-token` (needed first for YT flow)
   7. `proxy-youtube-fetch-channel` (depends on refreshed token)
   8. `proxy-twitter-fetch-user` (standalone, complex OAuth 1.0a)

3. **Phase 3:** Update `supabase/config.toml` with all new functions

4. **Phase 4:** Test each function independently

---

## Technical Notes

### File Structure
Each function will be created at:
```
supabase/functions/proxy-{name}/index.ts
```

### Common Pattern (Each Function)
```typescript
// 1. CORS headers
// 2. API key authentication (x-api-key)
// 3. Rate limiting
// 4. Fetch integration by user_id + platform_name
// 5. Decrypt credentials using safeDecryptCredentials
// 6. Make external API call
// 7. Return sanitized response (no tokens)
```

### Config.toml Entries
All functions will have:
```toml
[functions.proxy-{name}]
verify_jwt = false
```

---

## Security Benefits

1. **Credentials never in n8n** - Only `user_id` flows through workflows
2. **Credentials never in logs** - n8n logs won't contain sensitive data
3. **Single point of control** - All API calls go through auditable edge functions
4. **App secrets stay server-side** - FB_APP_SECRET, YOUTUBE_CLIENT_SECRET never leave the backend
5. **Encryption at rest** - All credentials stored with AES-256-GCM encryption
