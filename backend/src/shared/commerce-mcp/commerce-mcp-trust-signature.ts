import { createPublicKey, verify } from 'node:crypto';

type SignedTrustBaseline = {
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
};

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function trustBaselineSigningPayload(
  baseline: SignedTrustBaseline,
): Buffer {
  return Buffer.from(
    canonicalJson({
      registryVersion: baseline.registryVersion,
      source: baseline.source,
      approvalType: baseline.approvalType,
      server: baseline.server,
      manifestHash: baseline.manifestHash,
      executableHash: baseline.executableHash,
      allowedTools: [...baseline.allowedTools].sort(),
      approvedAt: baseline.approvedAt,
      expiresAt: baseline.expiresAt,
      signingAlgorithm: baseline.signing.algorithm,
      signingKeyId: baseline.signing.keyId,
    }),
    'utf8',
  );
}

export function verifyTrustBaselineSignature(
  baseline: SignedTrustBaseline,
): boolean {
  if (baseline.signing.algorithm !== 'Ed25519') {
    return false;
  }
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(baseline.signing.publicKeySpkiBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    return verify(
      null,
      trustBaselineSigningPayload(baseline),
      publicKey,
      Buffer.from(baseline.signing.signatureBase64, 'base64'),
    );
  } catch {
    return false;
  }
}
