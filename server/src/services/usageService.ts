// Unlocked self-hosted: no usage limits enforced
class UsageService {
  private sitesOverLimit = new Set<number>();

  public setSitesOverLimit(sites: Set<number>): void {
    this.sitesOverLimit = sites;
  }

  public startUsageCheckCron() {
    // No-op: usage limits not enforced in unlocked mode
  }
  public getSitesOverLimit(): Set<number> {
    return new Set(); // No sites are ever over limit
  }

  public isSiteOverLimit(_siteId: number): boolean {
    return false;
  }
  }
}

// Create a singleton instance
export const usageService = new UsageService();
