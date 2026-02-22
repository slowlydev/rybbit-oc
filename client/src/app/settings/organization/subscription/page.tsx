"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useStripeSubscription } from "../../../../lib/subscription/useStripeSubscription";
import { NoOrganization } from "../../../../components/NoOrganization";
import { useSetPageTitle } from "../../../../hooks/useSetPageTitle";
import { useExtracted } from "next-intl";
import { authClient } from "@/lib/auth";
import { Infinity as InfinityIcon } from "lucide-react";

export default function OrganizationSubscriptionPage() {
  useSetPageTitle("Organization Subscription");
  const t = useExtracted();
  const { data: activeSubscription, isLoading: isLoadingSubscription } = useStripeSubscription();

  const { data: activeOrg, isPending } = authClient.useActiveOrganization();

  const isLoading = isLoadingSubscription || isPending;

  const renderPlanComponent = () => {
    if (!activeOrg && !isPending) {
      return (
        <NoOrganization message={t("You need to select an organization to manage your subscription.")} />
      );
    }

    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <InfinityIcon className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                {activeSubscription?.planName ?? "Unlimited"}
              </h2>
              <p className="text-sm text-neutral-400">Self-hosted</p>
            </div>
          </div>
          <p className="text-neutral-300">
            Your self-hosted instance has unlimited access to all features with
            no event limits.
          </p>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-20 w-full mt-4" />
            </div>
          </CardContent>
        </Card>
      ) : (
        renderPlanComponent()
      )}
    </div>
  );
}
