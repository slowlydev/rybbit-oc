import { FastifyReply, FastifyRequest } from "fastify";
import { getImportsForSite } from "../../services/import/importStatusManager.js";
import { z } from "zod";

const getSiteImportsRequestSchema = z
  .object({
    params: z.object({
      siteId: z.coerce.number().int().positive(),
    }),
  })
  .strict();

type GetSiteImportsRequest = {
  Params: z.infer<typeof getSiteImportsRequestSchema.shape.params>;
};

export async function getSiteImports(request: FastifyRequest<GetSiteImportsRequest>, reply: FastifyReply) {
  try {
    const parsed = getSiteImportsRequestSchema.safeParse({
      params: request.params,
    });

    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation error" });
    }

    const { siteId } = parsed.data.params;

    const imports = await getImportsForSite(siteId);

    return reply.send({
      data: imports.map(
        ({ importId, platform, importedEvents, skippedEvents, invalidEvents, startedAt, completedAt }) => ({
          importId,
          platform,
          importedEvents,
          skippedEvents,
          invalidEvents,
          startedAt,
          completedAt,
        })
      ),
    });
  } catch (error) {
    console.error("Error fetching imports:", error);
    return reply.status(500).send({ error: "Internal server error" });
  }
}
