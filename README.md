# Rybbit — Open Cloud

A patched fork of [Rybbit](https://github.com/rybbit-io/rybbit) that unlocks all analytics features for self-hosted deployments and removes all SaaS service dependencies.

## Images & Deployment

See packages on github.

```
ghcr.io/slowlydev/rybbit-client:latest
ghcr.io/slowlydev/rybbit-backend:latest
```

Theres no gurantee these images behave the same as upstream, but they should be close.

Theres also a HELM Chart thats beeing built to deploy this Open Cloud version with all its features to Kubernetes clusters.

## What's different

Upstream Rybbit gates several features behind a paid cloud subscription. This fork removes those gates so every feature works out of the box on your own infrastructure.

| Feature                   | Upstream (self-hosted) | This fork                     |
| ------------------------- | ---------------------- | ----------------------------- |
| Web Vitals                | Hidden                 | Enabled                       |
| Pages tab                 | Hidden                 | Enabled                       |
| Performance tab           | Hidden                 | Enabled                       |
| Network filters           | Hidden                 | Enabled                       |
| Session Replay storage    | Inline ClickHouse only | S3 if configured, else inline |
| Uptime monitoring         | Local only             | Global regions                |
| Site/member limits        | Unlimited              | Unlimited                     |
| Stripe billing            | N/A                    | Removed                       |
| Resend email              | N/A                    | Removed (no-ops)              |
| Twilio SMS                | N/A                    | Removed                       |
| AppSumo                   | N/A                    | Removed                       |
| Turnstile CAPTCHA         | N/A                    | Removed                       |
| Google/GitHub OAuth login | N/A                    | Removed                       |

## Features

- All standard web analytics: sessions, unique users, pageviews, bounce rate, session duration
- Session replays
- Web Vitals (LCP, FID, CLS, etc.)
- No cookies, privacy friendly
- Goals, retention, user journeys, and funnels
- Advanced filtering across 15+ dimensions
- Custom events with JSON properties
- 3-level location tracking (country → region → city) + map visualizations
- Real-time dashboard
- Uptime monitoring with global check regions
- Organizations and unlimited sites
- Admin panel

## Authentication

Email + password only. OTP email login is unavailable (Resend removed). Social OAuth (Google, GitHub) is unavailable.

## Optional integrations

These features work if you supply credentials, and degrade gracefully without them.

| Env var                                                             | Feature                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `S3_ENDPOINT` + `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY`         | S3-compatible session replay storage (MinIO, AWS S3, Garage, etc.) |
| `S3_BUCKET_NAME`                                                    | Bucket name (default: `rybbit`)                                    |
| `S3_REGION`                                                         | Region hint (default: `auto`)                                      |
| `IPAPI_KEY`                                                         | Enhanced geolocation: VPN detection, company, ASN data             |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_REDIRECT_URI` | Google Search Console integration                                  |
| `MAPBOX_TOKEN`                                                      | Map visualizations                                                 |

## Removed env vars

These are no longer used and should not be set:

`CLOUD`, `NEXT_PUBLIC_CLOUD`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `APPSUMO_CLIENT_ID`, `APPSUMO_CLIENT_SECRET`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`

## Known limitations

- **No OTP email auth** — password-based login only
- **Network filters require IPAPI** — filters appear in the UI but show no data without an `IPAPI_KEY`
- **GSC requires Google credentials** — the Connect button will fail without `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
- **No event ingestion limits** — all rate limits are removed; protect your ClickHouse storage capacity externally if needed

## License

[AGPL-3.0](https://github.com/rybbit-io/rybbit?tab=AGPL-3.0-1-ov-file) — same as upstream.
