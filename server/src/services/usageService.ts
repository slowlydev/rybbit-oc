// Unlocked self-hosted: no usage limits enforced
class UsageService {
  public getSitesOverLimit(): Set<number> {
    return new Set(); // No sites are ever over limit
  }

  public isSiteOverLimit(_siteId: number): boolean {
    return false;
  }
}

// Create a singleton instance
export const usageService = new UsageService();
