import { MODULE_METADATA } from '@nestjs/common/constants';
import type { MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AgentModule } from '../src/agents/agent.module.js';
import { AppModule } from '../src/app.module.js';
import { CoreModule } from '../src/core/core.module.js';
import { FeaturesModule } from '../src/features/features.module.js';
import { HealthModule } from '../src/health.module.js';
import { AgentRuntimeModule } from '../src/platform/agent-runtime.module.js';
import { HttpPlatformModule } from '../src/platform/http-platform.module.js';
import { PlatformModule } from '../src/platform/platform.module.js';
import { JwtAuthGuard } from '../src/shared/auth/jwt-auth.guard.js';
import { MetricsInterceptor } from '../src/shared/metrics/metrics.interceptor.js';
import { LocaleMiddleware } from '../src/shared/middleware/locale.middleware.js';
import { RequestIdMiddleware } from '../src/shared/middleware/request-id.middleware.js';
import { SecurityHeadersMiddleware } from '../src/shared/middleware/security-headers.middleware.js';
import { ObservabilityContextInterceptor } from '../src/shared/observability/observability-context.interceptor.js';
import { QueueModule } from '../src/shared/queue/queue.module.js';
import { RolesGuard } from '../src/shared/rbac/roles.guard.js';
import { WorkersModule } from '../src/workers/workers.module.js';

function moduleMetadata<T>(key: string, target: unknown): T[] {
  return (Reflect.getMetadata(key, target) as T[] | undefined) ?? [];
}

describe('application root composition', () => {
  it('keeps AppModule limited to the four stable composition boundaries', () => {
    expect(moduleMetadata(MODULE_METADATA.IMPORTS, AppModule)).toEqual([
      CoreModule,
      PlatformModule,
      FeaturesModule,
      HealthModule,
    ]);
    expect(moduleMetadata(MODULE_METADATA.CONTROLLERS, AppModule)).toEqual([]);
    expect(moduleMetadata(MODULE_METADATA.PROVIDERS, AppModule)).toEqual([]);
  });

  it('keeps HTTP and Agent runtime concerns behind PlatformModule', () => {
    expect(moduleMetadata(MODULE_METADATA.IMPORTS, PlatformModule)).toEqual([
      HttpPlatformModule,
      AgentRuntimeModule,
    ]);

    const runtimeImports = moduleMetadata<unknown>(
      MODULE_METADATA.IMPORTS,
      AgentRuntimeModule,
    );
    expect(runtimeImports).toEqual(
      expect.arrayContaining([QueueModule, AgentModule, WorkersModule]),
    );

    const rootImports = moduleMetadata<unknown>(
      MODULE_METADATA.IMPORTS,
      AppModule,
    );
    expect(rootImports).not.toEqual(
      expect.arrayContaining([QueueModule, AgentModule, WorkersModule]),
    );
  });

  it('preserves global guard and interceptor order', () => {
    const providers = moduleMetadata<{
      provide?: unknown;
      useClass?: unknown;
    }>(MODULE_METADATA.PROVIDERS, HttpPlatformModule);

    expect(
      providers
        .filter((provider) => provider.provide === APP_GUARD)
        .map((provider) => provider.useClass),
    ).toEqual([JwtAuthGuard, ThrottlerGuard, RolesGuard]);
    expect(
      providers
        .filter((provider) => provider.provide === APP_INTERCEPTOR)
        .map((provider) => provider.useClass),
    ).toEqual([ObservabilityContextInterceptor, MetricsInterceptor]);
  });

  it('preserves request context middleware order for every route', () => {
    const forRoutes = jest.fn();
    const apply = jest.fn().mockReturnValue({ forRoutes });
    const consumer = { apply } as unknown as MiddlewareConsumer;

    new HttpPlatformModule().configure(consumer);

    expect(apply).toHaveBeenCalledWith(
      RequestIdMiddleware,
      LocaleMiddleware,
      SecurityHeadersMiddleware,
    );
    expect(forRoutes).toHaveBeenCalledWith('*path');
  });
});
