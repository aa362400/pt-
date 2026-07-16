import { ConfigService } from '@nestjs/config';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { CommerceMcpClientService } from '../shared/commerce-mcp/commerce-mcp-client.service.js';
import type { CommerceMcpTrustBaseline } from '../shared/commerce-mcp/commerce-mcp-trust.registry.js';
import {
  trustBaselineSigningPayload,
  verifyTrustBaselineSignature,
} from '../shared/commerce-mcp/commerce-mcp-trust-signature.js';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function resolvePrivateKey(pathInput: string) {
  const privateKeyPath = resolve(pathInput);
  if (!existsSync(privateKeyPath)) {
    if (process.env.COMMERCE_MCP_RELEASE_GENERATE_KEY !== 'true') {
      throw new Error(
        `Release private key does not exist: ${privateKeyPath}. Set COMMERCE_MCP_RELEASE_GENERATE_KEY=true only for local bootstrap.`,
      );
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Release key generation is forbidden in production');
    }
    mkdirSync(dirname(privateKeyPath), { recursive: true });
    const { privateKey } = generateKeyPairSync('ed25519');
    writeFileSync(
      privateKeyPath,
      privateKey.export({ format: 'pem', type: 'pkcs8' }),
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    chmodSync(privateKeyPath, 0o600);
  }
  const privateKey = createPrivateKey(readFileSync(privateKeyPath));
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('Commerce MCP release private key must be Ed25519');
  }
  return privateKey;
}

async function main() {
  const outputPath = resolve(requiredEnv('COMMERCE_MCP_TRUST_OUTPUT_PATH'));
  const keyId = requiredEnv('COMMERCE_MCP_RELEASE_KEY_ID');
  const privateKey = resolvePrivateKey(
    requiredEnv('COMMERCE_MCP_RELEASE_PRIVATE_KEY_PATH'),
  );
  const client = new CommerceMcpClientService(new ConfigService());
  const manifest = await client.getManifest();
  const approvedAt =
    process.env.COMMERCE_MCP_RELEASE_APPROVED_AT?.trim() ||
    new Date().toISOString();
  const expiresAt =
    process.env.COMMERCE_MCP_RELEASE_EXPIRES_AT?.trim() ||
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  if (Date.parse(expiresAt) <= Date.parse(approvedAt)) {
    throw new Error('Commerce MCP release expiry must be after approval time');
  }
  const publicKey = createPublicKey(privateKey);
  const baseline: CommerceMcpTrustBaseline = {
    registryVersion: 1,
    source: 'local_commerce_mcp',
    approvalType: 'ed25519_signed_hash_pin',
    server: manifest.server,
    manifestHash: manifest.manifestHash,
    executableHash: manifest.executableHash,
    allowedTools: manifest.tools.map((tool) => tool.name).sort(),
    approvedAt,
    expiresAt,
    signing: {
      algorithm: 'Ed25519',
      keyId,
      publicKeySpkiBase64: publicKey
        .export({ format: 'der', type: 'spki' })
        .toString('base64'),
      signatureBase64: '',
    },
  };
  baseline.signing.signatureBase64 = sign(
    null,
    trustBaselineSigningPayload(baseline),
    privateKey,
  ).toString('base64');
  if (!verifyTrustBaselineSignature(baseline)) {
    throw new Error('Generated Commerce MCP trust signature did not verify');
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(baseline, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o644,
  });
  renameSync(temporaryPath, outputPath);
  process.stdout.write(
    `${JSON.stringify({
      outputPath,
      keyId,
      manifestHash: baseline.manifestHash,
      executableHash: baseline.executableHash,
      toolCount: baseline.allowedTools.length,
      approvedAt,
      expiresAt,
      signatureVerified: true,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
