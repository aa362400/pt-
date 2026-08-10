import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readEnterpriseReadinessEvidence } from '../src/features/enterprise-slo/enterprise-readiness-evidence.js';

const gateNames = [
  'kms',
  'objectLock',
  'penetrationTest',
  'slo14Day',
  'nonMockAgent',
  'mcpTrust',
  'memoryGovernance',
  'judgeCalibration',
  'ozonReadOnly',
  'stripeLive',
] as const;

function evidence(checkedAt: string) {
  return {
    status: 'failed',
    checkedAt,
    gates: Object.fromEntries(
      gateNames.map((name) => [
        name,
        {
          status: name === 'ozonReadOnly' ? 'passed' : 'not_configured',
          message: `${name} evidence`,
        },
      ]),
    ),
    failures: ['kms: not configured'],
  };
}

describe('readEnterpriseReadinessEvidence', () => {
  let directory: string;
  let path: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'enterprise-readiness-'));
    path = join(directory, 'evidence.json');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('returns not_verified when no verifier artifact exists', async () => {
    await expect(
      readEnterpriseReadinessEvidence(path, new Date('2026-07-13T12:00:00Z')),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'not_verified',
        claimAllowed: false,
        stale: true,
        gates: {},
      }),
    );
  });

  it('returns validated gates without promoting a failed report', async () => {
    await writeFile(
      path,
      JSON.stringify(evidence('2026-07-13T10:00:00.000Z')),
      'utf8',
    );

    const result = await readEnterpriseReadinessEvidence(
      path,
      new Date('2026-07-13T12:00:00Z'),
    );

    expect(result.status).toBe('failed');
    expect(result.claimAllowed).toBe(false);
    expect(result.stale).toBe(false);
    expect(result.gates.ozonReadOnly.status).toBe('passed');
    expect(Object.keys(result.gates)).toEqual(gateNames);
  });

  it('marks otherwise valid evidence stale after 24 hours', async () => {
    await writeFile(
      path,
      JSON.stringify(evidence('2026-07-12T11:59:59.000Z')),
      'utf8',
    );

    const result = await readEnterpriseReadinessEvidence(
      path,
      new Date('2026-07-13T12:00:00Z'),
    );

    expect(result.stale).toBe(true);
    expect(result.claimAllowed).toBe(false);
  });

  it('rejects malformed or incomplete gate evidence', async () => {
    const invalid = evidence('2026-07-13T10:00:00.000Z');
    delete (invalid.gates as Record<string, unknown>).kms;
    invalid.status = 'passed';
    await writeFile(path, JSON.stringify(invalid), 'utf8');

    await expect(
      readEnterpriseReadinessEvidence(path, new Date('2026-07-13T12:00:00Z')),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'not_verified',
        claimAllowed: false,
        stale: true,
        gates: {},
      }),
    );
  });

  it('counts only explicit non-mock providers without requiring image-only metadata', () => {
    const verifier = readFileSync(
      join(process.cwd(), 'src', 'cli', 'verify-enterprise-readiness.ts'),
      'utf8',
    );

    expect(verifier).toContain(
      "LOWER(COALESCE(provider, '')) NOT IN ('', 'mock')",
    );
    expect(verifier).toContain(
      "COALESCE(output->>'mockMode', 'false') = 'false'",
    );
    expect(verifier).not.toContain(
      "COALESCE(output->>'mockMode', 'true') = 'false'",
    );
  });
});
