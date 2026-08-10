import {
  normalizeRequestId,
  parseTraceparent,
  resolveTraceContext,
} from '../src/shared/observability/trace-context.js';
import {
  asyncLocalStorage,
  RequestIdMiddleware,
} from '../src/shared/middleware/request-id.middleware.js';

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const TRACEPARENT = `00-${TRACE_ID}-00f067aa0ba902b7-01`;

describe('W3C trace context', () => {
  it('continues a valid trace with a fresh local span id', () => {
    const resolved = resolveTraceContext({ traceparent: TRACEPARENT });

    expect(resolved.traceId).toBe(TRACE_ID);
    expect(resolved.traceparent).toMatch(
      new RegExp(`^00-${TRACE_ID}-[0-9a-f]{16}-01$`),
    );
    expect(resolved.traceparent).not.toBe(TRACEPARENT);
    expect(parseTraceparent(resolved.traceparent)?.traceId).toBe(TRACE_ID);
  });

  it('rejects malformed and all-zero upstream trace identifiers', () => {
    const allZero = '00-00000000000000000000000000000000-0000000000000000-01';
    expect(parseTraceparent(allZero)).toBeUndefined();
    expect(parseTraceparent('not-a-traceparent')).toBeUndefined();

    const resolved = resolveTraceContext({ traceparent: allZero });
    expect(resolved.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(resolved.traceId).not.toBe('0'.repeat(32));
  });

  it('accepts only bounded request identifiers without control characters', () => {
    expect(normalizeRequestId('client.request-1:retry')).toBe(
      'client.request-1:retry',
    );
    expect(normalizeRequestId('bad\r\nx-injected: true')).toBeUndefined();
    expect(normalizeRequestId('x'.repeat(129))).toBeUndefined();
  });

  it('stores and returns one validated request and trace context', (done) => {
    const middleware = new RequestIdMiddleware();
    const headers = {
      'x-request-id': 'ui-request-1',
      traceparent: TRACEPARENT,
    };
    const responseHeaders = new Map<string, string>();

    middleware.use(
      { headers } as any,
      {
        setHeader: (name: string, value: string) =>
          responseHeaders.set(name.toLowerCase(), value),
      } as any,
      () => {
        const store = asyncLocalStorage.getStore();
        expect(store?.get('requestId')).toBe('ui-request-1');
        expect(store?.get('traceId')).toBe(TRACE_ID);
        expect(store?.get('traceparent')).toMatch(
          new RegExp(`^00-${TRACE_ID}-[0-9a-f]{16}-01$`),
        );
        expect(responseHeaders.get('x-trace-id')).toBe(TRACE_ID);
        expect(responseHeaders.get('traceparent')).toBe(
          store?.get('traceparent'),
        );
        done();
      },
    );
  });
});
