import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { PrismaModule } from './shared/database/prisma.module.js';
import { LoggerModule } from './shared/logging/logger.module.js';
import { QueueModule } from './shared/queue/queue.module.js';
import { StorageModule } from './shared/storage/storage.module.js';
import { AuditModule } from './shared/audit/audit.module.js';
import { EmailModule } from './shared/email/email.module.js';
import { MetricsModule } from './shared/metrics/metrics.module.js';
import { FeatureFlagsModule } from './shared/feature-flags/feature-flags.module.js';
import { AuthModule } from './shared/auth/auth.module.js';
import { HousekeepingModule } from './shared/housekeeping/housekeeping.module.js';
import { AgentModule } from './agents/agent.module.js';
import { FeaturesModule } from './features/features.module.js';
import { WorkersModule } from './workers/workers.module.js';

import { JwtAuthGuard } from './shared/auth/jwt-auth.guard.js';
import { RolesGuard } from './shared/rbac/roles.guard.js';
import { MetricsInterceptor } from './shared/metrics/metrics.interceptor.js';
import { RequestIdMiddleware } from './shared/middleware/request-id.middleware.js';
import { SecurityHeadersMiddleware } from './shared/middleware/security-headers.middleware.js';
import { envSchema } from './shared/config/env.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    // Global config with Zod validation
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => {
        const result = envSchema.safeParse(config);
        if (!result.success) {
          const messages = result.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ');
          throw new Error(`Environment validation failed: ${messages}`);
        }
        return result.data as Record<string, unknown>;
      },
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),

    // NOTE: uploads are intentionally NOT served as public static files.
    // Downloads must go through an authenticated endpoint (see FilesModule).

    // Core shared modules
    PrismaModule,
    LoggerModule,
    QueueModule,
    StorageModule,
    AuditModule,
    EmailModule,
    MetricsModule,
    FeatureFlagsModule,
    AuthModule,
    HousekeepingModule,

    // Agents
    AgentModule,

    // Background queue consumers
    WorkersModule,

    // All feature modules
    FeaturesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global guards (order matters: authenticate, then rate-limit, then authorize)
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
      useClass: MetricsInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, SecurityHeadersMiddleware)
      .forRoutes('*path');
  }
}
