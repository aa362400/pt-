import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestWithId extends Request {
  requestId?: string;
}

export const asyncLocalStorage = new AsyncLocalStorage<Map<string, string>>();

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const r = req as RequestWithId;
    const headerId = req.headers['x-request-id'];
    const requestId =
      (typeof headerId === 'string' ? headerId : undefined) ?? uuidv4();
    r.requestId = requestId;

    const store = new Map<string, string>();
    store.set('requestId', requestId);
    asyncLocalStorage.run(store, () => {
      next();
    });
  }
}

export function getCurrentRequestId(): string | undefined {
  return asyncLocalStorage.getStore()?.get('requestId');
}
