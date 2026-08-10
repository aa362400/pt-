import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CommerceMcpClientService } from './commerce-mcp-client.service.js';
import { loadCommerceMcpTrustBaseline } from './commerce-mcp-trust.registry.js';
import { verifyTrustBaselineSignature } from './commerce-mcp-trust-signature.js';

@Injectable()
export class CommerceMcpTrustService {
  constructor(private readonly client: CommerceMcpClientService) {}

  async inspect(now = new Date()) {
    const manifest = await this.client.getManifest();
    let baseline;
    try {
      baseline = loadCommerceMcpTrustBaseline();
    } catch (error) {
      return {
        status: 'blocked' as const,
        integrityVerified: false,
        source: 'unavailable',
        approvalType: 'ed25519_signed_hash_pin',
        approvedAt: null,
        expiresAt: null,
        signing: {
          algorithm: 'Ed25519',
          keyId: 'unavailable',
          signatureVerified: false,
        },
        reasons: ['trust_registry_invalid'],
        registryError: error instanceof Error ? error.message : String(error),
        manifest,
      };
    }
    const reasons: string[] = [];

    if (!verifyTrustBaselineSignature(baseline)) {
      reasons.push('registry_signature_invalid');
    }
    if (manifest.server.name !== baseline.server.name) {
      reasons.push('server_name_mismatch');
    }
    if (manifest.server.version !== baseline.server.version) {
      reasons.push('server_version_mismatch');
    }
    if (manifest.server.protocolVersion !== baseline.server.protocolVersion) {
      reasons.push('protocol_version_mismatch');
    }
    if (manifest.manifestHash !== baseline.manifestHash) {
      reasons.push('manifest_hash_mismatch');
    }
    if (manifest.executableHash !== baseline.executableHash) {
      reasons.push('executable_hash_mismatch');
    }

    const expectedTools = [...baseline.allowedTools].sort();
    const actualTools = manifest.tools.map((tool) => tool.name).sort();
    if (JSON.stringify(actualTools) !== JSON.stringify(expectedTools)) {
      reasons.push('tool_set_mismatch');
    }
    if (Date.parse(baseline.expiresAt) <= now.getTime()) {
      reasons.push('trust_approval_expired');
    }

    const integrityVerified = reasons.length === 0;
    return {
      status: integrityVerified ? ('trusted' as const) : ('blocked' as const),
      integrityVerified,
      source: baseline.source,
      approvalType: baseline.approvalType,
      approvedAt: baseline.approvedAt,
      expiresAt: baseline.expiresAt,
      signing: {
        algorithm: baseline.signing.algorithm,
        keyId: baseline.signing.keyId,
        signatureVerified: !reasons.includes('registry_signature_invalid'),
      },
      reasons,
      manifest,
    };
  }

  async assertTrusted(now = new Date()) {
    const result = await this.inspect(now);
    if (!result.integrityVerified) {
      throw new ServiceUnavailableException({
        code: 'MCP_TRUST_VERIFICATION_FAILED',
        message: 'MCP tool execution blocked because trust verification failed',
        reasons: result.reasons,
      });
    }
    return result;
  }
}
