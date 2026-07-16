import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface CommerceMcpTrustBaseline {
  registryVersion: number;
  source: string;
  approvalType: string;
  server: {
    name: string;
    version: string;
    protocolVersion: string;
  };
  manifestHash: string;
  executableHash: string;
  allowedTools: readonly string[];
  approvedAt: string;
  expiresAt: string;
  signing: {
    algorithm: string;
    keyId: string;
    publicKeySpkiBase64: string;
    signatureBase64: string;
  };
}

export const COMMERCE_MCP_TRUST_BASELINE = {
  registryVersion: 1,
  source: 'local_commerce_mcp',
  approvalType: 'ed25519_signed_hash_pin',
  server: {
    name: 'commerce-agent-tools',
    version: '1.0.0',
    protocolVersion: '2024-11-05',
  },
  manifestHash:
    '9de31dbd4271e6b85f71cd7feebfcf9c74c27166aa3a2cde50a872c6304a9215',
  executableHash:
    '53167236e8d0bf7afa3107b5a326567e913957a462f12d96cdf6b056d3df659d',
  allowedTools: [
    'amazon_title_optimizer',
    'analyze_opportunity',
    'calc_profit',
    'check_risk',
    'export_image_pack',
    'export_listing_csv',
    'generate_image_prompts',
    'listing_quality_score',
    'ozon_pricing_engine',
    'suggest_keywords',
    'temu_price_check',
    'temu_pricing_engine',
  ],
  approvedAt: '2026-07-15T01:47:00.000+08:00',
  expiresAt: '2026-10-13T01:47:00.000+08:00',
  signing: {
    algorithm: 'Ed25519',
    keyId: 'commerce-mcp-release-2026-07-ozon',
    publicKeySpkiBase64:
      'MCowBQYDK2VwAyEA2I7TPpGRbSEfGE2XkRlMxt0aT6+ud3g6xn9GJvAwJLE=',
    signatureBase64:
      'te/wNshbVkCYFvGEobJXwJ9reLA4FOpAB95OJxTRszQ4WL16gpA/iCo8RX56g5Gy/CcEaU5ActZD+283qXV+Cw==',
  },
} as const satisfies CommerceMcpTrustBaseline;

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Commerce MCP trust registry field ${key} is required`);
  }
  return value.trim();
}

function requiredRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = record[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      `Commerce MCP trust registry field ${key} must be an object`,
    );
  }
  return value as Record<string, unknown>;
}

function parseTrustBaseline(value: unknown): CommerceMcpTrustBaseline {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Commerce MCP trust registry must be a JSON object');
  }
  const record = value as Record<string, unknown>;
  const server = requiredRecord(record, 'server');
  const signing = requiredRecord(record, 'signing');
  const registryVersion = record.registryVersion;
  if (!Number.isInteger(registryVersion) || Number(registryVersion) < 1) {
    throw new Error(
      'Commerce MCP trust registryVersion must be a positive integer',
    );
  }
  const allowedTools = record.allowedTools;
  if (
    !Array.isArray(allowedTools) ||
    allowedTools.length === 0 ||
    allowedTools.some((tool) => typeof tool !== 'string' || !tool.trim())
  ) {
    throw new Error(
      'Commerce MCP trust allowedTools must be a non-empty string array',
    );
  }
  const uniqueTools = [
    ...new Set((allowedTools as string[]).map((tool) => tool.trim())),
  ];
  if (uniqueTools.length !== allowedTools.length) {
    throw new Error(
      'Commerce MCP trust allowedTools must not contain duplicates',
    );
  }
  const manifestHash = requiredString(record, 'manifestHash');
  const executableHash = requiredString(record, 'executableHash');
  for (const [name, hash] of [
    ['manifestHash', manifestHash],
    ['executableHash', executableHash],
  ]) {
    if (!/^[a-f0-9]{64}$/i.test(hash)) {
      throw new Error(
        `Commerce MCP trust ${name} must be a SHA-256 hex digest`,
      );
    }
  }
  const approvedAt = requiredString(record, 'approvedAt');
  const expiresAt = requiredString(record, 'expiresAt');
  if (
    !Number.isFinite(Date.parse(approvedAt)) ||
    !Number.isFinite(Date.parse(expiresAt))
  ) {
    throw new Error(
      'Commerce MCP trust approval timestamps must be valid ISO dates',
    );
  }

  return {
    registryVersion: Number(registryVersion),
    source: requiredString(record, 'source'),
    approvalType: requiredString(record, 'approvalType'),
    server: {
      name: requiredString(server, 'name'),
      version: requiredString(server, 'version'),
      protocolVersion: requiredString(server, 'protocolVersion'),
    },
    manifestHash: manifestHash.toLowerCase(),
    executableHash: executableHash.toLowerCase(),
    allowedTools: uniqueTools,
    approvedAt,
    expiresAt,
    signing: {
      algorithm: requiredString(signing, 'algorithm'),
      keyId: requiredString(signing, 'keyId'),
      publicKeySpkiBase64: requiredString(signing, 'publicKeySpkiBase64'),
      signatureBase64: requiredString(signing, 'signatureBase64'),
    },
  };
}

export function loadCommerceMcpTrustBaseline(
  registryPath = process.env.COMMERCE_MCP_TRUST_REGISTRY_PATH?.trim(),
): CommerceMcpTrustBaseline {
  if (!registryPath) {
    return COMMERCE_MCP_TRUST_BASELINE;
  }
  const absolutePath = resolve(registryPath);
  const raw = readFileSync(absolutePath, 'utf8');
  return parseTrustBaseline(JSON.parse(raw) as unknown);
}
