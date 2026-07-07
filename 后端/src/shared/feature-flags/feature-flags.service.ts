import { Injectable } from '@nestjs/common';

export interface FlagEntry {
  name: string;
  enabled: boolean;
  orgIds: string[];
}

/**
 * In-memory feature flag store with an interface ready for a database-backed
 * implementation. Used for gray-release (canary) rollouts where a flag is
 * enabled for specific organizations before global rollout.
 */
@Injectable()
export class FeatureFlagsService {
  // Feature flags stored in a simple config (could be DB-backed later)
  private flags: Record<string, FlagEntry> = {
    'new-dashboard': { name: 'new-dashboard', enabled: false, orgIds: [] },
    'ai-agent-v2': { name: 'ai-agent-v2', enabled: false, orgIds: [] },
    'batch-listing-generation': {
      name: 'batch-listing-generation',
      enabled: false,
      orgIds: [],
    },
    'real-time-collaboration': {
      name: 'real-time-collaboration',
      enabled: false,
      orgIds: [],
    },
  };

  /** List all feature flags with their current status. */
  listFlags(): FlagEntry[] {
    return Object.values(this.flags);
  }

  /** Get a single flag definition. */
  getFlag(flag: string): FlagEntry | undefined {
    return this.flags[flag];
  }

  /** Check if flag is enabled for an organization. */
  isEnabled(flag: string, orgId?: string): boolean {
    const entry = this.flags[flag];
    if (!entry) return false;
    if (!entry.enabled) return false;
    // If orgIds are specified, only those orgs see the feature
    if (entry.orgIds.length > 0 && orgId) {
      return entry.orgIds.includes(orgId);
    }
    return true;
  }

  /** Enable a flag globally. */
  enable(flag: string): void {
    const entry = this.flags[flag];
    if (entry) {
      entry.enabled = true;
      entry.orgIds = [];
    }
  }

  /** Disable a flag globally. */
  disable(flag: string): void {
    const entry = this.flags[flag];
    if (entry) {
      entry.enabled = false;
      entry.orgIds = [];
    }
  }

  /** Enable a flag for specific orgs (gray release). */
  enableForOrg(flag: string, orgId: string): void {
    const entry = this.flags[flag];
    if (entry) {
      entry.enabled = true;
      if (!entry.orgIds.includes(orgId)) {
        entry.orgIds.push(orgId);
      }
    }
  }

  /** Disable a flag for a specific org. */
  disableForOrg(flag: string, orgId: string): void {
    const entry = this.flags[flag];
    if (entry) {
      entry.orgIds = entry.orgIds.filter((id) => id !== orgId);
      if (entry.orgIds.length === 0) {
        entry.enabled = false;
      }
    }
  }
}
