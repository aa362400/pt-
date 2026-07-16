import { HttpStatus } from '@nestjs/common';
import { HealthController } from '../src/health.controller.js';

describe('HealthController readiness', () => {
  function createHarness(options?: {
    waiting?: number;
    redisError?: boolean;
    queueError?: boolean;
    agentBaseUrl?: string;
  }) {
    const redisClient = {
      ping: jest.fn().mockImplementation(() => {
        if (options?.redisError) throw new Error('redis unavailable');
        return Promise.resolve('PONG');
      }),
    };
    const queue = {
      client: Promise.resolve(redisClient),
      getJobCounts: jest.fn().mockImplementation(() => {
        if (options?.queueError) throw new Error('queue unavailable');
        return Promise.resolve({
          waiting: options?.waiting ?? 0,
          active: 1,
          failed: 0,
          delayed: 0,
        });
      }),
    };
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'STORAGE_PROVIDER') return 'local';
        if (key === 'AGENT_BASE_URL') return options?.agentBaseUrl ?? '';
        if (key === 'QUEUE_READINESS_BACKLOG_LIMIT') return 500;
        return fallback;
      }),
    };
    const response = { status: jest.fn() };
    const controller = new HealthController(
      prisma as never,
      config as never,
      queue as never,
    );
    return { controller, response, queue };
  }

  it('reports healthy queue evidence while dependencies are available', async () => {
    const { controller, response } = createHarness({ waiting: 12 });

    const result = await controller.getReady(response as never);

    expect(result.status).toBe('ready');
    expect(result.checks.queue).toMatchObject({
      status: 'up',
      details: { waiting: 12, limit: 500 },
    });
    expect(response.status).not.toHaveBeenCalled();
  });

  it('keeps API pods ready but reports degradation for a shared backlog', async () => {
    const { controller, response } = createHarness({ waiting: 501 });

    const result = await controller.getReady(response as never);

    expect(result.status).toBe('ready');
    expect(result.checks.queue).toMatchObject({
      status: 'degraded',
      details: { waiting: 501, limit: 500 },
    });
    expect(response.status).not.toHaveBeenCalled();
  });

  it('returns 503 when Redis is unreachable', async () => {
    const { controller, response } = createHarness({ redisError: true });

    const result = await controller.getReady(response as never);

    expect(result.status).toBe('not_ready');
    expect(result.checks.redis.status).toBe('down');
    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });

  it('returns 503 when queue state cannot be read', async () => {
    const { controller, response } = createHarness({ queueError: true });

    const result = await controller.getReady(response as never);

    expect(result.status).toBe('not_ready');
    expect(result.checks.queue.status).toBe('down');
    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });

  it('uses the Agent readiness endpoint instead of process health', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true } as Response);
    const { controller, response } = createHarness({
      agentBaseUrl: 'http://agent:8080/',
    });

    try {
      const result = await controller.getReady(response as never);
      expect(result.checks.agent.status).toBe('up');
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://agent:8080/api/ready',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
