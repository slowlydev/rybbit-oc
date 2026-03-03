# UNLOCKED.md — Rybbit "Unlocked Self-Hosted" Fork Plan

## Goal

Create a patched fork of the Rybbit application that removes the `IS_CLOUD`
feature gates to unlock all the good analytics features (web vitals, session
replay storage, network filters, pages, performance, uptime monitoring) for
self-hosted deployments — while stripping out all SaaS service dependencies
(Stripe, Resend, Twilio, AppSumo, Turnstile, Rewardful).

S3-compatible object storage remains as an optional, user-provided integration
(e.g. MinIO, Garage, or any S3-compatible endpoint).

The result is a set of custom Docker images referenced by the Helm chart.

---

## Architecture Overview

```
Upstream Rybbit (CLOUD=false)          This Fork (unlocked)
─────────────────────────────          ────────────────────
Web Vitals:        hidden              Web Vitals:        enabled
Pages tab:         hidden              Pages tab:         enabled
Performance tab:   hidden              Performance tab:   enabled
Network filters:   hidden              Network filters:   enabled
Session Replay:    inline in CH        Session Replay:    S3 if configured, else inline
Uptime monitoring: local only          Uptime monitoring: global regions
Site/member limits: unlimited          Site/member limits: unlimited
Subscription:      N/A                 Subscription:      N/A (no billing)
Stripe:            N/A                 Stripe:            removed entirely
Resend email:      N/A                 Resend email:      removed entirely
Twilio SMS:        N/A                 Twilio SMS:        removed entirely
AppSumo:           N/A                 AppSumo:           removed entirely
Turnstile CAPTCHA: N/A                 Turnstile CAPTCHA: removed entirely
Google/GitHub OAuth: N/A               Google/GitHub OAuth: removed
```

---

## Strategy

Rather than setting `CLOUD=true` and fighting every SaaS integration, we
introduce a **new constant** `IS_UNLOCKED` that replaces `IS_CLOUD` in feature
gates that unlock analytics capabilities, while dead-code-eliminating all
SaaS-dependent code paths.

```ts
// lib/const.ts (server)
export const IS_UNLOCKED = true;  // Always true in this fork
export const IS_CLOUD = false;    // Always false — no SaaS services

// lib/const.ts (client)
export const IS_UNLOCKED = true;
export const IS_CLOUD = false;
```

Every `IS_CLOUD` check in the codebase falls into one of three buckets:

1. **Feature unlock** — change to `IS_UNLOCKED` (always true)
2. **SaaS dependency** — remove the code block entirely or leave gated behind
   `IS_CLOUD` (always false, so it becomes dead code)
3. **Needs rework** — rewrite to remove subscription/billing logic

---

## Detailed Change Plan

### Phase 1: Constants & Build Configuration

#### Server: `server/src/lib/const.ts`

```diff
+export const IS_UNLOCKED = true;
 export const IS_CLOUD = process.env.CLOUD === "true";
```

`IS_CLOUD` stays defined but will be `false` (we never set `CLOUD=true`).
`IS_UNLOCKED` is the new gate for unlocked features.

#### Client: `client/src/lib/const.ts`

```diff
+export const IS_UNLOCKED = true;
 export const IS_CLOUD = process.env.NEXT_PUBLIC_CLOUD === "true";
```

Same approach. `NEXT_PUBLIC_CLOUD` is never set, so `IS_CLOUD` stays false.

#### Client Dockerfile: build args

Remove `NEXT_PUBLIC_CLOUD` from build args entirely. It is never needed.

---

### Phase 2: Server — Unlock Features (change `IS_CLOUD` to `IS_UNLOCKED`)

These are the places where `IS_CLOUD` gates a genuinely useful feature that we
want enabled. Change the condition from `IS_CLOUD` to `IS_UNLOCKED`.

| File | Line(s) | What it gates | Change |
|------|---------|---------------|--------|
| `db/clickhouse/clickhouse.ts` | 67 | Network enrichment columns (company, ASN, VPN, crawler, datacenter) in events table | `IS_CLOUD` -> `IS_UNLOCKED` |
| `db/clickhouse/clickhouse.ts` | 218 | Hourly events materialized view (usage tracking optimization) | `IS_CLOUD` -> `IS_UNLOCKED` |
| `db/geolocation/geolocation.ts` | 240 | Enhanced geolocation via IPAPI (VPN, company, ASN enrichment) | See Phase 4 |
| `services/storage/r2StorageService.ts` | 23 | R2/S3 session replay storage | See Phase 4 |
| `api/user/createApiKey.ts` | 36 | API key rate limiting | `IS_CLOUD` -> `IS_UNLOCKED` |

**Total: 4 lines changed** (plus geolocation and storage handled in Phase 4).

---

### Phase 3: Server — Remove SaaS Dependencies

These code paths depend on Stripe, Resend, Twilio, AppSumo, or Turnstile. They
should be removed or left as dead code behind `IS_CLOUD` (which is always false).

#### 3a. Stripe — Remove entirely

| File | Action |
|------|--------|
| `lib/stripe.ts` | Delete file or leave as dead code |
| `api/stripe/createCheckoutSession.ts` | Delete file |
| `api/stripe/createPortalSession.ts` | Delete file |
| `api/stripe/previewSubscriptionUpdate.ts` | Delete file |
| `api/stripe/updateSubscription.ts` | Delete file |
| `api/stripe/getSubscription.ts` | Delete file |
| `api/stripe/webhook.ts` | Delete file |
| `api/stripe/index.ts` | Delete file |
| `lib/const.ts` | Remove `StripePlan` interface, `STRIPE_PRICES` array, `getStripePrices()`, `TEST_TO_PRICE_ID` (~460 lines) |
| `lib/subscriptionUtils.ts` | **Rewrite** — see Phase 5 |
| `services/usageService.ts` | **Rewrite** — see Phase 5 |
| `services/admin/subscriptionService.ts` | Remove Stripe subscription lookups |
| `db/postgres/schema.ts` | Remove `stripeCustomerId` field from organization (or leave unused) |
| `lib/auth.ts` | Remove `stripeCustomerId` from organization plugin additionalFields |
| `index.ts` line 350-370 | Remove Stripe route registration block |

**Impact:** Removes the `stripe` npm dependency.

#### 3b. Resend (Email) — Remove entirely

| File | Action |
|------|--------|
| `lib/email/email.ts` | **Rewrite** — replace all functions with no-ops that log a message. Keep function signatures so callers don't break. |
| `services/weekyReports/weeklyReportService.ts` | Leave as-is; it calls email functions that are now no-ops. The cron was gated by `IS_CLOUD` anyway. |
| `services/reengagement/reengagementService.ts` | Same — gated by `IS_CLOUD`, email calls become no-ops. |
| `services/onboardingTips/onboardingTipsService.ts` | Same — email calls become no-ops. |
| `lib/auth.ts` | Remove calls to `sendOtpEmail`, `sendInvitationEmail`, `sendWelcomeEmail`, `addContactToAudience` from auth hooks, or ensure they silently no-op. |

The `lib/email/email.ts` rewrite:

```ts
// All email functions become no-ops
import { createServiceLogger } from "../logger/logger.js";
const logger = createServiceLogger("email");

export async function sendEmail(...args: any[]) {
  logger.debug("Email sending disabled (no Resend configured)");
}
export async function sendOtpEmail(...args: any[]) {
  logger.debug("OTP email disabled — use password-based auth");
}
export async function sendWelcomeEmail(...args: any[]) {}
export async function sendInvitationEmail(...args: any[]) {}
export async function sendLimitExceededEmail(...args: any[]) {}
export async function addContactToAudience(...args: any[]) {}
export async function unsubscribeContact(...args: any[]) {}
export async function scheduleOnboardingTipEmail(...args: any[]) { return null; }
export async function cancelScheduledEmail(...args: any[]) {}
export async function sendReengagementEmail(...args: any[]) {}
```

**Impact:** Removes the `resend` npm dependency. OTP-based email login is
unavailable — users must use password-based authentication.

#### 3c. Twilio (SMS) — Remove entirely

| File | Action |
|------|--------|
| `lib/twilio.ts` | Delete or replace with stub that returns `{ success: false }` |
| `services/uptime/notificationService.ts` | SMS path returns "not configured" (already does this gracefully) |

**Impact:** Removes the `twilio` npm dependency. Uptime SMS notifications
unavailable (they were already commented out in index.ts).

#### 3d. AppSumo — Remove entirely

| File | Action |
|------|--------|
| `api/as/activate.ts` | Delete file |
| `api/as/webhook.ts` | Delete file |
| `api/as/index.ts` | Delete file |
| `db/postgres/schema-appsumo.ts` | Delete file |
| `db/postgres/initPostgres.ts` | Remove `initializeAppSumoTables()` call and function |
| `lib/const.ts` | Remove `APPSUMO_TIER_LIMITS` |
| `lib/subscriptionUtils.ts` | Remove `getAppSumoSubscription()` function |
| `index.ts` | Remove AppSumo route imports and registration |

#### 3e. Turnstile (CAPTCHA) — Remove

| File | Action |
|------|--------|
| `lib/auth.ts` | Remove the captcha plugin conditional block (lines 63-70) |

Already properly gated — with `IS_CLOUD=false` it's never loaded. No change
strictly needed, but removing the code is cleaner.

#### 3f. Google/GitHub OAuth — Remove

| File | Action |
|------|--------|
| `lib/auth.ts` | Remove `socialProviders` block from `betterAuth()` config. This eliminates the risk of startup crashes from undefined `clientId`/`clientSecret`. |

Users authenticate via email+password only.

#### 3g. OpenRouter (AI) — Remove

| File | Action |
|------|--------|
| `lib/openrouter.ts` | Delete file (currently unused — no callers) |

#### 3h. Telemetry collection endpoint — Remove

| File | Action |
|------|--------|
| `api/admin/collectTelemetry.ts` | Already gated by `IS_CLOUD`; becomes dead code. Remove or leave. |

---

### Phase 4: Server — Rework (keep as optional, user-configured)

#### 4a. S3-Compatible Storage (was R2)

The R2 storage service uses the standard S3 SDK (`@aws-sdk/client-s3`). It
should be generalized to work with **any** S3-compatible endpoint, not just
Cloudflare R2.

**Change in `services/storage/r2StorageService.ts`:**

```diff
-    if (IS_CLOUD && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
+    if (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_ENDPOINT) {
       this.client = new S3Client({
         region: process.env.S3_REGION || "auto",
-        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
+        endpoint: process.env.S3_ENDPOINT,
         credentials: {
-          accessKeyId: process.env.R2_ACCESS_KEY_ID,
-          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
+          accessKeyId: process.env.S3_ACCESS_KEY_ID,
+          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
         },
         forcePathStyle: true,
       });
-      this.bucket = process.env.R2_BUCKET_NAME || "rybbit";
+      this.bucket = process.env.S3_BUCKET_NAME || "rybbit";
```

This lets users point to MinIO, Garage, AWS S3, or any compatible service.
When no S3 env vars are set, storage is disabled and session replay data falls
back to inline ClickHouse storage (existing self-hosted behavior).

**New env vars for Helm chart:**

| Env Var | Description | Default |
|---------|-------------|---------|
| `S3_ENDPOINT` | S3-compatible endpoint URL | (empty — disabled) |
| `S3_ACCESS_KEY_ID` | Access key | (empty) |
| `S3_SECRET_ACCESS_KEY` | Secret key | (empty) |
| `S3_BUCKET_NAME` | Bucket name | `rybbit` |
| `S3_REGION` | Region hint | `auto` |

#### 4b. IPAPI Geolocation

The enhanced geolocation (VPN detection, company info, ASN data) requires
the IPAPI service. This is an external paid API, not something we can stub.

**Options:**
1. **Leave gated by `IS_CLOUD`** — with `IS_CLOUD=false` it falls back to the
   local MaxMind database (basic city/country/lat/lon). Network filters in the
   UI will show empty data.
2. **Gate by a new `IPAPI_KEY` check** — if the user provides their own IPAPI
   key, enable enrichment.

**Recommended: Option 2.**

```diff
-  if (IS_CLOUD && !useLocal) {
+  if (process.env.IPAPI_KEY && !useLocal) {
```

This way the feature works for anyone who brings their own IPAPI key, without
requiring `CLOUD=true`.

**Note:** The ClickHouse columns for network enrichment data (company, ASN,
VPN, etc.) are created in Phase 2. Even without IPAPI, the columns exist but
will contain empty defaults. The UI filters will show no data unless IPAPI is
configured.

#### 4c. Mapbox

Already works — the token is passed through to the frontend via `/api/config`.
No changes needed. If no token is set, the map component just doesn't render.

#### 4d. Google Search Console

The GSC integration uses Google OAuth credentials and is **not gated by
`IS_CLOUD`** — the routes are always registered. However, the client-side GSC
UI **is** gated by `IS_CLOUD`.

**Server:** No changes needed (routes are always registered).

**Client:** Change the GSC UI gate from `IS_CLOUD` to `IS_UNLOCKED` (see Phase 6).

Users who want GSC integration provide their own Google OAuth credentials via
env vars. If not provided, the "Connect" button will fail with a descriptive
error.

---

### Phase 5: Server — Rework Subscription/Usage System

The biggest rework. Currently, `IS_CLOUD` mode enforces event limits based on
Stripe subscriptions. Without Stripe, we need to either remove limits entirely
or provide a simpler mechanism.

**Approach: Unlimited plan for all organizations.**

#### 5a. `lib/subscriptionUtils.ts`

Replace `getBestSubscription()` with a function that always returns unlimited:

```ts
export async function getBestSubscription(
  organizationId: string,
  stripeCustomerId: string | null
): Promise<SubscriptionInfo> {
  // Unlocked self-hosted: every org gets unlimited
  return {
    source: "unlimited",
    eventLimit: Infinity,
    periodStart: getStartOfMonth(),
    planName: "pro-unlimited",
    status: "active",
  };
}
```

Remove `getStripeSubscription()` and `getAppSumoSubscription()` entirely.
Remove `getOverrideSubscription()` unless you want to keep per-org overrides.

#### 5b. `services/usageService.ts`

The usage check cron is gated by `IS_CLOUD` (line 26). With `IS_CLOUD=false`,
it never runs. No changes needed — but for cleanliness, the cron code that
calls `getBestSubscription` can be removed since there are no limits to enforce.

Alternatively, remove the entire `UsageService` class and replace with:

```ts
class UsageService {
  // Unlocked: no usage limits
  public getSitesOverLimit(): Set<number> {
    return new Set(); // No sites are ever over limit
  }
}
export const usageService = new UsageService();
```

#### 5c. `api/sites/addSite.ts`

Remove the `IS_CLOUD` block (lines 74-89) that checks subscription status
before allowing session replay, web vitals, etc. All features are always
allowed:

```diff
-    if (IS_CLOUD) {
-      const subscription = await getSubscriptionInner(organizationId);
-      if (sessionReplay && !subscription?.planName.includes("pro")) {
-        return reply.status(403).send({ ... });
-      }
-      // ...standard features check...
-    }
+    // Unlocked: all features allowed for all organizations
```

#### 5d. `api/sites/getSitesFromOrg.ts`

Remove the subscription lookup. All orgs get unlimited events:

```diff
-    if (!IS_CLOUD) {
-      eventLimit = Infinity;
-    } else {
-      subscription = await getSubscriptionInner(organizationId);
-      // ...
-    }
+    eventLimit = Infinity;
```

#### 5e. `api/sites/getSiteImports.ts`

Remove the `IS_CLOUD` block that checks subscription for import limits (line 34).

#### 5f. `api/sites/createSiteImport.ts`

Remove the `IS_CLOUD` block that checks import quotas (line 58).

#### 5g. `api/sites/batchImportEvents.ts`

Remove the `IS_CLOUD` block that checks import quotas per-batch (line 72).

#### 5h. `api/sites/deleteSiteImport.ts`

Remove the `IS_CLOUD` block (line 50).

#### 5i. `services/import/importQuotaTracker.ts`

The `!IS_CLOUD` early return at line 44 already gives unlimited for self-hosted.
Since `IS_CLOUD` is false, this works correctly. No change needed.

#### 5j. `services/import/importQuotaManager.ts`

The `!IS_CLOUD` early return at line 49 already allows unlimited concurrent
imports. No change needed.

#### 5k. `api/stripe/getSubscription.ts`

This endpoint is called by the client to get subscription info. Since we remove
the Stripe routes, we need a replacement endpoint or modify the client to not
call it.

**Option A:** Keep the route but return a hardcoded unlimited subscription:

```ts
// api/subscription/getSubscription.ts
export const getSubscription = async (request, reply) => {
  return reply.send({
    planName: "pro-unlimited",
    status: "active",
    eventLimit: Infinity,
    monthlyEventCount: 0,
    source: "unlimited",
  });
};
```

Register this as `GET /api/subscription` (the client fetches from
`/stripe/subscription` — update the client to use `/subscription` instead).

**Option B:** Remove the client-side subscription hook entirely. See Phase 6.

---

### Phase 6: Client — Unlock Features

Change all feature-unlock `IS_CLOUD` checks to `IS_UNLOCKED` (which is `true`).

| File | Line(s) | Feature | Change |
|------|---------|---------|--------|
| `app/[site]/components/Sidebar/Sidebar.tsx` | 86-93 | Pages nav link | `IS_CLOUD` -> `IS_UNLOCKED` |
| `app/[site]/components/Sidebar/Sidebar.tsx` | 94-101 | Performance nav link | `IS_CLOUD` -> `IS_UNLOCKED` |
| `app/[site]/main/page.tsx` | 43 | Network section | `IS_CLOUD` -> `IS_UNLOCKED` |
| `app/[site]/main/page.tsx` | 44 | Search Console section | `IS_CLOUD` -> `IS_UNLOCKED` (also needs GSC credentials to work) |
| `app/[site]/components/SubHeader/Filters/const.tsx` | 185-233 | 9 network filters (VPN, Crawler, Datacenter, Company, etc.) | Remove `cloudOnly: true` property from all 9 filter definitions |
| `app/[site]/components/SubHeader/Filters/FilterComponent.tsx` | 46-48 | Cloud-only filter enforcement | Remove the `cloudOnly` filter |
| `app/[site]/components/SubHeader/Export/exportCsv.ts` | 93 | Network metrics in CSV export | `IS_CLOUD` -> `IS_UNLOCKED` |
| `components/SiteSettings/SiteConfiguration.tsx` | 208-222 | Web Vitals toggle | `IS_CLOUD` -> `IS_UNLOCKED` |
| `components/SiteSettings/SiteConfiguration.tsx` | 345 | GSC manager | `IS_CLOUD` -> `IS_UNLOCKED` |
| `app/[site]/components/shared/StandardSection/StandardSection.tsx` | 74 | Geolocation attribution tooltip | `IS_CLOUD` -> `IS_UNLOCKED` |
| `app/[site]/globe/globeStore.ts` | 19 | Globe defaults to 3D mode | `IS_CLOUD` -> `IS_UNLOCKED` |
| `app/uptime/monitors/components/dialog/MonitorDialog.tsx` | — | Global uptime monitoring | `IS_CLOUD` -> `IS_UNLOCKED` |
| `app/uptime/monitors/components/dialog/RegionsTab.tsx` | — | Multi-region selection | `IS_CLOUD` -> `IS_UNLOCKED` |

**Total: ~15 lines changed.**

---

### Phase 7: Client — Remove SaaS UI

Remove or disable all SaaS-specific UI components.

#### 7a. Stripe / Subscription UI — Remove

| File | Action |
|------|--------|
| `app/subscribe/` (entire directory) | Delete or leave (never routed to) |
| `app/settings/organization/subscription/page.tsx` | Delete or leave |
| `app/settings/components/SettingsSidebar.tsx` lines 26-33 | Remove "Subscription" link (gated by `IS_CLOUD`, already hidden) |
| `app/settings/organization/layout.tsx` lines 70-75 | Remove subscription tab (gated by `IS_CLOUD`, already hidden) |
| `components/subscription/` (entire directory) | Delete or leave |
| `lib/subscription/useStripeSubscription.ts` | **Rewrite** — return hardcoded unlimited subscription, or delete |
| `lib/subscription/useSubscriptionMutations.ts` | Delete |
| `components/DisabledOverlay.tsx` | **Rewrite** — always return children, never disable |

The `DisabledOverlay` component currently returns `false` for `disabled` when
`!IS_CLOUD`. Since `IS_CLOUD` is false, it already works correctly (never
disables anything). But for cleanliness:

```tsx
export const DisabledOverlay: React.FC<DisabledOverlayProps> = ({ children }) => {
  return <>{children}</>;
};
```

#### 7b. `useStripeSubscription` hook — Rewrite

The client calls `GET /stripe/subscription` to get plan info. Multiple
components use this. Instead of deleting all callers, replace the hook:

```ts
// lib/subscription/useStripeSubscription.ts
export function useStripeSubscription() {
  return {
    data: {
      planName: "pro-unlimited",
      status: "active",
      eventLimit: Infinity,
      monthlyEventCount: 0,
      source: "unlimited",
    },
    isLoading: false,
    error: null,
  };
}
```

This way all consumers get "unlimited pro" and no network requests are made.

#### 7c. Rewardful (Affiliate Tracking) — Remove

| File | Action |
|------|--------|
| `app/layout.tsx` lines 50-57 | Remove Rewardful `<Script>` tags (gated by `IS_CLOUD`, already inactive) |
| `types/rewardful.d.ts` | Delete |
| `app/settings/organization/subscription/page.tsx` | Remove `window.rewardful?.("convert")` call |

#### 7d. Turnstile (CAPTCHA) — Remove

| File | Action |
|------|--------|
| `components/auth/Turnstile.tsx` | Delete or make no-op |
| `app/signup/page.tsx` | Remove Turnstile import and `captchaToken` logic |
| `app/login/page.tsx` | Remove Turnstile import and `captchaToken` logic |
| `app/reset-password/page.tsx` | Remove Turnstile import and `captchaToken` logic |
| `app/invitation/components/signup.tsx` | Remove Turnstile import and `captchaToken` logic |

All already gated by `IS_CLOUD` — with `IS_CLOUD=false` the component returns
null. No functional change needed, but removing the code is cleaner.

#### 7e. Social OAuth — Remove

| File | Action |
|------|--------|
| `components/auth/SocialButtons.tsx` | Returns `null` when `!IS_CLOUD` — already inactive. Delete or leave. |
| `app/login/page.tsx` lines 109-114 | "Forgot password?" link — remove (gated by `IS_CLOUD`) |

#### 7f. AppSumo — Remove

| File | Action |
|------|--------|
| `app/as/callback/page.tsx` | Delete entire page |

#### 7g. Email-Dependent UI — Remove

| File | Action |
|------|--------|
| `app/settings/account/components/AccountInner.tsx` line 148 | Weekly email reports toggle — remove (gated by `IS_CLOUD`) |
| `app/signup/page.tsx` lines 174-177 | Post-signup redirect to `/subscribe` — remove |
| `app/signup/page.tsx` lines 265-289 | "How did you find Rybbit?" referral dropdown — remove |

#### 7h. Miscellaneous Cleanup

| File | Action |
|------|--------|
| `app/[site]/components/Header/AffiliateBanner.tsx` | Remove (gated by `IS_CLOUD`) |
| `components/AppSidebar.tsx` line 20 | Admin link — change gate from `IS_CLOUD` to `IS_UNLOCKED` (show admin panel) |
| `components/AppSidebar.tsx` lines 66-74 | Email support link — remove |
| `app/components/Footer.tsx` line 169 | Support mailto — remove (gated by `IS_CLOUD`) |
| `components/SiteSettings/SiteConfiguration.tsx` line 315 | Plan tier badges — remove (gated by `IS_CLOUD`) |
| `app/components/AddSite.tsx` line 75 | Site limit check — already returns false when `!IS_CLOUD`. No change needed. |
| `app/settings/organization/members/components/InviteMemberDialog.tsx` line 56 | Member limit — already returns false when `!IS_CLOUD`. No change needed. |
| `components/SiteSettings/ImportManager.tsx` line 185 | Import concurrency limit — already skipped when `!IS_CLOUD`. No change needed. |
| `api/admin/hooks/useImport.ts` line 11 | Import free-tier gating — rewrite to always enable |
| `app/[site]/components/SubHeader/Export/ExportButton.tsx` line 80 | PDF export plan gate — remove gate, always allow |
| `app/[site]/components/Sidebar/Sidebar.tsx` lines 118-125 | Replay sidebar AppSumo check — remove check |
| `components/SiteSettings/SiteConfiguration.tsx` lines 188-189 | Session replay and standard features plan gates — remove gates |

---

### Phase 8: Server — Cron Services Cleanup

| Service | File | Current behavior | Action |
|---------|------|------------------|--------|
| Weekly reports | `services/weekyReports/weeklyReportService.ts` | Gated by `IS_CLOUD` at cron start (index.ts:398) and inside service (line 396, 446) | No change needed — cron never starts with `IS_CLOUD=false` |
| Re-engagement | `services/reengagement/reengagementService.ts` | Gated by `IS_CLOUD` at cron start (index.ts:399) and inside service (line 153) | No change needed |
| Usage checker | `services/usageService.ts` | Gated by `IS_CLOUD` (line 26) | No change needed — cron never starts |
| Telemetry | `services/telemetryService.ts` | Self-hosted telemetry runs when `!IS_CLOUD && !DISABLE_TELEMETRY` | No change needed |
| Onboarding tips | `services/onboardingTips/onboardingTipsService.ts` | Calls email functions (now no-ops) | No change needed |
| Import quota cleanup | `services/import/importQuotaManager.ts` | Cleanup interval gated by `IS_CLOUD` (line 90) | No change needed |

---

### Phase 9: Server — Admin Routes

The admin routes (`/admin/sites`, `/admin/organizations`,
`/admin/service-event-count`) are currently gated behind `IS_CLOUD` in the
`stripeAdminRoutes` function (index.ts:359-363).

These are useful for self-hosted too. Extract them from the `IS_CLOUD` block:

```diff
 async function stripeAdminRoutes(fastify: FastifyInstance) {
-  if (IS_CLOUD) {
-    // Stripe Routes
-    fastify.post("/stripe/create-checkout-session", ...);
-    // ... (remove all Stripe routes)
-
-    // Admin Routes
-    fastify.get("/admin/sites", adminOnly, getAdminSites);
-    fastify.get("/admin/organizations", adminOnly, getAdminOrganizations);
-    fastify.get("/admin/service-event-count", adminOnly, getAdminServiceEventCount);
-    // ... (remove AppSumo routes)
-  }
+  // Admin Routes (always available)
+  fastify.get("/admin/sites", adminOnly, getAdminSites);
+  fastify.get("/admin/organizations", adminOnly, getAdminOrganizations);
+  fastify.get("/admin/service-event-count", adminOnly, getAdminServiceEventCount);
 }
```

Rename the function from `stripeAdminRoutes` to `adminRoutes`.

---

### Phase 10: NPM Dependency Cleanup

Remove unused npm packages from `server/package.json`:

| Package | Reason |
|---------|--------|
| `stripe` | Billing removed |
| `resend` | Email removed |
| `twilio` | SMS removed |

These can also be left — they'll just be unused dead weight in the image.
Removing them reduces image size.

---

## Summary of All Changes

### By impact level:

**Trivial changes (swap `IS_CLOUD` -> `IS_UNLOCKED`):**
- ~15 client files (feature unlock gates)
- ~4 server files (ClickHouse columns, API key rate limiting)

**Small rewrites:**
- `lib/email/email.ts` — replace all functions with no-ops (~30 lines)
- `lib/subscriptionUtils.ts` — always return unlimited (~10 lines)
- `services/usageService.ts` — simplify or gut (~10 lines)
- `lib/subscription/useStripeSubscription.ts` (client) — return hardcoded data (~10 lines)
- `components/DisabledOverlay.tsx` (client) — always render children (~3 lines)
- `services/storage/r2StorageService.ts` — generalize to any S3 endpoint (~8 lines)
- `db/geolocation/geolocation.ts` — gate by IPAPI_KEY presence (~1 line)

**Deletions (files that can be removed):**
- `api/stripe/` — 7 files
- `api/as/` — 3 files
- `lib/stripe.ts` — 1 file
- `lib/twilio.ts` — 1 file
- `lib/openrouter.ts` — 1 file
- `db/postgres/schema-appsumo.ts` — 1 file
- `app/as/` (client) — 1 file
- `types/rewardful.d.ts` (client) — 1 file

**Code that's already dead (IS_CLOUD=false means it never executes):**
- Rewardful scripts, affiliate banner, Turnstile CAPTCHA, social OAuth buttons,
  email report toggle, subscription sidebar/tabs, usage cron, weekly reports
  cron, re-engagement cron, import quota enforcement

---

## New Env Vars for Helm Chart

| Env Var | Component | Required | Description |
|---------|-----------|----------|-------------|
| `S3_ENDPOINT` | backend | No | S3-compatible endpoint for session replay storage |
| `S3_ACCESS_KEY_ID` | backend | No | S3 access key |
| `S3_SECRET_ACCESS_KEY` | backend | No | S3 secret key |
| `S3_BUCKET_NAME` | backend | No | S3 bucket name (default: `rybbit`) |
| `S3_REGION` | backend | No | S3 region hint (default: `auto`) |
| `IPAPI_KEY` | backend | No | IPAPI key for enhanced geolocation |
| `GOOGLE_CLIENT_ID` | backend | No | For GSC integration (optional) |
| `GOOGLE_CLIENT_SECRET` | backend | No | For GSC integration (optional) |
| `GOOGLE_REDIRECT_URI` | backend | No | For GSC integration (optional) |

## Removed Env Vars

These env vars are no longer used and should not be set:

| Env Var | Reason |
|---------|--------|
| `CLOUD` | Never set to true |
| `NEXT_PUBLIC_CLOUD` | Never set to true |
| `STRIPE_SECRET_KEY` | Stripe removed |
| `STRIPE_WEBHOOK_SECRET` | Stripe removed |
| `RESEND_API_KEY` | Resend removed |
| `TWILIO_ACCOUNT_SID` | Twilio removed |
| `TWILIO_AUTH_TOKEN` | Twilio removed |
| `TWILIO_PHONE_NUMBER` | Twilio removed |
| `APPSUMO_CLIENT_ID` | AppSumo removed |
| `APPSUMO_CLIENT_SECRET` | AppSumo removed |
| `TURNSTILE_SECRET_KEY` | Turnstile removed |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile removed |
| `R2_ACCOUNT_ID` | Replaced by `S3_ENDPOINT` |
| `R2_ACCESS_KEY_ID` | Replaced by `S3_ACCESS_KEY_ID` |
| `R2_SECRET_ACCESS_KEY` | Replaced by `S3_SECRET_ACCESS_KEY` |
| `R2_BUCKET_NAME` | Replaced by `S3_BUCKET_NAME` |
| `OPENROUTER_API_KEY` | OpenRouter removed |
| `OPENROUTER_MODEL` | OpenRouter removed |
| `GOOGLE_CLIENT_ID` | OAuth login removed (kept only for GSC) |
| `GOOGLE_CLIENT_SECRET` | OAuth login removed (kept only for GSC) |
| `GITHUB_CLIENT_ID` | OAuth login removed |
| `GITHUB_CLIENT_SECRET` | OAuth login removed |

---

## Estimated Effort

| Phase | Effort | Description |
|-------|--------|-------------|
| Phase 1 | 5 min | Add `IS_UNLOCKED` constants |
| Phase 2 | 10 min | Swap 4 server `IS_CLOUD` -> `IS_UNLOCKED` |
| Phase 3 | 30 min | Delete/gut SaaS files, rewrite email to no-ops |
| Phase 4 | 15 min | Generalize S3 storage, IPAPI key gate |
| Phase 5 | 20 min | Rework subscription system to unlimited |
| Phase 6 | 15 min | Swap ~15 client `IS_CLOUD` -> `IS_UNLOCKED` |
| Phase 7 | 20 min | Remove SaaS UI (mostly already dead code) |
| Phase 8 | 0 min | No changes needed (crons are already gated) |
| Phase 9 | 5 min | Ungating admin routes |
| Phase 10 | 5 min | Remove npm deps |
| **Total** | **~2 hours** | |

---

## Docker Image Build

After patching, build custom images:

```bash
# From the rybbit-app repo root
docker build -f server/Dockerfile -t your-registry/rybbit-backend:unlocked .
docker build -f client/Dockerfile -t your-registry/rybbit-client:unlocked .
```

Update `values.yaml` in the Helm chart to reference these images:

```yaml
image:
  backend:
    repository: your-registry/rybbit-backend
    tag: unlocked
  client:
    repository: your-registry/rybbit-client
    tag: unlocked
```

---

## Risks & Considerations

1. **Upstream merge conflicts**: The patches are small (~100 lines changed, ~15
   files deleted) and mostly in leaf files (Stripe routes, email service). Core
   application logic is barely touched. Merge conflicts should be rare and easy
   to resolve.

2. **OTP email auth is broken**: Without Resend, users cannot receive OTP codes.
   Only password-based authentication works. Consider adding SMTP support as a
   future enhancement.

3. **Network filter data requires IPAPI**: The network filters UI will show
   empty data unless the user provides an IPAPI key. The filters will still
   appear and be usable — they just won't have any data to filter on unless
   IPAPI is configured.

4. **GSC requires Google credentials**: The Google Search Console UI will appear
   but won't work unless the user provides Google OAuth credentials. The
   "Connect" button will fail gracefully.

5. **No subscription enforcement**: All limits are removed. A single instance
   can ingest unlimited events. This is intentional for self-hosted, but means
   there's no protection against runaway event ingestion filling up ClickHouse
   storage.
