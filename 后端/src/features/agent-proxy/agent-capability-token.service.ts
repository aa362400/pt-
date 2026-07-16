import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';

const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 3600;

interface IssueCapabilityInput {
  organizationId: string;
  workspaceId?: string;
  actorId: string;
  actions: string[];
  ttlSeconds: number;
  description?: string;
}

interface ValidateCapabilityInput {
  rawToken?: string;
  organizationId: string;
  workspaceId?: string;
  action: string;
}

@Injectable()
export class AgentCapabilityTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  async issue(input: IssueCapabilityInput) {
    const actions = [...new Set(input.actions.map((action) => action.trim()))]
      .filter(Boolean)
      .sort();
    if (actions.length === 0) {
      throw new BadRequestException(
        'At least one capability action is required',
      );
    }
    if (
      !Number.isInteger(input.ttlSeconds) ||
      input.ttlSeconds < MIN_TTL_SECONDS ||
      input.ttlSeconds > MAX_TTL_SECONDS
    ) {
      throw new BadRequestException(
        `Capability TTL must be between ${MIN_TTL_SECONDS} and ${MAX_TTL_SECONDS} seconds`,
      );
    }
    if (input.workspaceId) {
      const workspace = await this.tenantDatabase.run(
        input.organizationId,
        (tx) =>
          tx.workspace.findFirst({
            where: {
              id: input.workspaceId,
              organizationId: input.organizationId,
            },
            select: { id: true },
          }),
      );
      if (!workspace) {
        throw new BadRequestException(
          'Workspace does not belong to organization',
        );
      }
    }

    const token = `acp_${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
    const record = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.agentCapabilityToken.create({
        data: {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          actorId: input.actorId,
          tokenHash: this.hash(token),
          actions,
          description: input.description?.trim() || undefined,
          expiresAt,
        },
        select: {
          id: true,
          organizationId: true,
          workspaceId: true,
          actorId: true,
          actions: true,
          description: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
    );
    return { ...record, token };
  }

  async validate(input: ValidateCapabilityInput) {
    if (!input.rawToken?.startsWith('acp_')) {
      throw new UnauthorizedException('Agent capability token is required');
    }
    return this.tenantDatabase.run(input.organizationId, async (tx) => {
      const record = await tx.agentCapabilityToken.findUnique({
        where: { tokenHash: this.hash(input.rawToken!) },
        select: {
          id: true,
          organizationId: true,
          workspaceId: true,
          actorId: true,
          actions: true,
          expiresAt: true,
          revokedAt: true,
        },
      });
      const now = new Date();
      if (!record || record.revokedAt || record.expiresAt <= now) {
        throw new UnauthorizedException(
          'Agent capability token is invalid or expired',
        );
      }
      if (record.organizationId !== input.organizationId) {
        throw new ForbiddenException('Capability organization scope mismatch');
      }
      if (record.workspaceId && record.workspaceId !== input.workspaceId) {
        throw new ForbiddenException('Capability workspace scope mismatch');
      }
      if (!record.actions.includes(input.action)) {
        throw new ForbiddenException('Capability action scope mismatch');
      }
      await tx.agentCapabilityToken.update({
        where: { id: record.id },
        data: { lastUsedAt: now },
        select: { id: true },
      });
      return {
        id: record.id,
        actorId: record.actorId,
        expiresAt: record.expiresAt,
      };
    });
  }

  list(organizationId: string) {
    return this.tenantDatabase.run(organizationId, (tx) =>
      tx.agentCapabilityToken.findMany({
        where: { organizationId },
        select: {
          id: true,
          workspaceId: true,
          actorId: true,
          actions: true,
          description: true,
          expiresAt: true,
          revokedAt: true,
          lastUsedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  async revoke(organizationId: string, id: string) {
    const result = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.agentCapabilityToken.updateMany({
        where: { id, organizationId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
    if (result.count !== 1) {
      throw new BadRequestException(
        'Capability token not found or already revoked',
      );
    }
    return { id, revoked: true };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
