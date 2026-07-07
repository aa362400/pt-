import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { $Enums } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  assertWorkspaceInOrg,
  requireOrg,
} from '../../shared/tenancy/org-scope.js';
import type {
  CreateChannelConnectionDto,
  ListChannelsQueryDto,
  UpdateChannelConnectionDto,
  UpdateSyncStatusDto,
} from './channels.dto.js';

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: JwtPayload, dto: CreateChannelConnectionDto) {
    const orgId = requireOrg(user);
    await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);

    return this.prisma.channelConnection.create({
      data: {
        workspaceId: dto.workspaceId,
        provider: dto.provider,
        externalShopId: dto.externalShopId,
        accessTokenEncrypted: dto.accessTokenEncrypted,
        refreshTokenEncrypted: dto.refreshTokenEncrypted ?? null,
        tokenExpiresAt: dto.tokenExpiresAt
          ? new Date(dto.tokenExpiresAt)
          : null,
      },
    });
  }

  async findAll(user: JwtPayload, query: ListChannelsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ChannelConnectionWhereInput = {
      workspace: { organizationId: orgId },
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.syncStatus
        ? { syncStatus: query.syncStatus as $Enums.ChannelSyncStatus }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.channelConnection.findMany({
        where,
        orderBy: { lastSyncedAt: { sort: 'desc', nulls: 'last' } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.channelConnection.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  private async findOwned(orgId: string, id: string) {
    const channel = await this.prisma.channelConnection.findFirst({
      where: { id, workspace: { organizationId: orgId } },
    });
    if (!channel) {
      throw new NotFoundException('Channel connection not found');
    }
    return channel;
  }

  async findOne(user: JwtPayload, id: string) {
    return this.findOwned(requireOrg(user), id);
  }

  async update(user: JwtPayload, id: string, dto: UpdateChannelConnectionDto) {
    const orgId = requireOrg(user);
    const existing = await this.findOwned(orgId, id);

    return this.prisma.channelConnection.update({
      where: { id: existing.id },
      data: {
        externalShopId: dto.externalShopId,
        accessTokenEncrypted: dto.accessTokenEncrypted,
        refreshTokenEncrypted: dto.refreshTokenEncrypted,
        tokenExpiresAt: dto.tokenExpiresAt
          ? new Date(dto.tokenExpiresAt)
          : undefined,
        syncStatus: dto.syncStatus as $Enums.ChannelSyncStatus | undefined,
      },
    });
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const existing = await this.findOwned(orgId, id);
    await this.prisma.channelConnection.delete({ where: { id: existing.id } });
    return { id: existing.id };
  }

  async updateSyncStatus(user: JwtPayload, id: string, dto: UpdateSyncStatusDto) {
    const orgId = requireOrg(user);
    const existing = await this.findOwned(orgId, id);

    return this.prisma.channelConnection.update({
      where: { id: existing.id },
      data: {
        syncStatus: dto.syncStatus as $Enums.ChannelSyncStatus,
        ...(dto.syncStatus === 'SUCCESS' || dto.syncStatus === 'FAILED'
          ? { lastSyncedAt: new Date() }
          : {}),
      },
    });
  }

  async disconnect(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const existing = await this.findOwned(orgId, id);

    return this.prisma.channelConnection.update({
      where: { id: existing.id },
      data: {
        syncStatus: 'DISCONNECTED' as $Enums.ChannelSyncStatus,
      },
    });
  }
}
