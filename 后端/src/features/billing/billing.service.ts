import { Injectable, NotFoundException } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import type { UpdatePlanDto } from './billing.dto.js';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlanInfo() {
    return [
      {
        name: 'FREE',
        description: 'For individuals exploring ShopMate AI',
        monthlyPrice: 0,
        features: [
          'Up to 50 products',
          '1 workspace',
          'Basic AI assistant',
          '1 channel connection',
        ],
      },
      {
        name: 'STARTER',
        description: 'For small businesses getting started',
        monthlyPrice: 29,
        features: [
          'Up to 500 products',
          '3 workspaces',
          'Advanced AI assistant',
          '5 channel connections',
          'Profit calculator',
          'Basic analytics',
        ],
      },
      {
        name: 'PROFESSIONAL',
        description: 'For growing e-commerce operations',
        monthlyPrice: 99,
        features: [
          'Up to 5,000 products',
          '10 workspaces',
          'Priority AI processing',
          'Unlimited channel connections',
          'Advanced analytics & trends',
          'Team collaboration (up to 10)',
          'API access',
        ],
      },
      {
        name: 'ENTERPRISE',
        description: 'For large-scale operations',
        monthlyPrice: 299,
        features: [
          'Unlimited products',
          'Unlimited workspaces',
          'Dedicated AI processing',
          'Custom integrations',
          'Advanced security & audit',
          'Unlimited team members',
          'Priority support',
          'SLA guarantee',
        ],
      },
    ];
  }

  async getCurrentPlan(user: JwtPayload) {
    const orgId = requireOrg(user);
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        plan: true,
        trialEndsAt: true,
        createdAt: true,
      },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  async updatePlan(user: JwtPayload, dto: UpdatePlanDto) {
    const orgId = requireOrg(user);
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return this.prisma.organization.update({
      where: { id: orgId },
      data: { plan: dto.plan as Plan },
      select: { id: true, name: true, plan: true, trialEndsAt: true },
    });
  }

  async getUsage(user: JwtPayload) {
    const orgId = requireOrg(user);

    const [
      productCount,
      listingCount,
      agentRunCount,
      memberCount,
      fileCount,
      workspaceCount,
    ] = await Promise.all([
      this.prisma.product.count({
        where: {
          workspace: { organizationId: orgId },
          status: { not: 'ARCHIVED' },
        },
      }),
      this.prisma.listingDraft.count({ where: { organizationId: orgId } }),
      this.prisma.agentRun.count({ where: { organizationId: orgId } }),
      this.prisma.membership.count({
        where: { organizationId: orgId, status: 'ACTIVE' },
      }),
      this.prisma.fileAsset.count({ where: { organizationId: orgId } }),
      this.prisma.workspace.count({ where: { organizationId: orgId } }),
    ]);

    return {
      products: productCount,
      listings: listingCount,
      agentRuns: agentRunCount,
      teamMembers: memberCount,
      storageFiles: fileCount,
      workspaces: workspaceCount,
    };
  }

  async getInvoices(user: JwtPayload) {
    const orgId = requireOrg(user);
    // No Invoice model in schema yet; return empty list with placeholder
    return {
      items: [],
      total: 0,
      message:
        'Invoice management is available on the STARTER plan and above. Contact support for billing history.',
    };
  }
}
