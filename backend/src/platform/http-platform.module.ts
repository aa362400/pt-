import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../shared/auth/auth.module.js';
import { JwtAuthGuard } from '../shared/auth/jwt-auth.guard.js';
import { MetricsInterceptor } from '../shared/metrics/metrics.interceptor.js';
import { LocaleMiddleware } from '../shared/middleware/locale.middleware.js';
import { RequestIdMiddleware } from '../shared/middleware/request-id.middleware.js';
import { SecurityHeadersMiddleware } from '../shared/middleware/security-headers.middleware.js';
import { ObservabilityContextInterceptor } from '../shared/observability/observability-context.interceptor.js';
import { RolesGuard } from '../shared/rbac/roles.guard.js';

@Module({
  imports: [
    AuthModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
        skipIf: () =>
          process.env.NODE_ENV === 'test' ||
          process.env.JEST_WORKER_ID !== undefined,
      },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ObservabilityContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
})
export class HttpPlatformModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, LocaleMiddleware, SecurityHeadersMiddleware)
      .forRoutes('*path');
  }
}
