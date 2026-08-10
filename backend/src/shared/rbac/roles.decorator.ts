import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Mirrors Prisma `MembershipRole` (OWNER | ADMIN | MEMBER | VIEWER). */
export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
