import { authedFetch } from "../../utils";

export type SiteResponse = {
  id: string | null;
  siteId: number;
  name: string;
  domain: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  organizationId: string | null;
  public: boolean;
  saltUserIds: boolean;
  blockBots: boolean;
  isOwner: boolean;
  // Analytics features
  sessionReplay?: boolean;
  webVitals?: boolean;
  trackErrors?: boolean;
  trackOutbound?: boolean;
  trackUrlParams?: boolean;
  trackInitialPageView?: boolean;
  trackSpaNavigation?: boolean;
  trackIp?: boolean;
};

export type GetSitesFromOrgResponse = {
  organization: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    createdAt: string;
    metadata: string | null;
    stripeCustomerId: string | null;
    monthlyEventCount: number | null;
    overMonthlyLimit: boolean | null;
  } | null;
  sites: Array<{
    id: string | null;
    siteId: number;
    name: string;
    domain: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    organizationId: string | null;
    public: boolean | null;
    saltUserIds: boolean | null;
    blockBots: boolean;
    sessionsLast24Hours: number;
    isOwner: boolean;
  }>;
  subscription: {
    monthlyEventCount: number;
    eventLimit: number;
    overMonthlyLimit: boolean;
    planName: string;
    status: string;
    isPro: boolean;
  };
};

export function fetchSitesFromOrg(organizationId: string) {
  return authedFetch<GetSitesFromOrgResponse>(`/organizations/${organizationId}/sites`);
}

export function addSite(
  domain: string,
  name: string,
  organizationId: string,
  settings?: {
    isPublic?: boolean;
    saltUserIds?: boolean;
    blockBots?: boolean;
  }
) {
  return authedFetch<{ siteId: number }>("/sites", undefined, {
    method: "POST",
    data: {
      domain,
      name,
      organizationId,
      public: settings?.isPublic || false,
      saltUserIds: settings?.saltUserIds || false,
      blockBots: settings?.blockBots === undefined ? true : settings?.blockBots,
    },
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function deleteSite(siteId: number) {
  return authedFetch(`/sites/${siteId}`, undefined, {
    method: "DELETE",
  });
}

// Consolidated function to update any site configuration
export function updateSiteConfig(
  siteId: number,
  config: {
    domain?: string;
    public?: boolean;
    saltUserIds?: boolean;
    blockBots?: boolean;
    excludedIPs?: string[];
    excludedCountries?: string[];
    sessionReplay?: boolean;
    webVitals?: boolean;
    trackErrors?: boolean;
    trackOutbound?: boolean;
    trackUrlParams?: boolean;
    trackInitialPageView?: boolean;
    trackSpaNavigation?: boolean;
  }
) {
  return authedFetch(`/sites/${siteId}/config`, undefined, {
    method: "PUT",
    data: config,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function fetchSite(siteId: string | number) {
  return authedFetch<SiteResponse>(`/sites/${siteId}`);
}

export function fetchSiteHasData(siteId: string) {
  return authedFetch<{ hasData: boolean }>(`/site-has-data/${siteId}`);
}

export function fetchSiteIsPublic(siteId: string | number) {
  return authedFetch<{ isPublic: boolean }>(`/site-is-public/${siteId}`);
}
