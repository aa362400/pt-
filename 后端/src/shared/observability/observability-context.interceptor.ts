import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { asyncLocalStorage } from '../middleware/request-id.middleware.js';

interface CorrelatedRequest extends Request {
  requestId?: string;
  user?: JwtPayload;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function correlatedId(
  request: CorrelatedRequest,
  names: string[],
): string | undefined {
  const params = asRecord(request.params);
  const body = asRecord(request.body);
  const query = asRecord(request.query);
  for (const name of names) {
    const value =
      asNonEmptyString(params[name]) ??
      asNonEmptyString(body[name]) ??
      asNonEmptyString(query[name]);
    if (value) return value;
  }
  return undefined;
}

@Injectable()
export class ObservabilityContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<CorrelatedRequest>();
    const store = asyncLocalStorage.getStore();
    const span = trace.getActiveSpan();
    const requestId = request.requestId;
    const tenantId = request.user?.orgId;
    const userId = request.user?.sub;
    const path = request.originalUrl || request.url || '';
    const runId =
      correlatedId(request, ['runId', 'agentRunId']) ??
      (path.includes('/agent-runs/')
        ? correlatedId(request, ['id'])
        : undefined);
    const approvalId =
      correlatedId(request, ['approvalId', 'proposalId']) ??
      (path.includes('/approval') ? correlatedId(request, ['id']) : undefined);
    const publishAttemptId = correlatedId(request, [
      'publishAttemptId',
      'externalSubmissionId',
    ]);

    if (requestId) store?.set('requestId', requestId);
    if (tenantId) store?.set('tenantId', tenantId);
    if (userId) store?.set('userId', userId);
    if (runId) store?.set('runId', runId);
    if (approvalId) store?.set('approvalId', approvalId);
    if (publishAttemptId) store?.set('publishAttemptId', publishAttemptId);

    span?.setAttributes({
      ...(requestId ? { 'request.id': requestId } : {}),
      ...(tenantId ? { 'tenant.id': tenantId } : {}),
      ...(userId ? { 'enduser.id': userId } : {}),
      ...(runId ? { 'agent.run.id': runId } : {}),
      ...(approvalId ? { 'approval.id': approvalId } : {}),
      ...(publishAttemptId ? { 'publish.attempt.id': publishAttemptId } : {}),
    });

    return next.handle();
  }
}
