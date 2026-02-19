import { DateTime } from "luxon";
import { clickhouse } from "../../db/clickhouse/clickhouse.js";
import { db } from "../../db/postgres/postgres.js";
import { sites, organization } from "../../db/postgres/schema.js";
import { eq } from "drizzle-orm";
import { processResults } from "../../api/analytics/utils/utils.js";
import { getBestSubscription, type SubscriptionInfo } from "../../lib/subscriptionUtils.js";

/**
 * Get the number of months of historical data allowed for import based on subscription tier.
 * In unlocked mode, unlimited historical data is allowed.
 */
function getHistoricalWindowMonths(subscription: SubscriptionInfo): number {
  if (subscription.source === "unlimited") {
    return 600; // 50 years — effectively unlimited
  }

  // Fallback for free tier
  return 6;
}

export class ImportQuotaTracker {
  private monthlyUsage: Map<string, number>;
  private readonly monthlyLimit: number;
  private readonly oldestAllowedMonth: string;

  private constructor(monthlyUsage: Map<string, number>, monthlyLimit: number, oldestAllowedMonth: string) {
    this.monthlyUsage = monthlyUsage;
    this.monthlyLimit = monthlyLimit;
    this.oldestAllowedMonth = oldestAllowedMonth;
  }

  static async create(organizationId: string): Promise<ImportQuotaTracker> {
    // In unlocked mode, no quota enforcement
    return new ImportQuotaTracker(new Map(), Infinity, "190001");
  }

  /**
   * Atomically check and reserve quota for a batch of events.
   * This method prevents race conditions by checking all events in a batch
   * and atomically updating usage counts for all months at once.
   *
   * @param timestamps - Array of event timestamps to check
   * @returns Array of indices indicating which events can be imported
   */
  canImportBatch(timestamps: string[]): number[] {
    if (this.monthlyLimit === Infinity) {
      return timestamps.map((_, i) => i);
    }

    const allowedIndices: number[] = [];
    const monthlyIncrements = new Map<string, number>();
    const now = DateTime.utc();

    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      const dt = DateTime.fromFormat(timestamp, "yyyy-MM-dd HH:mm:ss", { zone: "utc" });

      if (!dt.isValid || dt > now) {
        continue;
      }

      const month = dt.toFormat("yyyyMM");
      if (month < this.oldestAllowedMonth) {
        continue;
      }

      const currentUsage = this.monthlyUsage.get(month) || 0;
      const incrementInBatch = monthlyIncrements.get(month) || 0;
      const totalUsage = currentUsage + incrementInBatch;

      if (totalUsage < this.monthlyLimit) {
        allowedIndices.push(i);
        monthlyIncrements.set(month, incrementInBatch + 1);
      }
    }

    // Atomically apply all increments at once
    for (const [month, increment] of monthlyIncrements) {
      const current = this.monthlyUsage.get(month) || 0;
      this.monthlyUsage.set(month, current + increment);
    }

    return allowedIndices;
  }

  getOldestAllowedMonth(): string {
    return this.oldestAllowedMonth;
  }
}
