import { access, constants } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { parse } from "@fast-csv/parse";
import { DateTime } from "luxon";
import { getJobQueue } from "../../../queues/jobQueueFactory.js";
import { r2Storage } from "../../storage/r2StorageService.js";
import { CSV_PARSE_QUEUE, CsvParseJob, DATA_INSERT_QUEUE, DataInsertJob } from "./jobs.js";
import { UmamiEvent, umamiHeaders } from "../mappings/umami.js";
import { updateImportStatus } from "../importStatusManager.js";
import { deleteImportFile } from "../utils.js";
import { ImportQuotaTracker } from "../importQuotaChecker.js";

const getImportDataHeaders = (platform: string) => {
  switch (platform) {
    case "umami":
      return umamiHeaders;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
};

const createR2FileStream = async (storageLocation: string, platform: string) => {
  console.log(`[CSV Parser] Reading from R2: ${storageLocation}`);
  const fileStream = await r2Storage.getImportFileStream(storageLocation);
  return fileStream.pipe(
    parse({
      headers: getImportDataHeaders(platform),
      renameHeaders: true,
      ignoreEmpty: true,
    })
  );
};

const createLocalFileStream = async (storageLocation: string, platform: string) => {
  console.log(`[CSV Parser] Reading from local disk: ${storageLocation}`);
  await access(storageLocation, constants.F_OK | constants.R_OK);
  return createReadStream(storageLocation).pipe(
    parse({
      headers: getImportDataHeaders(platform),
      renameHeaders: true,
      ignoreEmpty: true,
    })
  );
};

/**
 * Create a date range filter function.
 * Parses start/end dates once for performance.
 */
const createDateRangeFilter = (startDateStr?: string, endDateStr?: string) => {
  // Parse dates once, not for every row
  const startDate = startDateStr
    ? DateTime.fromFormat(startDateStr, "yyyy-MM-dd", { zone: "utc" }).startOf("day")
    : null;

  const endDate = endDateStr ? DateTime.fromFormat(endDateStr, "yyyy-MM-dd", { zone: "utc" }).endOf("day") : null;

  // Validate parsed dates
  if (startDate && !startDate.isValid) {
    throw new Error(`Invalid start date: ${startDateStr}`);
  }
  if (endDate && !endDate.isValid) {
    throw new Error(`Invalid end date: ${endDateStr}`);
  }

  // Return fast filter function
  return (dateStr: string): boolean => {
    const createdAt = DateTime.fromFormat(dateStr, "yyyy-MM-dd HH:mm:ss", { zone: "utc" });
    if (!createdAt.isValid) {
      return false;
    }

    if (startDate && createdAt < startDate) {
      return false;
    }

    if (endDate && createdAt > endDate) {
      return false;
    }

    return true;
  };
};

export async function registerCsvParseWorker() {
  const jobQueue = getJobQueue();

  await jobQueue.work<CsvParseJob>(CSV_PARSE_QUEUE, { batchSize: 1, pollingIntervalSeconds: 10 }, async ([job]) => {
    const { site, importId, platform, storageLocation, isR2Storage, organization, startDate, endDate } = job.data;

    let stream: ReturnType<typeof parse> | null = null;
    let processingTimeout: NodeJS.Timeout | null = null;

    try {
      const quotaTracker = await ImportQuotaTracker.create(organization);

      const chunkSize = 5000;
      const MAX_ROWS = 10_000_000; // 10 million rows max
      const PROCESSING_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes max

      let chunk: UmamiEvent[] = [];
      let totalAccepted = 0;
      let totalSkippedQuota = 0;
      let totalSkippedDate = 0;
      let totalRowsProcessed = 0;
      let chunksSent = 0;

      stream = isR2Storage
        ? await createR2FileStream(storageLocation, platform)
        : await createLocalFileStream(storageLocation, platform);

      // Add explicit error handler before starting to consume the stream
      stream.on("error", error => {
        console.error(`[Import ${importId}] Stream error:`, error);
        // Error will be caught by the outer try/catch
      });

      await updateImportStatus(importId, "processing");

      // Set timeout to prevent indefinite processing
      processingTimeout = setTimeout(() => {
        if (stream) {
          stream.destroy(new Error("Import processing timeout exceeded"));
        }
      }, PROCESSING_TIMEOUT_MS);

      const isDateInRange = createDateRangeFilter(startDate, endDate);

      for await (const data of stream) {
        totalRowsProcessed++;

        // Enforce row count limit to prevent memory exhaustion
        if (totalRowsProcessed > MAX_ROWS) {
          throw new Error(`Import exceeds maximum row limit of ${MAX_ROWS.toLocaleString()}`);
        }

        // Skip rows with missing or invalid dates
        if (!data.created_at) {
          continue;
        }

        // Apply user-specified date range filter
        if (!isDateInRange(data.created_at)) {
          totalSkippedDate++;
          continue;
        }

        // Check per-month quota (includes historical window check)
        if (!quotaTracker.canImportEvent(data.created_at)) {
          totalSkippedQuota++;
          continue;
        }

        // Event passed all filters - add to chunk
        chunk.push(data);
        totalAccepted++;

        if (chunk.length >= chunkSize) {
          await jobQueue.send<DataInsertJob>(DATA_INSERT_QUEUE, {
            site,
            importId,
            platform,
            chunk,
            chunkNumber: chunksSent,
            allChunksSent: false,
          });
          chunksSent++;
          chunk = [];
        }
      }

      console.info(
        `[Import ${importId}] Processed CSV: ${totalAccepted} events accepted, ` +
          `${totalSkippedQuota} skipped (quota/window), ${totalSkippedDate} skipped (date filter)`
      );

      // Check if no events could be imported due to quotas
      if (totalAccepted === 0 && totalSkippedQuota > 0) {
        const quotaSummary = quotaTracker.getSummary();
        const errorMessage =
          `No events could be imported. All ${totalSkippedQuota} events exceeded monthly quotas or fell outside the ${quotaSummary.totalMonthsInWindow}-month historical window. ` +
          `${quotaSummary.monthsAtCapacity} of ${quotaSummary.totalMonthsInWindow} months are at full capacity. ` +
          `Try importing newer data or upgrade your plan for higher monthly quotas.`;
        await updateImportStatus(importId, "failed", errorMessage);
        const deleteResult = await deleteImportFile(storageLocation, isR2Storage);
        if (!deleteResult.success) {
          console.warn(`[Import ${importId}] File cleanup failed: ${deleteResult.error}`);
        }
        return;
      }

      // Send final chunk if any data remains
      if (chunk.length > 0) {
        await jobQueue.send<DataInsertJob>(DATA_INSERT_QUEUE, {
          site,
          importId,
          platform,
          chunk,
          chunkNumber: chunksSent,
          allChunksSent: false,
        });
        chunksSent++;
      }

      // Send finalization signal with total chunk count
      await jobQueue.send<DataInsertJob>(DATA_INSERT_QUEUE, {
        site,
        importId,
        platform,
        chunk: [],
        totalChunks: chunksSent,
        allChunksSent: true,
      });
    } catch (error) {
      console.error(`[Import ${importId}] Error in CSV parse worker:`, error);

      await updateImportStatus(importId, "failed", "An unexpected error occurred during import processing");

      // Don't re-throw - worker should continue processing other jobs
      console.error(`[Import ${importId}] Import failed, worker continuing`);
    } finally {
      // Clean up timeout
      if (processingTimeout) {
        clearTimeout(processingTimeout);
      }

      // Ensure stream is destroyed to prevent memory leaks
      if (stream) {
        try {
          stream.destroy();
        } catch (streamError) {
          console.warn(`[Import ${importId}] Failed to destroy stream:`, streamError);
        }
      }

      // Clean up file - don't throw on failure to prevent worker crashes
      const deleteResult = await deleteImportFile(storageLocation, isR2Storage);
      if (!deleteResult.success) {
        console.warn(`[Import ${importId}] File cleanup failed, will remain in storage: ${deleteResult.error}`);
        // File will be orphaned but import status is already recorded
        // importCleanupService.ts handles orphans
      }
    }
  });
}
