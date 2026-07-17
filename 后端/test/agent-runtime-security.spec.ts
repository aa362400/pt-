import { readFileSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { createAgentProvider } from '../src/agents/agent.module.js';
import { HttpAgentProvider } from '../src/agents/http-agent.provider.js';
import { MockAgentProvider } from '../src/agents/mock-agent.provider.js';
import { envSchema } from '../src/shared/config/env.js';

const productionEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/shopmate',
  JWT_ACCESS_SECRET: 'production-access-secret-min-32-characters',
  JWT_REFRESH_SECRET: 'production-refresh-secret-min-32-characters',
  JWT_2FA_TEMP_SECRET: 'production-2fa-secret-min-32-characters!!',
  CORS_ORIGINS: 'https://shop.example.com',
  CREDENTIAL_ENCRYPTION_PROVIDER: 'aws-kms',
  KMS_KEY_ID: 'alias/shopmate-credentials',
  AUDIT_ARCHIVE_ENABLED: 'true',
  AUDIT_ARCHIVE_S3_BUCKET: 'shopmate-audit-worm',
  AUDIT_ARCHIVE_OBJECT_LOCK_MODE: 'COMPLIANCE',
  AUDIT_ARCHIVE_RETENTION_DAYS: '2555',
  AUDIT_ARCHIVE_KMS_KEY_ID: 'alias/shopmate-audit',
};

describe('agent runtime production security', () => {
  it('rejects production without a real agent configuration', () => {
    const result = envSchema.safeParse({
      ...productionEnv,
      AGENT_ALLOW_MOCK: 'false',
    });
    expect(result.success).toBe(false);
  });

  it('rejects mock agent mode in production', () => {
    const result = envSchema.safeParse({
      ...productionEnv,
      AGENT_BASE_URL: 'http://agent:8080',
      AGENT_API_KEY: 'shared-secret',
      AGENT_ALLOW_MOCK: 'true',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a complete real-agent production configuration', () => {
    const result = envSchema.safeParse({
      ...productionEnv,
      AGENT_BASE_URL: 'http://agent:8080',
      AGENT_API_KEY: 'shared-secret',
      AGENT_ALLOW_MOCK: 'false',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.AGENT_ALLOW_MOCK).toBe(false);
  });

  it('accepts only the exact same-origin Agent image route as a relative public URL', () => {
    const accepted = envSchema.safeParse({
      ...productionEnv,
      AGENT_BASE_URL: 'http://agent:8080',
      AGENT_PUBLIC_URL: '/agent',
      AGENT_API_KEY: 'shared-secret',
      AGENT_ALLOW_MOCK: 'false',
    });
    const rejected = envSchema.safeParse({
      ...productionEnv,
      AGENT_BASE_URL: 'http://agent:8080',
      AGENT_PUBLIC_URL: '/arbitrary-proxy',
      AGENT_API_KEY: 'shared-secret',
      AGENT_ALLOW_MOCK: 'false',
    });

    expect(accepted.success).toBe(true);
    expect(rejected.success).toBe(false);
  });

  it('rejects production without a KMS credential encryption key', () => {
    const { KMS_KEY_ID: _kmsKeyId, ...withoutEncryption } = productionEnv;
    const result = envSchema.safeParse({
      ...withoutEncryption,
      AGENT_BASE_URL: 'http://agent:8080',
      AGENT_API_KEY: 'shared-secret',
      AGENT_ALLOW_MOCK: 'false',
    });
    expect(result.success).toBe(false);
  });

  it('rejects production without immutable external audit storage', () => {
    const result = envSchema.safeParse({
      ...productionEnv,
      AUDIT_ARCHIVE_ENABLED: 'false',
      AGENT_BASE_URL: 'http://agent:8080',
      AGENT_API_KEY: 'shared-secret',
      AGENT_ALLOW_MOCK: 'false',
    });
    expect(result.success).toBe(false);
  });

  it('refuses to instantiate a provider when mock mode is disabled', () => {
    const config = new ConfigService({ AGENT_ALLOW_MOCK: false });
    expect(() => createAgentProvider(config)).toThrow(
      'Real agent configuration is required',
    );
  });

  it('uses mock only when it is explicitly allowed', () => {
    const config = new ConfigService({ AGENT_ALLOW_MOCK: true });
    expect(createAgentProvider(config)).toBeInstanceOf(MockAgentProvider);
  });

  it('uses the HTTP provider when both credentials are present', () => {
    const config = new ConfigService({
      AGENT_BASE_URL: 'http://agent:8080',
      AGENT_API_KEY: 'shared-secret',
      AGENT_ALLOW_MOCK: false,
    });
    expect(createAgentProvider(config)).toBeInstanceOf(HttpAgentProvider);
  });

  it('publishes only generated image reads through nginx', () => {
    const nginx = readFileSync(
      join(__dirname, '..', '..', 'nginx', 'nginx.conf'),
      'utf8',
    );
    expect(nginx).toContain('location ^~ /agent/api/image/');
    expect(nginx).toMatch(/location \^~ \/agent\/ \{\s*return 404;\s*\}/m);
    expect(nginx).not.toMatch(/location \/agent\/ \{\s*rewrite/m);
  });

  it('requires the shared agent key on both production services', () => {
    const compose = readFileSync(
      join(__dirname, '..', '..', 'docker-compose.prod.yml'),
      'utf8',
    );
    expect(
      compose.match(
        /AGENT_API_KEY: \$\{AGENT_API_KEY:\?AGENT_API_KEY must be set\}/g,
      ),
    ).toHaveLength(2);
    expect(compose).toContain('AGENT_ALLOW_MOCK: "false"');
    expect(compose).toContain('CREDENTIAL_ENCRYPTION_PROVIDER: aws-kms');
    expect(compose).toContain(
      'KMS_KEY_ID: ${KMS_KEY_ID:?KMS_KEY_ID must be set}',
    );
  });
});
