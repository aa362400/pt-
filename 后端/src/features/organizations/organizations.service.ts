import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg, requireOrgRole } from '../../shared/tenancy/org-scope.js';
import {
  ListOrgMembersQueryDto,
  UpdateMemberRoleDto,
  UpdateOrganizationDto,
} from './organizations.dto.js';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  async current(user: JwtPayload) {
    const orgId = requireOrg(user);
    const org = await this.tenantDatabase.run(orgId, (tx) =>
      tx.organization.findUnique({
        where: { id: orgId },
        include: {
          _count: {
            select: { memberships: true, workspaces: true, agentRuns: true },
          },
        },
      }),
    );
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  async update(user: JwtPayload, dto: UpdateOrganizationDto) {
    const orgId = requireOrg(user);
    requireOrgRole(user, ['OWNER', 'ADMIN']);

    if (dto.slug) {
      const clash = await this.prisma.organization.findFirst({
        where: { slug: dto.slug, NOT: { id: orgId } },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException('Slug already in use');
      }
    }

    const before = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, slug: true },
    });
    const org = await this.prisma.organization.update({
      where: { id: orgId },
      data: { name: dto.name, slug: dto.slug },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'organization.update',
      resourceType: 'Organization',
      resourceId: orgId,
      before,
      after: { name: org.name, slug: org.slug },
    });
    return org;
  }

  async listMembers(user: JwtPayload, query: ListOrgMembersQueryDto) {
    const orgId = requireOrg(user);
    requireOrgRole(user, ['OWNER', 'ADMIN']);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where = { organizationId: orgId };
    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.membership.findMany({
          where,
          orderBy: { createdAt: 'asc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            role: true,
            status: true,
            createdAt: true,
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true },
            },
          },
        }),
        tx.membership.count({ where }),
      ]),
    );
    return { items, total, page, limit };
  }

  private async findMember(orgId: string, membershipId: string) {
    const member = await this.tenantDatabase.run(orgId, (tx) =>
      tx.membership.findFirst({
        where: { id: membershipId, organizationId: orgId },
      }),
    );
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    return member;
  }

  async updateMemberRole(
    user: JwtPayload,
    membershipId: string,
    dto: UpdateMemberRoleDto,
  ) {
    const orgId = requireOrg(user);
    requireOrgRole(user, ['OWNER']);
    const member = await this.findMember(orgId, membershipId);

    // Never allow demoting the last OWNER — the org would become unmanageable.
    if (member.role === 'OWNER' && dto.role !== 'OWNER') {
      const owners = await this.tenantDatabase.run(orgId, (tx) =>
        tx.membership.count({
          where: { organizationId: orgId, role: 'OWNER', status: 'ACTIVE' },
        }),
      );
      if (owners <= 1) {
        throw new BadRequestException('Cannot demote the last owner');
      }
    }

    const updated = await this.tenantDatabase.run(orgId, (tx) =>
      tx.membership.update({
        where: { id: member.id },
        data: { role: dto.role },
      }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'membership.role_change',
      resourceType: 'Membership',
      resourceId: member.id,
      before: { role: member.role },
      after: { role: updated.role },
    });
    return updated;
  }

  async removeMember(user: JwtPayload, membershipId: string) {
    const orgId = requireOrg(user);
    requireOrgRole(user, ['OWNER', 'ADMIN']);
    const member = await this.findMember(orgId, membershipId);

    if (member.userId === user.sub) {
      throw new BadRequestException('Cannot remove yourself');
    }
    if (member.role === 'OWNER') {
      throw new BadRequestException('Cannot remove an owner');
    }

    const updated = await this.tenantDatabase.run(orgId, (tx) =>
      tx.membership.update({
        where: { id: member.id },
        data: { status: 'REMOVED' },
      }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'membership.remove',
      resourceType: 'Membership',
      resourceId: member.id,
      before: { status: member.status },
      after: { status: updated.status },
    });
    return { id: updated.id, status: updated.status };
  }
}
