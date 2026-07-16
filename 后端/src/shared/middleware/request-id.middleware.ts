import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'node:async_hooks';
import { trace } from '@opentelemetry/api';
import {
  formatTraceparent,
  normalizeRequestId,
  resolveTraceContext,
} from '../observability/trace-context.js';

interface RequestWithId extends Request {
  requestId?: string;
  traceId?: string;
  traceparent?: string;
}

export const asyncLocalStorage = new AsyncLocalStorage<Map<string, string>>();

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const r = req as RequestWithId;
    const requestId =
      normalizeRequestId(req.headers['x-request-id']) ?? uuidv4();
    const activeSpanContext = trace.getActiveSpan()?.spanContext();
    const activeTraceparent = activeSpanContext
      ? formatTraceparent(
          activeSpanContext.traceId,
          activeSpanContext.spanId,
          activeSpanContext.traceFlags.toString(16).padStart(2, '0'),
        )
      : undefined;
    const traceContext = activeTraceparent
      ? {
          traceId: activeSpanContext!.traceId.toLowerCase(),
          traceparent: activeTraceparent,
        }
      : resolveTraceContext({
          traceparent: req.headers.traceparent,
          traceId: req.headers['x-trace-id'],
        });
    r.requestId = requestId;
    r.traceId = traceContext.traceId;
    r.traceparent = traceContext.traceparent;
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-trace-id', traceContext.traceId);
    res.setHeader('traceparent', traceContext.traceparent);

    const store = new Map<string, string>();
    store.set('requestId', requestId);
    store.set('traceId', traceContext.traceId);
    store.set('traceparent', traceContext.traceparent);
    asyncLocalStorage.run(store, () => {
      next();
    });
  }
}

export function getCurrentRequestId(): string | undefined {
  return asyncLocalStorage.getStore()?.get('requestId');
}

export function getCurrentTraceId(): string | undefined {
  return asyncLocalStorage.getStore()?.get('traceId');
}

export function getCurrentTraceparent(): string | undefined {
  return asyncLocalStorage.getStore()?.get('traceparent');
}
