import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { ObservabilityContextInterceptor } from '../src/shared/observability/observability-context.interceptor.js';
import { asyncLocalStorage } from '../src/shared/middleware/request-id.middleware.js';

describe('ObservabilityContextInterceptor', () => {
  it('attaches stable business identifiers to the active request context', (done) => {
    const interceptor = new ObservabilityContextInterceptor();
    const request = {
      requestId: 'request-1',
      originalUrl: '/api/v1/agent-runs/run-1/timeline',
      params: { id: 'run-1' },
      query: {},
      body: { approvalId: 'approval-1' },
      user: { sub: 'user-1', orgId: 'org-1', email: 'owner@example.com' },
    };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const next = { handle: () => of('ok') } as CallHandler;

    asyncLocalStorage.run(new Map(), () => {
      interceptor.intercept(context, next).subscribe({
        next: () => {
          const store = asyncLocalStorage.getStore();
          expect(store?.get('requestId')).toBe('request-1');
          expect(store?.get('tenantId')).toBe('org-1');
          expect(store?.get('userId')).toBe('user-1');
          expect(store?.get('runId')).toBe('run-1');
          expect(store?.get('approvalId')).toBe('approval-1');
        },
        complete: done,
      });
    });
  });

  it('does not invent an id for an unrelated route', () => {
    const interceptor = new ObservabilityContextInterceptor();
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          requestId: 'request-2',
          originalUrl: '/api/v1/products/product-1',
          params: { id: 'product-1' },
          query: {},
          body: {},
        }),
      }),
    } as unknown as ExecutionContext;

    asyncLocalStorage.run(new Map(), () => {
      interceptor.intercept(context, { handle: () => of('ok') }).subscribe();
      expect(asyncLocalStorage.getStore()?.get('runId')).toBeUndefined();
    });
  });
});
