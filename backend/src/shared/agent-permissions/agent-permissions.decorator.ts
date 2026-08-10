import { SetMetadata } from '@nestjs/common';
import { AGENT_PERMISSION_KEY } from './agent-permissions.guard.js';

/**
 * Decorator that marks a controller method as requiring a specific agent
 * permission level. Used together with AgentPermissionsGuard.
 *
 * @example
 *   @RequireAgentPermission('listing.publish')
 *   async publishListing() { ... }
 */
export const RequireAgentPermission = (actionName: string) =>
  SetMetadata(AGENT_PERMISSION_KEY, actionName);
