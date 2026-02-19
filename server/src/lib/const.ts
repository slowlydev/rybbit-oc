import dotenv from "dotenv";

dotenv.config();

export const IS_CLOUD = process.env.CLOUD === "true";
export const IS_UNLOCKED = true; // Always true in this fork — unlocks all analytics features
export const DISABLE_SIGNUP = process.env.DISABLE_SIGNUP === "true";
export const DISABLE_TELEMETRY = process.env.DISABLE_TELEMETRY === "true";
export const SECRET = process.env.BETTER_AUTH_SECRET;
export const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

// Trial constants (commented out as we're replacing with free tier)
// export const TRIAL_DURATION_DAYS = 14;
// export const TRIAL_EVENT_LIMIT = 100000;

export const DEFAULT_EVENT_LIMIT = 3_000;

// Stripe and AppSumo removed — unlocked self-hosted fork
