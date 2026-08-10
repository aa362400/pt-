import { resolve } from 'node:path';
import { unlinkSync } from 'node:fs';
import { CommerceMcpClientService } from '../src/shared/commerce-mcp/commerce-mcp-client.service.js';

describe('CommerceMcpClientService real stdio transport', () => {
  const scriptPath = resolve(
    process.cwd(),
    '..',
    '电商设计图保持产品一致性智能体',
    'agent',
    'mcp_server.py',
  );
  const config = {
    get: jest.fn((name: string) => {
      if (name === 'COMMERCE_AGENT_MCP_SERVER') return scriptPath;
      if (name === 'COMMERCE_AGENT_PYTHON') return 'python';
      if (name === 'COMMERCE_AGENT_MCP_TIMEOUT_MS') return 15_000;
      return undefined;
    }),
  };
  const service = new CommerceMcpClientService(config as any);

  it('discovers the live manifest and produces a stable SHA-256 integrity hash', async () => {
    const manifest = await service.getManifest();
    expect(manifest.server).toEqual(
      expect.objectContaining({
        name: 'commerce-agent-tools',
        version: '1.0.0',
      }),
    );
    expect(manifest.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'calc_profit',
        'temu_pricing_engine',
        'ozon_pricing_engine',
        'generate_image_prompts',
        'export_listing_csv',
        'amazon_title_optimizer',
        'listing_quality_score',
      ]),
    );
    expect(manifest.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.executableHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('executes the TEMU reverse quote engine over JSON-RPC stdio', async () => {
    const result = (await service.callTool('temu_pricing_engine', {
      blank_cost: 10,
      logistics_fee: 7,
      target_margin_rate: 0.35,
      expected_approval_rate: 0.5,
    })) as any;
    expect(result.result).toEqual(
      expect.objectContaining({
        breakEvenApprovedPrice: 19.54,
        recommendedDeclaredPrice: 65.38,
      }),
    );
  });

  it('executes the Ozon pricing catalog over JSON-RPC stdio', async () => {
    const result = (await service.callTool('ozon_pricing_engine', {
      mode: 'categories',
    })) as any;

    expect(result.categories).toHaveLength(80);
    expect(result.source).toEqual(
      expect.objectContaining({
        rulesHash:
          'fd8e182649e7c5a26a1d449ee2f4b731d87aaeb9b328f2750d52b592849b0d25',
        workbookSha256:
          'a27ba46d5ff5332b23bbde3cda359da90007c4aaf4b73b351acbe4d164b39ff7',
      }),
    );
  });

  it.each([
    ['calc_profit', { price: 29.99, cost: 8, platform: 'etsy' }, 'profit'],
    [
      'generate_image_prompts',
      { product_name: 'Wooden pen', image_count: 3 },
      'images',
    ],
    ['check_risk', { title: 'Personalized wooden pen gift' }, 'riskLevel'],
    [
      'amazon_title_optimizer',
      { product_name: 'Personalized Wooden Pen', max_chars: 75 },
      'optimizedTitle',
    ],
    [
      'listing_quality_score',
      { title: 'Wooden Pen', margin_pct: 35, evidence_count: 2 },
      'decision',
    ],
  ] as const)(
    'executes %s over the NestJS-to-Python transport',
    async (tool, input, outputKey) => {
      const result = (await service.callTool(tool, input)) as Record<
        string,
        unknown
      >;
      expect(result).toHaveProperty(outputKey);
    },
  );

  it('exports rows with the real Python CSV tool and returns a traceable export id', async () => {
    const result = (await service.callTool('export_listing_csv', {
      platform: 'etsy',
      rows: [{ sku: 'PEN-001', title: 'Wooden pen, custom' }],
    })) as any;
    expect(result).toEqual(
      expect.objectContaining({
        tool: 'export_listing_csv',
        rowCount: 1,
        encoding: 'utf-8-sig',
      }),
    );
    expect(result.exportId).toMatch(/^[a-f0-9]{32}$/);
    unlinkSync(result.filePath);
  });
});
