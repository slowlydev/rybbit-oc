import { UseQueryResult } from "@tanstack/react-query";

export interface SubscriptionData {
  id: string;
  planName: string;
  status: "expired" | "active" | "trialing" | "free";
  currentPeriodEnd: string;
  currentPeriodStart: string;
  createdAt: string;
  monthlyEventCount: number;
  eventLimit: number;
  interval: string;
  cancelAtPeriodEnd: boolean;
  isTrial?: boolean;
  trialDaysRemaining?: number;
  message?: string; // For expired trial message
  isOverride?: boolean;
}

const UNLIMITED_SUBSCRIPTION: SubscriptionData = {
  id: "unlimited",
  planName: "Unlimited",
  status: "active",
  currentPeriodEnd: "2099-12-31T23:59:59Z",
  currentPeriodStart: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  monthlyEventCount: 0,
  eventLimit: Infinity,
  interval: "lifetime",
  cancelAtPeriodEnd: false,
};

export function useStripeSubscription(): Pick<
  UseQueryResult<SubscriptionData | undefined, Error>,
  "data" | "isLoading" | "error" | "isError" | "refetch"
> {
  return {
    data: UNLIMITED_SUBSCRIPTION,
    isLoading: false,
    error: null,
    isError: false,
    refetch: (() => Promise.resolve({ data: UNLIMITED_SUBSCRIPTION })) as any,
  };
}
