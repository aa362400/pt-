import { SetMetadata } from '@nestjs/common';

export const QUOTA_RESOURCE_KEY = 'QUOTA_RESOURCE';

/**
 * Decorator that marks an endpoint as quota-checked.
 * When used together with the QuotaGuard, it checks the organization's
 * plan limit for the given resource before the handler executes.
 *
 * @param resource The resource type to check against plan limits.
 *   Supported values: 'products' | 'agentRuns' | 'members' | 'storage' | 'workspaces'
 */
export const QuotaResource = (resource: string) =>
  SetMetadata(QUOTA_RESOURCE_KEY, resource);
