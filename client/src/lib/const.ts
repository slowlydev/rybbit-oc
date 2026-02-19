export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL === "http://localhost:3001"
    ? "http://localhost:3001/api"
    : `${process.env.NEXT_PUBLIC_BACKEND_URL}/api`;
export const IS_CLOUD = process.env.NEXT_PUBLIC_CLOUD === "true";
export const IS_UNLOCKED = true; // Always true in this fork — unlocks all analytics features

// Time constants
export const MINUTES_IN_24_HOURS = 24 * 60; // 1440 minutes

export const DEMO_HOSTNAME = "demo.rybbit.com";

export const FREE_SITE_LIMIT = 1;
export const STANDARD_SITE_LIMIT = 5;
export const STANDARD_TEAM_LIMIT = 3;
export const BASIC_SITE_LIMIT = 1;
export const BASIC_TEAM_LIMIT = 1;