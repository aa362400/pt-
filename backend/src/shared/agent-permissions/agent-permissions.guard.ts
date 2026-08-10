import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AgentPermissionsService,
  AgentPermissionLevel,
} from './agent-permissions.service.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import type { Request } from 'express';

export const AGENT_PERMISSION_KEY = 'agent_permission';

// Augment Express Request to include agentPermission
declare module 'express' {
  interface Request {
    agentPermission?: {
      allowed: boolean;
      level: AgentPermissionLevel;
      requireConfirm: boolean;
    };
  }
}

/**
 * NestJS guard that checks whether the authenticated agent (or user acting
 * on behalf of an agent) has the required permission level for a given action.
 *
 * Usage (controller method):
 *   @RequireAgentPermission('listing.publish')
 *   async publishListing(...) { ... }
 *
 * The guard reads orgId from the JWT payload (user.orgId). If the action
 * is not explicitly annotated, the route is skipped (no permission check).
 */
@Injectable()
export class AgentPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: AgentPermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const actionName = this.reflector.getAllAndOverride<string>(
      AGENT_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permission annotation → skip guard (allow)
    if (!actionName) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;

    const orgId = user?.orgId;
    if (!orgId) {
      throw new ForbiddenException(
        'No organization context available for permission check',
      );
    }

    const result = await this.permissions.check(orgId, actionName);

    if (!result.allowed) {
      throw new ForbiddenException(
        `Agent action "${actionName}" is not allowed for this organization`,
      );
    }

    // Attach permission info to request for downstream use
    request.agentPermission = result;

    return true;
  }
}
