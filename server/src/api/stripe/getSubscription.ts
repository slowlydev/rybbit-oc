import { FastifyReply, FastifyRequest } from "fastify";
import { DateTime } from "luxon";

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

  const responseData = await getSubscriptionInner(organizationId);
  return reply.send(responseData);
}
