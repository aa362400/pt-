import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';

export interface StoreAgentProfileInput {
  targetCategories?: string[];
  forbiddenTerms?: string[];
  minimumProfitMargin?: number | null;
  notes?: string | null;
}

export interface StoreResearchContext {
  workspaceId: string;
  targetCategories: string[];
  forbiddenTerms: string[];
  minimumProfitMargin: number | null;
  notes: string | null;
}

@Injectable()
export class StoreAgentProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  async findForWorkspace(user: JwtPayload, workspaceId: string) {
    const orgId = requireOrg(user);
    await this.requireOzonWorkspace(orgId, workspaceId);
    const profile = await this.prisma.storeAgentProfile.findUnique({
      where: { workspaceId },
    });
    return this.toPublicProfile(workspaceId, profile);
  }

  async upsertForWorkspace(
    user: JwtPayload,
    workspaceId: string,
    input: StoreAgentProfileInput,
  ) {
    const orgId = requireOrg(user);
    await this.requireOzonWorkspace(orgId, workspaceId);
    const before = await this.prisma.storeAgentProfile.findUnique({
      where: { workspaceId },
    });
    const data = this.normalizeInput(input);
    const profile = await this.prisma.storeAgentProfile.upsert({
      where: { workspaceId },
      create: { workspaceId, ...data },
      update: data,
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'store-agent-profile.update',
      resourceType: 'StoreAgentProfile',
      resourceId: workspaceId,
      before: before ? this.toPublicProfile(workspaceId, before) : null,
      after: this.toPublicProfile(workspaceId, profile),
    });
    return this.toPublicProfile(workspaceId, profile);
  }

  /**
   * Returns only durable seller preferences that are useful to a research task.
   * A missing profile is intentionally represented as no context, never as
   * default business assumptions.
   */
  async buildResearchContext(
    organizationId: string,
    workspaceId?: string | null,
  ): Promise<StoreResearchContext | null> {
    if (!workspaceId) {
      return null;
    }
    const workspace = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.workspace.findFirst({
        where: {
          id: workspaceId,
          organizationId,
          channelType: 'OZON',
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
    );
    if (!workspace) {
      return null;
    }
    const profile = await this.prisma.storeAgentProfile.findUnique({
      where: { workspaceId: workspace.id },
    });
    return profile ? this.toPublicProfile(workspace.id, profile) : null;
  }

  private async requireOzonWorkspace(
    organizationId: string,
    workspaceId: string,
  ) {
    const workspace = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.workspace.findFirst({
        where: { id: workspaceId, organizationId },
        select: { id: true, channelType: true },
      }),
    );
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    if (workspace.channelType !== 'OZON') {
      throw new BadRequestException(
        'Store agent profile is available for Ozon workspaces only',
      );
    }
    return workspace;
  }

  private normalizeInput(input: StoreAgentProfileInput): {
    targetCategories: string[];
    forbiddenTerms: string[];
    minimumProfitMargin: number | null;
    notes: string | null;
  } {
    const minimumProfitMargin = input.minimumProfitMargin;
    if (
      minimumProfitMargin !== undefined &&
      minimumProfitMargin !== null &&
      (!Number.isFinite(minimumProfitMargin) ||
        minimumProfitMargin < 0 ||
        minimumProfitMargin > 100)
    ) {
      throw new BadRequestException(
        'minimumProfitMargin must be between 0 and 100',
      );
    }
    return {
      targetCategories: this.normalizeList(input.targetCategories),
      forbiddenTerms: this.normalizeList(input.forbiddenTerms),
      minimumProfitMargin: minimumProfitMargin ?? null,
      notes: this.normalizeNotes(input.notes),
    };
  }

  private toPublicProfile(
    workspaceId: string,
    profile: {
      targetCategories: string[];
      forbiddenTerms: string[];
      minimumProfitMargin: number | null;
      notes: string | null;
    } | null,
  ): StoreResearchContext {
    return {
      workspaceId,
      targetCategories: profile?.targetCategories ?? [],
      forbiddenTerms: profile?.forbiddenTerms ?? [],
      minimumProfitMargin: profile?.minimumProfitMargin ?? null,
      notes: profile?.notes ?? null,
    };
  }

  private normalizeList(values?: string[]): string[] {
    if (!Array.isArray(values)) {
      return [];
    }
    return [
      ...new Set(
        values
          .map((value) => String(value).trim())
          .filter((value) => value.length > 0)
          .map((value) => value.slice(0, 80)),
      ),
    ].slice(0, 30);
  }

  private normalizeNotes(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const notes = value.trim();
    return notes ? notes.slice(0, 2000) : null;
  }
}
