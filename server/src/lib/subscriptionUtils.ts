import { DateTime } from "luxon";

export interface FreeSubscriptionInfo {
  source: "free";
  eventLimit: number;
  periodStart: string;
  planName: "free";
  status: "free";
}

export interface UnlimitedSubscriptionInfo {
  source: "unlimited";
  eventLimit: number;
  periodStart: string;
  planName: "pro-unlimited";
  status: "active";
}

export type SubscriptionInfo = FreeSubscriptionInfo | UnlimitedSubscriptionInfo;

/**
 * Gets the first day of the current month in YYYY-MM-DD format
 */
function getStartOfMonth(): string {
  return DateTime.now().startOf("month").toISODate() as string;
}

/**
 * Unlocked self-hosted: every org gets unlimited
 */
export async function getBestSubscription(
  organizationId: string,
  stripeCustomerId: string | null
): Promise<SubscriptionInfo> {
  return {
    source: "unlimited",
    eventLimit: Infinity,
    periodStart: getStartOfMonth(),
    planName: "pro-unlimited",
    status: "active",
  };
}
