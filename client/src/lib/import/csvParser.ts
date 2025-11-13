import Papa from "papaparse";
import { DateTime } from "luxon";
import { authedFetch } from "@/api/utils";

interface UmamiEvent {
  session_id: string;
  hostname: string;
  browser: string;
  os: string;
  device: string;
  screen: string;
  language: string;
  country: string;
  region: string;
  city: string;
  url_path: string;
  url_query: string;
  referrer_path: string;
  referrer_query: string;
  referrer_domain: string;
  page_title: string;
  event_type: string;
  event_name: string;
  distinct_id: string;
  created_at: string;
}

export class CsvParser {
  private aborted = false;
  private siteId: number = 0;
  private importId: string = "";
  private platform: "umami" = "umami";

  private earliestAllowedDate: DateTime | null = null;
  private latestAllowedDate: DateTime | null = null;

  private uploadQueue: Array<UmamiEvent[]> = [];
  private isProcessing = false;
  private parsingComplete = false;

  startImport(
    file: File,
    siteId: number,
    importId: string,
    platform: "umami",
    earliestAllowedDate: string,
    latestAllowedDate: string,
  ): void {
    this.siteId = siteId;
    this.importId = importId;
    this.platform = platform;

    this.earliestAllowedDate = DateTime.fromFormat(earliestAllowedDate, "yyyy-MM-dd", { zone: "utc" }).startOf("day");
    this.latestAllowedDate = DateTime.fromFormat(latestAllowedDate, "yyyy-MM-dd", { zone: "utc" }).endOf("day");

    if (!this.earliestAllowedDate.isValid) {
      this.aborted = true;
      return;
    }

    if (!this.latestAllowedDate.isValid) {
      this.aborted = true;
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      worker: true,
      chunkSize: 9 * 1024 * 1024,
      chunk: (results, parser) => {
        if (this.aborted) {
          parser.abort();
          return;
        }

        const validEvents: UmamiEvent[] = [];
        for (const row of results.data) {
          const event = this.transformRow(row);
          if (event && event.created_at && this.isDateInRange(event.created_at)) {
            validEvents.push(event);
          }
        }

        this.uploadQueue.push(validEvents);
        this.processQueue();
      },
      complete: () => {
        if (this.aborted) return;

        this.parsingComplete = true;
        this.processQueue();
      },
      error: () => {
        if (this.aborted) return;
        this.aborted = true;
      },
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.uploadQueue.length > 0) {
      if (this.aborted) {
        this.uploadQueue = [];
        break;
      }

      const events = this.uploadQueue.shift()!;
      await this.uploadChunk(events, false);
    }

    this.isProcessing = false;

    if (this.parsingComplete && this.uploadQueue.length === 0 && !this.aborted) {
      await this.uploadChunk([], true);
    }
  }

  private isDateInRange(dateStr: string): boolean {
    const createdAt = DateTime.fromFormat(dateStr, "yyyy-MM-dd HH:mm:ss", { zone: "utc" });
    if (!createdAt.isValid) {
      return false;
    }

    if (this.earliestAllowedDate && createdAt < this.earliestAllowedDate) {
      return false;
    }

    if (this.latestAllowedDate && createdAt > this.latestAllowedDate) {
      return false;
    }

    return true;
  }

  private transformRow(row: unknown): UmamiEvent | null {
    const rawEvent = row as Record<string, string>;

    const umamiEvent: UmamiEvent = {
      session_id: rawEvent.session_id,
      hostname: rawEvent.hostname,
      browser: rawEvent.browser,
      os: rawEvent.os,
      device: rawEvent.device,
      screen: rawEvent.screen,
      language: rawEvent.language,
      country: rawEvent.country,
      region: rawEvent.region,
      city: rawEvent.city,
      url_path: rawEvent.url_path,
      url_query: rawEvent.url_query,
      referrer_path: rawEvent.referrer_path,
      referrer_query: rawEvent.referrer_query,
      referrer_domain: rawEvent.referrer_domain,
      page_title: rawEvent.page_title,
      event_type: rawEvent.event_type,
      event_name: rawEvent.event_name,
      distinct_id: rawEvent.distinct_id,
      created_at: rawEvent.created_at,
    };

    if (!umamiEvent.created_at) {
      return null;
    }

    return umamiEvent;
  }

  private async uploadChunk(events: UmamiEvent[], isLastBatch: boolean): Promise<void> {
    // Skip empty chunks unless it's the last one (needed for finalization)
    if (events.length === 0 && !isLastBatch) {
      return;
    }

    try {
      await authedFetch(`/api/batch-import-events/${this.siteId}/${this.importId}`, undefined, {
        method: "POST",
        data: {
          events,
          isLastBatch,
        },
      });
    } catch (error) {
      console.error("Error uploading chunk:", error);
      this.aborted = true;
      return;
    }
  }

  terminate() {
    this.aborted = true;
  }
}
