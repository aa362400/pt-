import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import type { Role } from '../rbac/roles.decorator.js';

/** Returns the caller's organization id or throws 403. */
export function requireOrg(user: JwtPayload): string {
  if (!user.orgId) {
    throw new ForbiddenException('User does not belong to an organization');
  }
  return user.orgId;
}

export function requireOrgRole(user: JwtPayload, allowed: Role[]): Role {
  const role = (user.role ?? 'MEMBER').toUpperCase() as Role;
  if (!allowed.includes(role)) {
    throw new ForbiddenException('Insufficient organization permissions');
  }
  return role;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Asserts that a workspace belongs to the caller's organization. */
export async function assertWorkspaceInOrg(
  prisma: PrismaService,
  orgId: string,
  workspaceId: string,
): Promise<void> {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, organizationId: orgId },
    select: { id: true },
  });
  if (!workspace) {
    throw new NotFoundException('Workspace not found');
  }
}
