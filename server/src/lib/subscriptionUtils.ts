import { IS_CLOUD } from "./const.js";
import { db } from "../db/postgres/postgres.js";
import { organization } from "../db/postgres/schema.js";
import { eq } from "drizzle-orm";
import { getSubscriptionInner } from "../api/stripe/getSubscription.js";

export interface TierInfo {
  tier: "Free" | "Standard" | "Pro";
  monthsAllowed: number;
}

export interface SubscriptionInfo {
  planName: string;
  eventLimit: number;
  tierInfo: TierInfo;
}

export function getTierInfo(planName: string): TierInfo {
  const normalizedPlanName = planName.trim().toLowerCase();

  if (normalizedPlanName === "free") {
    return {
      tier: "Free",
      monthsAllowed: 6,
    };
  }

  if (normalizedPlanName.startsWith("standard")) {
    return {
      tier: "Standard",
      monthsAllowed: 24,
    };
  }

  if (normalizedPlanName.startsWith("pro")) {
    return {
      tier: "Pro",
      monthsAllowed: 60,
    };
  }

  // Default to free tier for unknown plans
  return {
    tier: "Free",
    monthsAllowed: 6,
  };
}

export async function getOrganizationSubscriptionInfo(organizationId: string): Promise<SubscriptionInfo | null> {
  if (!IS_CLOUD) {
    return null;
  }

  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  if (!org) {
    return null;
  }

  const subscription = await getSubscriptionInner(organizationId);

  if (!subscription) {
    return null;
  }

  const tierInfo = getTierInfo(subscription.planName);

  return {
    planName: subscription.planName,
    eventLimit: subscription.eventLimit,
    tierInfo,
  };
}
