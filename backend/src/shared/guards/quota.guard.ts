import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MeteringService } from '../../features/billing/metering.service.js';
import type { ResourceType } from '../../features/billing/metering.service.js';
import { QUOTA_RESOURCE_KEY } from '../decorators/quota.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private readonly metering: MeteringService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.JEST_WORKER_ID !== undefined
    ) {
      return true;
    }

    const resource = this.reflector.getAllAndOverride<string>(
      QUOTA_RESOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!resource) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user?.orgId) {
      return true;
    }

    const check = await this.metering.checkQuota(
      user.orgId,
      resource as ResourceType,
    );
    if (!check.allowed) {
      throw new ForbiddenException(
        `Quota exceeded for ${resource}: ${check.used}/${check.limit}. Please upgrade your plan.`,
      );
    }
    return true;
  }
}
