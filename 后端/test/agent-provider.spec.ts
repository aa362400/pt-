/**
 * 契约测试 — 验证 HttpAgentProvider 的任务类型覆盖与调用上下文构建。
 *
 * 通过扫描 provider 源码提取实际调用的 taskType，与契约声明比对；
 * 并验证 AgentCallContext 是否正确透传给远程调用。
 *
 * No database required.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { HttpAgentProvider } from '../src/agents/http-agent.provider.js';

const ROOT = join(__dirname, '..');
const CONTRACT_PATH = join(ROOT, 'contracts', 'agent-tasks.contract.json');
const PROVIDER_PATH = join(ROOT, 'src', 'agents', 'http-agent.provider.ts');
const KEYWORD_CONTRACT_PATH = join(
  ROOT,
  'src',
  'agents',
  'contracts',
  'keyword-analysis.contract.ts',
);
const INTERFACE_PATH = join(
  ROOT,
  'src',
  'agents',
  'agent-provider.interface.ts',
);

interface Contract {
  tasks: Record<string, unknown>;
}

function loadContract(): Contract {
  return JSON.parse(readFileSync(CONTRACT_PATH, 'utf-8')) as Contract;
}

function readSource(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('HttpAgentProvider Contract Compliance', () => {
  let contract: Contract;
  let providerSource: string;
  let interfaceSource: string;
  let keywordContractSource: string;

  beforeAll(() => {
    contract = loadContract();
    providerSource = readSource(PROVIDER_PATH);
    interfaceSource = readSource(INTERFACE_PATH);
    keywordContractSource = readSource(KEYWORD_CONTRACT_PATH);
  });

  // ── Provider task type coverage ──

  it('provider dispatches at least 8 distinct task types', () => {
    const called = new Set<string>();
    for (const match of providerSource.matchAll(
      /runRemoteTask\(\s*'([a-z_]+)'/g,
    )) {
      called.add(match[1]);
    }
    expect(called.size).toBeGreaterThanOrEqual(8);
  });

  it('every task type dispatched by provider is declared in the contract', () => {
    const called = new Set<string>();
    for (const match of providerSource.matchAll(
      /runRemoteTask\(\s*'([a-z_]+)'/g,
    )) {
      called.add(match[1]);
    }
    const declared = new Set(Object.keys(contract.tasks));
    for (const task of called) {
      expect(declared).toContain(task);
    }
  });

  it('every contract task type (except analyze_product) is dispatched by provider', () => {
    // analyze_product is used internally by generate_images; not directly dispatched
    const exempt = new Set(['analyze_product']);
    for (const task of Object.keys(contract.tasks)) {
      if (exempt.has(task)) continue;
      expect(providerSource).toContain(`'${task}'`);
    }
  });

  // ── Provider method coverage ──

  it('provider implements all methods from AgentProviderInterface', () => {
    const methodSignatures = [
      'runAssistant',
      'runListingGeneration',
      'runKeywordAnalysis',
      'runProductResearch',
      'runTrendAnalysis',
      'runImagePrompt',
      'runImageGeneration',
      'runSupplierImageSearch',
      'runAutomationStep',
      'runPlanAndExecute',
    ];
    for (const method of methodSignatures) {
      expect(providerSource).toContain(`async ${method}(`);
    }
  });

  it('interface declares all required methods', () => {
    const methodSignatures = [
      'runAssistant',
      'runListingGeneration',
      'runKeywordAnalysis',
      'runProductResearch',
      'runTrendAnalysis',
      'runImagePrompt',
      'runImageGeneration',
      'runSupplierImageSearch',
      'runAutomationStep',
      'runPlanAndExecute',
    ];
    for (const method of methodSignatures) {
      expect(interfaceSource).toContain(method);
    }
  });

  // ── AgentCallContext ──

  it('AgentCallContext interface matches contract context fields', () => {
    // Contract context fields (from transport.context)
    const expectedContextFields = [
      'orgId',
      'userId',
      'workspaceId',
      'requestId',
      'agentRunId',
      'locale',
      'traceId',
      'traceparent',
    ];
    for (const field of expectedContextFields) {
      expect(interfaceSource).toContain(field);
    }
  });

  it('provider passes context to runRemoteTask', () => {
    // Each method should pass `context` (or `context ?? {}`) as third arg
    const calls = providerSource.match(/runRemoteTask\(/g);
    expect(calls).toBeTruthy();
    expect(calls!.length).toBeGreaterThanOrEqual(8);

    // Verify context variable is referenced in the call
    expect(providerSource).toContain('context');
  });

  it('sends the same request and trace context to the remote Agent API', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
    } as Response);
    const provider = new HttpAgentProvider({
      get: jest.fn((key: string) => {
        if (key === 'AGENT_BASE_URL') return 'http://agent:8080';
        if (key === 'AGENT_API_KEY') return 'test-key';
        return undefined;
      }),
    } as any);

    await (provider as any).request(
      '/api/v1/agent/runs',
      { method: 'POST', body: { taskType: 'assistant_chat' } },
      {
        requestId: 'run-1:attempt:1',
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://agent:8080/api/v1/agent/runs',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Request-Id': 'run-1:attempt:1',
          'X-Trace-Id': '4bf92f3577b34da6a3ce929d0e0e4736',
          traceparent:
            '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        }),
      }),
    );
    fetchMock.mockRestore();
  });

  it('bounds every Agent HTTP request with an abort deadline', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error('MISSING_ABORT_SIGNAL'));
            return;
          }
          signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const provider = new HttpAgentProvider({
      get: jest.fn((key: string) => {
        if (key === 'AGENT_BASE_URL') return 'http://agent:8080';
        if (key === 'AGENT_API_KEY') return 'test-key';
        return undefined;
      }),
    } as any);

    try {
      const request = (provider as any).request('/api/v1/agent/health');
      const assertion = expect(request).rejects.toThrow(
        'AGENT_API_REQUEST_TIMEOUT',
      );
      await jest.advanceTimersByTimeAsync(30_000);
      await assertion;
    } finally {
      fetchMock.mockRestore();
      jest.useRealTimers();
    }
  });

  it('shortens an Agent HTTP request to the remaining task deadline', async () => {
    jest.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          capturedSignal = init?.signal ?? undefined;
          capturedSignal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const provider = new HttpAgentProvider({
      get: jest.fn((key: string) => {
        if (key === 'AGENT_BASE_URL') return 'http://agent:8080';
        if (key === 'AGENT_API_KEY') return 'test-key';
        return undefined;
      }),
    } as any);
    const deadlineAt = Date.now() + 1_000;
    const request = (provider as any)
      .request('/api/v1/agent/health', {}, undefined, { deadlineAt })
      .catch((error: unknown) => error);

    try {
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(1_000);
      expect(capturedSignal?.aborted).toBe(true);
      await expect(request).resolves.toMatchObject({
        message: 'AGENT_API_REQUEST_TIMEOUT',
      });
    } finally {
      if (!capturedSignal?.aborted) {
        await jest.advanceTimersByTimeAsync(30_000);
        await request;
      }
      fetchMock.mockRestore();
      jest.useRealTimers();
    }
  });

  it('rejects an oversized Agent response before buffering its body', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Length': String(8 * 1024 * 1024 + 1) },
      }),
    );
    const provider = new HttpAgentProvider({
      get: jest.fn((key: string) => {
        if (key === 'AGENT_BASE_URL') return 'http://agent:8080';
        if (key === 'AGENT_API_KEY') return 'test-key';
        return undefined;
      }),
    } as any);

    try {
      await expect(
        (provider as any).request('/api/v1/agent/health'),
      ).rejects.toThrow('AGENT_API_RESPONSE_TOO_LARGE');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('does not echo an untrusted Agent error body', async () => {
    const secretBody = 'upstream-token-secret-123';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ error: secretBody }), { status: 502 }),
      );
    const provider = new HttpAgentProvider({
      get: jest.fn((key: string) => {
        if (key === 'AGENT_BASE_URL') return 'http://agent:8080';
        if (key === 'AGENT_API_KEY') return 'test-key';
        return undefined;
      }),
    } as any);

    try {
      const request = (provider as any).request('/api/v1/agent/health');
      await expect(request).rejects.toThrow('Agent API 502');
      await expect(request).rejects.not.toThrow(secretBody);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('rejects a malformed create-run envelope before using its run id', async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            runId: '../health',
            sessionId: 'session-1',
            status: 'queued',
            traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            runId: '../health',
            taskType: 'assistant_chat',
            status: 'failed',
            progress: {},
            result: null,
            error: 'fallback failure',
            diagnostics: null,
            context: {},
          }),
        ),
      );
    const provider = new HttpAgentProvider({
      get: jest.fn((key: string) => {
        if (key === 'AGENT_BASE_URL') return 'http://agent:8080';
        if (key === 'AGENT_API_KEY') return 'test-key';
        return undefined;
      }),
    } as any);

    try {
      const run = (provider as any).runRemoteTask('assistant_chat', {}, {});
      const assertion = expect(run).rejects.toThrow(
        'AGENT_API_RESPONSE_INVALID',
      );
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(3_000);
      await assertion;
    } finally {
      fetchMock.mockRestore();
      jest.useRealTimers();
    }
  });

  it('rejects an unknown run status instead of polling until timeout', async () => {
    jest.useFakeTimers();
    const created = {
      runId: 'safe-run-1',
      sessionId: 'safe-session-1',
      status: 'queued',
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    };
    const status = (value: string) => ({
      runId: created.runId,
      taskType: 'assistant_chat',
      status: value,
      progress: {},
      result: null,
      error: value === 'failed' ? 'fallback failure' : '',
      diagnostics: null,
      context: {},
    });
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(created)))
      .mockResolvedValueOnce(new Response(JSON.stringify(status('mystery'))))
      .mockResolvedValueOnce(new Response(JSON.stringify(status('failed'))));
    const provider = new HttpAgentProvider({
      get: jest.fn((key: string) => {
        if (key === 'AGENT_BASE_URL') return 'http://agent:8080';
        if (key === 'AGENT_API_KEY') return 'test-key';
        return undefined;
      }),
    } as any);

    try {
      const run = (provider as any).runRemoteTask('assistant_chat', {}, {});
      const assertion = expect(run).rejects.toThrow(
        'AGENT_API_RESPONSE_INVALID',
      );
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(6_000);
      await assertion;
    } finally {
      fetchMock.mockRestore();
      jest.useRealTimers();
    }
  });

  // ── Input/output mapping ──

  it('uses a dedicated three-minute poll budget for supplier image search', async () => {
    const provider = new HttpAgentProvider({
      get: jest.fn((key: string) => {
        if (key === 'AGENT_BASE_URL') return 'http://agent:8080';
        if (key === 'AGENT_API_KEY') return 'test-key';
        return undefined;
      }),
    } as any);
    const context = {
      orgId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      requestId: 'supplier-request-1',
    };
    const remoteResult = {
      outcome: 'NO_RESULTS',
      providerResultCount: 0,
      offers: [],
      imageEvidence: {
        canonicalizationVersion: 'supplier-image-search-payload/v2',
        sourceOriginalSha256: 'a'.repeat(64),
        sourceCanonicalSha256: 'b'.repeat(64),
        decodedSizeBytes: 100,
        payloadMimeType: 'image/png',
        width: 10,
        height: 10,
        retrievalHashAlgorithm: 'DHASH64',
        retrievalHash: '0123456789abcdef',
        retrievalOnly: true,
      },
      provenance: {
        adapterVersion: 'supplier-image-search-adapter/v1',
        provider: 'documented-1688-image-search',
        requestId: context.requestId,
        fetchedAt: '2026-07-16T03:30:00.000Z',
        rawSnapshotSha256: 'c'.repeat(64),
      },
    };
    const runRemoteTask = jest
      .spyOn(provider as any, 'runRemoteTask')
      .mockResolvedValue(remoteResult);

    await provider.runSupplierImageSearch(
      { imageUrl: 'https://images.example.test/product.png' },
      context,
    );

    expect(runRemoteTask).toHaveBeenCalledWith(
      'supplier_image_search',
      { imageUrl: 'https://images.example.test/product.png' },
      context,
      { pollTimeoutMs: 3 * 60_000 },
    );
  });

  it('provider result mapping references required output fields', () => {
    const checks: Record<string, string[]> = {
      product_research: ['summary', 'competitors', 'priceRange', 'rating'],
      listing_generation: ['title', 'description', 'bulletPoints', 'keywords'],
      keyword_analysis: ['keyword', 'volume', 'difficulty'],
      trend_analysis: ['name', 'growth', 'seasonality'],
      image_prompt: ['prompt', 'negativePrompt'],
      supplier_image_search: [
        'outcome',
        'providerResultCount',
        'offers',
        'imageEvidence',
        'provenance',
      ],
      assistant_chat: ['response'],
    };
    for (const [task, fields] of Object.entries(checks)) {
      const mappingSource =
        task === 'keyword_analysis'
          ? `${providerSource}\n${keywordContractSource}`
          : providerSource;
      for (const field of fields) {
        expect(mappingSource).toContain(field);
      }
    }
  });

  it('image generation exposes explicit supervision and publishability state', () => {
    for (const field of ['supervisionApproved', 'publishable']) {
      expect(interfaceSource).toContain(field);
      expect(providerSource).toContain(field);
    }
  });

  // ── Contract-version consistency ──

  it('provider source references all contract task types consistently', () => {
    const tasksInSource = new Set<string>();
    for (const match of providerSource.matchAll(
      /runRemoteTask\(\s*'([a-z_]+)'/g,
    )) {
      tasksInSource.add(match[1]);
    }
    // Should match the non-exempt set
    const exempt = new Set(['analyze_product']);
    const expected = new Set(
      Object.keys(contract.tasks).filter((t) => !exempt.has(t)),
    );
    expect(tasksInSource).toEqual(expected);
  });
});
