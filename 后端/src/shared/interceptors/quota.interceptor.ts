import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { MeteringService } from '../../features/billing/metering.service.js';
import type { ResourceType } from '../../features/billing/metering.service.js';
import { QUOTA_RESOURCE_KEY } from '../decorators/quota.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';

/**
 * Alternative to QuotaGuard — can be registered as a global interceptor
 * or used per-controller. Checks quota before the route handler runs.
 */
@Injectable()
export class QuotaInterceptor implements NestInterceptor {
  constructor(
    private readonly metering: MeteringService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const resource = this.reflector.getAllAndOverride<string>(
      QUOTA_RESOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!resource) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (user?.orgId) {
      const check = await this.metering.checkQuota(
        user.orgId,
        resource as ResourceType,
      );
      if (!check.allowed) {
        throw new ForbiddenException(
          `Quota exceeded for ${resource}: ${check.used}/${check.limit}. Please upgrade your plan.`,
        );
      }
    }

    return next.handle();
  }
}
