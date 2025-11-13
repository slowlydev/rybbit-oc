import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { getUserHasAdminAccessToSite } from "../../lib/auth-utils.js";
import { clickhouse } from "../../db/clickhouse/clickhouse.js";
import { updateImportProgress, completeImport, getImportById } from "../../services/import/importStatusManager.js";
import { UmamiImportMapper } from "../../services/import/mappings/umami.js";
import { importQuotaManager } from "../../services/import/importQuotaManager.js";
import { db } from "../../db/postgres/postgres.js";
import { sites } from "../../db/postgres/schema.js";
import { eq } from "drizzle-orm";

const batchImportRequestSchema = z
  .object({
    params: z.object({
      site: z.string().min(1),
      importId: z.string().uuid(),
    }),
    body: z.object({
      events: z.array(UmamiImportMapper.umamiEventKeyOnlySchema).min(1),
      isLastBatch: z.boolean().optional(),
    }),
  })
  .strict();

type BatchImportRequest = {
  Params: z.infer<typeof batchImportRequestSchema.shape.params>;
  Body: z.infer<typeof batchImportRequestSchema.shape.body>;
};

export async function batchImportEvents(request: FastifyRequest<BatchImportRequest>, reply: FastifyReply) {
  try {
    const parsed = batchImportRequestSchema.safeParse({
      params: request.params,
      body: request.body,
    });

    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation error" });
    }

    const { site, importId } = parsed.data.params;
    const { events, isLastBatch } = parsed.data.body;
    const siteId = Number(site);

    const userHasAccess = await getUserHasAdminAccessToSite(request, site);
    if (!userHasAccess) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const importRecord = await getImportById(importId);
    if (!importRecord) {
      return reply.status(404).send({ error: "Import not found" });
    }

    if (importRecord.siteId !== siteId) {
      return reply.status(400).send({ error: "Import does not belong to this site" });
    }

    if (importRecord.completedAt) {
      return reply.status(400).send({ error: "Import already completed" });
    }

    const [siteRecord] = await db
      .select({ organizationId: sites.organizationId })
      .from(sites)
      .where(eq(sites.siteId, siteId))
      .limit(1);

    if (!siteRecord) {
      return reply.status(404).send({ error: "Site not found" });
    }

    try {
      const quotaTracker = await importQuotaManager.getTracker(siteRecord.organizationId);

      const transformedEvents = UmamiImportMapper.transform(events, site, importId);
      const invalidEventCount = events.length - transformedEvents.length;

      const eventsWithinQuota = [];
      let skippedDueToQuota = 0;

      for (const event of transformedEvents) {
        if (quotaTracker.canImportEvent(event.timestamp)) {
          eventsWithinQuota.push(event);
        } else {
          skippedDueToQuota++;
        }
      }

      if (eventsWithinQuota.length > 0) {
        await clickhouse.insert({
          table: "events",
          values: eventsWithinQuota,
          format: "JSONEachRow",
        });
      }

      await updateImportProgress(importId, eventsWithinQuota.length, skippedDueToQuota, invalidEventCount);

      if (isLastBatch) {
        await completeImport(importId);
        importQuotaManager.completeImport(siteRecord.organizationId);
      }

      return reply.send();
    } catch (insertError) {
      const errorMessage = insertError instanceof Error ? insertError.message : "Unknown error";
      console.error("Failed to insert events:", errorMessage);

      return reply.status(500).send({
        error: `Failed to insert events: ${errorMessage}`,
      });
    }
  } catch (error) {
    console.error("Error importing events", error);
    return reply.status(500).send({ error: "Internal server error" });
  }
}
