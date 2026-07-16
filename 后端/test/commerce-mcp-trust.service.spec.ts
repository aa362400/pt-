import { ServiceUnavailableException } from '@nestjs/common';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommerceMcpTrustService } from '../src/shared/commerce-mcp/commerce-mcp-trust.service.js';
import {
  COMMERCE_MCP_TRUST_BASELINE,
  loadCommerceMcpTrustBaseline,
} from '../src/shared/commerce-mcp/commerce-mcp-trust.registry.js';
import {
  canonicalJson,
  verifyTrustBaselineSignature,
} from '../src/shared/commerce-mcp/commerce-mcp-trust-signature.js';

function liveManifest(overrides: Record<string, unknown> = {}) {
  return {
    server: {
      name: COMMERCE_MCP_TRUST_BASELINE.server.name,
      version: COMMERCE_MCP_TRUST_BASELINE.server.version,
      protocolVersion: COMMERCE_MCP_TRUST_BASELINE.server.protocolVersion,
    },
    transport: 'stdio' as const,
    tools: COMMERCE_MCP_TRUST_BASELINE.allowedTools.map((name) => ({
      name,
      description: `${name} description`,
      inputSchema: { type: 'object' },
    })),
    manifestHash: COMMERCE_MCP_TRUST_BASELINE.manifestHash,
    executableHash: COMMERCE_MCP_TRUST_BASELINE.executableHash,
    discoveredAt: '2026-07-13T12:00:00.000Z',
    ...overrides,
  };
}

describe('CommerceMcpTrustService', () => {
  const originalRegistryPath = process.env.COMMERCE_MCP_TRUST_REGISTRY_PATH;

  afterEach(() => {
    if (originalRegistryPath === undefined) {
      delete process.env.COMMERCE_MCP_TRUST_REGISTRY_PATH;
    } else {
      process.env.COMMERCE_MCP_TRUST_REGISTRY_PATH = originalRegistryPath;
    }
  });

  it('canonicalizes nested object keys independently of transport ordering', () => {
    const left = {
      name: 'tool',
      inputSchema: { type: 'object', properties: { z: 1, a: 2 } },
    };
    const right = {
      inputSchema: { properties: { a: 2, z: 1 }, type: 'object' },
      name: 'tool',
    };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
  });

  it('loads a detached signed registry artifact from the configured path', () => {
    const directory = mkdtempSync(join(tmpdir(), 'commerce-mcp-trust-'));
    const registryPath = join(directory, 'baseline.json');
    try {
      writeFileSync(
        registryPath,
        JSON.stringify(COMMERCE_MCP_TRUST_BASELINE),
        'utf8',
      );
      process.env.COMMERCE_MCP_TRUST_REGISTRY_PATH = registryPath;
      const loaded = loadCommerceMcpTrustBaseline();
      expect(loaded.manifestHash).toBe(
        COMMERCE_MCP_TRUST_BASELINE.manifestHash,
      );
      expect(verifyTrustBaselineSignature(loaded)).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('fails closed when the configured registry artifact is malformed', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'commerce-mcp-trust-'));
    const registryPath = join(directory, 'baseline.json');
    try {
      writeFileSync(registryPath, '{"registryVersion":1}', 'utf8');
      process.env.COMMERCE_MCP_TRUST_REGISTRY_PATH = registryPath;
      expect(() => loadCommerceMcpTrustBaseline()).toThrow();
      const client = {
        getManifest: jest.fn().mockResolvedValue(liveManifest()),
      };
      const service = new CommerceMcpTrustService(client as never);
      const result = await service.inspect(new Date('2026-07-13T12:00:00Z'));
      expect(result.integrityVerified).toBe(false);
      expect(result.reasons).toEqual(['trust_registry_invalid']);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('verifies the detached Ed25519 registry signature', () => {
    expect(verifyTrustBaselineSignature(COMMERCE_MCP_TRUST_BASELINE)).toBe(
      true,
    );
    expect(
      verifyTrustBaselineSignature({
        ...COMMERCE_MCP_TRUST_BASELINE,
        manifestHash: '0'.repeat(64),
      }),
    ).toBe(false);
    expect(
      verifyTrustBaselineSignature({
        ...COMMERCE_MCP_TRUST_BASELINE,
        signing: {
          ...COMMERCE_MCP_TRUST_BASELINE.signing,
          signatureBase64: 'AA==',
        },
      }),
    ).toBe(false);
  });

  it('trusts only the exact approved runtime identity', async () => {
    const client = { getManifest: jest.fn().mockResolvedValue(liveManifest()) };
    const service = new CommerceMcpTrustService(client as never);

    const result = await service.inspect(new Date('2026-07-13T12:00:00Z'));

    expect(result.status).toBe('trusted');
    expect(result.integrityVerified).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it.each([
    ['manifest hash', { manifestHash: '0'.repeat(64) }],
    ['executable hash', { executableHash: '1'.repeat(64) }],
    [
      'server version',
      {
        server: {
          ...liveManifest().server,
          version: '9.9.9',
        },
      },
    ],
    [
      'tool set',
      {
        tools: [
          ...liveManifest().tools,
          {
            name: 'unapproved_tool',
            description: 'unapproved',
            inputSchema: { type: 'object' },
          },
        ],
      },
    ],
  ])('blocks a changed %s before tool execution', async (_label, override) => {
    const client = {
      getManifest: jest.fn().mockResolvedValue(liveManifest(override)),
    };
    const service = new CommerceMcpTrustService(client as never);

    const result = await service.inspect(new Date('2026-07-13T12:00:00Z'));

    expect(result.status).toBe('blocked');
    expect(result.integrityVerified).toBe(false);
    await expect(
      service.assertTrusted(new Date('2026-07-13T12:00:00Z')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('blocks an expired trust approval', async () => {
    const client = { getManifest: jest.fn().mockResolvedValue(liveManifest()) };
    const service = new CommerceMcpTrustService(client as never);

    const result = await service.inspect(new Date('2030-01-01T00:00:00Z'));

    expect(result.status).toBe('blocked');
    expect(result.reasons).toContain('trust_approval_expired');
  });
});
