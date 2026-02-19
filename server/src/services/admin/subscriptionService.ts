import { DateTime } from "luxon";

export interface SubscriptionData {
  id: string;
  planName: string;
  status: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  eventLimit?: number;
  interval?: string;
}

/**
 * Returns unlimited subscription data for all organizations.
 * In unlocked mode, every org gets unlimited access.
 */
export async function getOrganizationSubscriptions(
  organizations: Array<{ id: string; stripeCustomerId?: string | null }>,
  includeFullDetails = false
): Promise<
  Map<string, SubscriptionData & { planName: string; status: string; eventLimit: number; currentPeriodEnd: Date }>
> {
  const orgSubscriptionMap = new Map<
    string,
    SubscriptionData & { planName: string; status: string; eventLimit: number; currentPeriodEnd: Date }
  >();

  const farFuture = new Date("2099-12-31T23:59:59Z");

  for (const org of organizations) {
    const subscriptionData: SubscriptionData & {
      planName: string;
      status: string;
      eventLimit: number;
      currentPeriodEnd: Date;
    } = {
      id: "unlimited",
      planName: "Unlimited",
      status: "active",
      eventLimit: Infinity,
      currentPeriodEnd: farFuture,
    };

    if (includeFullDetails) {
      subscriptionData.currentPeriodStart = DateTime.now().startOf("month").toJSDate();
      subscriptionData.cancelAtPeriodEnd = false;
      subscriptionData.interval = "lifetime";
    }

    orgSubscriptionMap.set(org.id, subscriptionData);
  }

  return orgSubscriptionMap;
}
