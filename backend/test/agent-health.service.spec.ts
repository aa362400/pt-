import { AgentHealthService } from '../src/agents/agent-health.service.js';

describe('AgentHealthService', () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'AGENT_BASE_URL') return 'http://127.0.0.1:8080';
      if (key === 'AGENT_API_KEY') return 'agent-test-key';
      return undefined;
    }),
  };

  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('returns the agent-reported degraded state without exposing credentials', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        integration: 'enabled',
        mockMode: false,
        llm: {
          status: 'degraded',
          model: 'gpt-5.6-sol',
          keyRole: 'standard',
          fallbackActive: true,
          configuredKeyRoles: ['premium', 'standard'],
        },
      }),
    });
    const service = new AgentHealthService(config as never);

    const snapshot = await service.getSnapshot();

    expect(snapshot).toEqual(
      expect.objectContaining({
        connection: 'connected',
        integration: 'enabled',
        mockMode: false,
        llm: expect.objectContaining({
          status: 'degraded',
          model: 'gpt-5.6-sol',
          fallbackActive: true,
        }),
      }),
    );
    expect(JSON.stringify(snapshot)).not.toContain('agent-test-key');
  });

  it('reports an unavailable connection instead of inventing model availability', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connection refused'));
    const service = new AgentHealthService(config as never);

    await expect(service.getSnapshot()).resolves.toEqual(
      expect.objectContaining({
        connection: 'unavailable',
        llm: expect.objectContaining({ status: 'unavailable' }),
      }),
    );
  });
});
