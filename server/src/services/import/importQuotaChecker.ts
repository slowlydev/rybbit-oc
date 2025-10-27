import { DateTime } from "luxon";
import { clickhouse } from "../../db/clickhouse/clickhouse.js";
import { db } from "../../db/postgres/postgres.js";
import { sites, organization } from "../../db/postgres/schema.js";
import { eq } from "drizzle-orm";
import { processResults } from "../../api/analytics/utils.js";
import { getBestSubscription, type SubscriptionInfo } from "../../lib/subscriptionUtils.js";
import { IS_CLOUD } from "../../lib/const.js";

/**
 * Get the number of months of historical data allowed for import based on subscription tier
 */
function getHistoricalWindowMonths(subscription: SubscriptionInfo): number {
  // Free tier: 6 months
  if (subscription.source === "free") {
    return 6;
  }

  // AppSumo: treat as Standard tier (24 months)
  if (subscription.source === "appsumo") {
    return 24;
  }

  // Stripe: check if pro or standard
  if (subscription.source === "stripe") {
    if (subscription.planName.startsWith("pro")) {
      return 60; // Pro tier: 60 months
    }
    return 24; // Standard tier: 24 months
  }

  // Default to free tier
  return 6;
}

export class ImportQuotaTracker {
  private monthlyUsage: Map<string, number>;
  private readonly monthlyLimit: number;
  private readonly historicalWindowMonths: number;
  private readonly oldestAllowedMonth: string;

  private constructor(
    monthlyUsage: Map<string, number>,
    monthlyLimit: number,
    historicalWindowMonths: number,
    oldestAllowedMonth: string
  ) {
    this.monthlyUsage = monthlyUsage;
    this.monthlyLimit = monthlyLimit;
    this.historicalWindowMonths = historicalWindowMonths;
    this.oldestAllowedMonth = oldestAllowedMonth;
  }

  static async create(organizationId: string): Promise<ImportQuotaTracker> {
    if (!IS_CLOUD) {
      return new ImportQuotaTracker(new Map(), Infinity, Infinity, "190001");
    }

    const [org] = await db
      .select({ stripeCustomerId: organization.stripeCustomerId })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);

    if (!org) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    const subscription = await getBestSubscription(organizationId, org.stripeCustomerId);

    const monthlyLimit = subscription.eventLimit;
    const historicalWindowMonths = getHistoricalWindowMonths(subscription);

    const oldestAllowedDate = DateTime.utc().minus({ months: historicalWindowMonths }).startOf("month");
    const oldestAllowedMonth = oldestAllowedDate.toFormat("yyyyMM");

    const siteRecords = await db
      .select({ siteId: sites.siteId })
      .from(sites)
      .where(eq(sites.organizationId, organizationId));

    const siteIds = siteRecords.map(s => s.siteId);

    if (siteIds.length === 0) {
      return new ImportQuotaTracker(new Map(), monthlyLimit, historicalWindowMonths, oldestAllowedMonth);
    }

    const monthlyUsage = await ImportQuotaTracker.queryMonthlyUsage(siteIds, oldestAllowedDate.toFormat("yyyy-MM-dd"));

    return new ImportQuotaTracker(monthlyUsage, monthlyLimit, historicalWindowMonths, oldestAllowedMonth);
  }

  private static async queryMonthlyUsage(siteIds: number[], startDate: string): Promise<Map<string, number>> {
    const monthlyUsage = new Map<string, number>();

    if (siteIds.length === 0) {
      return monthlyUsage;
    }

    const grandfatheredSites = siteIds.filter(id => id < 2000);
    const newSites = siteIds.filter(id => id >= 2000);

    try {
      // Combine queries into a single UNION query for better performance
      // Grandfathered sites (< 2000): count pageviews only
      // New sites (>= 2000): count pageviews, custom_events, and performance events
      const result = await clickhouse.query({
        query: `
          SELECT
            toYYYYMM(timestamp) as month,
            SUM(count) as count
          FROM (
            ${
              grandfatheredSites.length > 0
                ? `
              SELECT
                timestamp,
                1 as count
              FROM events
              WHERE site_id IN {grandfatheredSites:Array(Int32)}
                AND type = 'pageview'
                AND timestamp >= toDate({startDate:String})
            `
                : ""
            }
            ${grandfatheredSites.length > 0 && newSites.length > 0 ? "UNION ALL" : ""}
            ${
              newSites.length > 0
                ? `
              SELECT
                timestamp,
                1 as count
              FROM events
              WHERE site_id IN {newSites:Array(Int32)}
                AND type IN ('pageview', 'custom_event', 'performance')
                AND timestamp >= toDate({startDate:String})
            `
                : ""
            }
          )
          GROUP BY month
          ORDER BY month
        `,
        query_params: {
          ...(grandfatheredSites.length > 0 && { grandfatheredSites }),
          ...(newSites.length > 0 && { newSites }),
          startDate: startDate,
        },
        format: "JSONEachRow",
      });

      const rows = await processResults<{ month: string; count: number }>(result);
      for (const row of rows) {
        monthlyUsage.set(row.month, row.count);
      }

      return monthlyUsage;
    } catch (error) {
      console.error(`Error querying ClickHouse for monthly usage:`, error);
      throw new Error(
        `Failed to query monthly usage for quota check: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  canImportEvent(timestamp: string): boolean {
    if (this.monthlyLimit === Infinity) {
      return true;
    }

    const dt = DateTime.fromFormat(timestamp, "yyyy-MM-dd HH:mm:ss", { zone: "utc" });
    if (!dt.isValid) {
      console.warn(`Invalid timestamp format: ${timestamp}`);
      return false;
    }

    const month = dt.toFormat("yyyyMM");

    if (month < this.oldestAllowedMonth) {
      return false;
    }

    const used = this.monthlyUsage.get(month) || 0;
    if (used >= this.monthlyLimit) {
      return false;
    }

    this.monthlyUsage.set(month, used + 1);
    return true;
  }

  getSummary(): {
    totalMonthsInWindow: number;
    monthsAtCapacity: number;
    monthsWithSpace: number;
    oldestAllowedMonth: string;
  } {
    if (this.monthlyLimit === Infinity) {
      return {
        totalMonthsInWindow: this.historicalWindowMonths,
        monthsAtCapacity: 0,
        monthsWithSpace: this.historicalWindowMonths,
        oldestAllowedMonth: this.oldestAllowedMonth,
      };
    }

    // Calculate directly from stored data instead of regenerating all monthly quotas
    let monthsAtCapacity = 0;
    for (const usage of this.monthlyUsage.values()) {
      if (usage >= this.monthlyLimit) {
        monthsAtCapacity++;
      }
    }

    return {
      totalMonthsInWindow: this.historicalWindowMonths,
      monthsAtCapacity,
      monthsWithSpace: this.historicalWindowMonths - monthsAtCapacity,
      oldestAllowedMonth: this.oldestAllowedMonth,
    };
  }
}
