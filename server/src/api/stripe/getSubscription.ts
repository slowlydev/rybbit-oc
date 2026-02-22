import { eq, and } from "drizzle-orm";
import { FastifyReply, FastifyRequest } from "fastify";
import { DateTime } from "luxon";
import { db } from "../../db/postgres/postgres.js";
import { member } from "../../db/postgres/schema.js";

function getStartOfMonth() {
  return DateTime.now().startOf("month").toJSDate();
}

function getStartOfNextMonth() {
  return DateTime.now().startOf("month").plus({ months: 1 }).toJSDate();
}

export async function getSubscriptionInner(_organizationId: string) {
  // Unlocked self-hosted: every org gets unlimited
  return {
    id: null,
    planName: "pro-unlimited",
    status: "active",
    currentPeriodEnd: getStartOfNextMonth(),
    currentPeriodStart: getStartOfMonth(),
    eventLimit: Infinity,
    monthlyEventCount: 0,
    interval: "month",
    cancelAtPeriodEnd: false,
  };
}

export async function getSubscription(
  request: FastifyRequest<{
    Querystring: {
      organizationId: string;
    };
  }>,
  reply: FastifyReply
) {
  const userId = request.user?.id;
  const { organizationId } = request.query;

  if (!userId) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  if (!organizationId) {
    return reply.status(400).send({ error: "Organization ID is required" });
  }

  // Verify user is a member of this organization
  const memberResult = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
    .limit(1);

  if (!memberResult.length) {
    return reply.status(403).send({ error: "You do not have access to this organization" });
  }

  try {
    const responseData = await getSubscriptionInner(organizationId);
    return reply.send(responseData);
  } catch (error: any) {
    console.error("Get Subscription Error:", error);
    return reply.status(500).send({
      error: "Failed to fetch subscription details",
      details: error.message,
    });
  }
}
