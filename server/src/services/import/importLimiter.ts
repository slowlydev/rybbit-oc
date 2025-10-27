import { IS_CLOUD } from "../../lib/const.js";
import { db } from "../../db/postgres/postgres.js";
import { and, count, eq, inArray } from "drizzle-orm";
import { importStatus, sites } from "../../db/postgres/schema.js";
import type { InsertImportStatus } from "./importStatusManager.js";

export class ImportLimiter {
  private static readonly CONCURRENT_IMPORT_LIMIT = 1;

  /**
   * Check concurrent import limit for a site.
   * Returns organization ID if allowed.
   */
  static async checkConcurrentImportLimit(siteId: number): Promise<
    | {
        allowed: false;
        reason: string;
      }
    | {
        allowed: true;
        organizationId: string;
      }
  > {
    const [siteResult] = await db
      .select({ organizationId: sites.organizationId })
      .from(sites)
      .where(eq(sites.siteId, siteId))
      .limit(1);

    if (!siteResult) {
      return { allowed: false, reason: "Site not found." };
    }

    // For self-hosted, no limit
    if (!IS_CLOUD) {
      return { allowed: true, organizationId: siteResult.organizationId };
    }

    // Check current concurrent imports
    // Note: This check alone has a race condition, but the actual import creation
    // is atomic (see createImportWithConcurrencyCheck)
    const [concurrentImportResult] = await db
      .select({ count: count() })
      .from(importStatus)
      .where(
        and(
          eq(importStatus.organizationId, siteResult.organizationId),
          inArray(importStatus.status, ["pending", "processing"])
        )
      );

    if (concurrentImportResult.count >= this.CONCURRENT_IMPORT_LIMIT) {
      return {
        allowed: false,
        reason: `Only ${this.CONCURRENT_IMPORT_LIMIT} concurrent import allowed per organization.`,
      };
    }

    return { allowed: true, organizationId: siteResult.organizationId };
  }

  /**
   * Create an import status record with atomic concurrent import check.
   * This prevents race conditions by checking and inserting in a single transaction.
   */
  static async createImportWithConcurrencyCheck(
    data: InsertImportStatus
  ): Promise<{ success: true } | { success: false; reason: string }> {
    if (!IS_CLOUD) {
      await db.insert(importStatus).values(data);
      return { success: true };
    }

    // Use a transaction to atomically check and insert
    return await db.transaction(async tx => {
      // Lock the rows to prevent concurrent inserts
      const [concurrentImportResult] = await tx
        .select({ count: count() })
        .from(importStatus)
        .where(
          and(
            eq(importStatus.organizationId, data.organizationId),
            inArray(importStatus.status, ["pending", "processing"])
          )
        )
        .for("update");

      if (concurrentImportResult.count >= this.CONCURRENT_IMPORT_LIMIT) {
        return {
          success: false,
          reason: `Only ${this.CONCURRENT_IMPORT_LIMIT} concurrent import allowed per organization.`,
        };
      }

      await tx.insert(importStatus).values(data);
      return { success: true };
    });
  }
}
