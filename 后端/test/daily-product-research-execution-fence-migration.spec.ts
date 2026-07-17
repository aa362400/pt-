import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const backendRoot = join(__dirname, '..');
const migrationDirectory = join(
  backendRoot,
  'prisma',
  'migrations',
  '20260716236000_add_daily_research_execution_fence',
);

describe('daily product research execution fence migration', () => {
  it('adds a durable lease owner, expiry, and monotonic execution epoch', () => {
    const schema = readFileSync(
      join(backendRoot, 'prisma', 'schema.prisma'),
      'utf8',
    );
    const migration = readFileSync(
      join(migrationDirectory, 'migration.sql'),
      'utf8',
    );

    expect(schema).toMatch(
      /model ProductResearchRun\s*{[\s\S]*?leaseOwner\s+String\?[\s\S]*?leaseExpiresAt\s+DateTime\?[\s\S]*?executionEpoch\s+Int\s+@default\(0\)/,
    );
    expect(schema).toContain(
      '@@index([organizationId, status, leaseExpiresAt], map: "product_research_runs_org_status_lease_expiry_idx")',
    );
    expect(migration).toContain('ADD COLUMN "leaseOwner" TEXT');
    expect(migration).toContain('ADD COLUMN "leaseExpiresAt" TIMESTAMP(3)');
    expect(migration).toContain(
      'ADD COLUMN "executionEpoch" INTEGER NOT NULL DEFAULT 0',
    );
    expect(migration).toContain(
      'CONSTRAINT "product_research_runs_execution_epoch_nonnegative_check"',
    );
    expect(migration).toContain(
      'CREATE INDEX "product_research_runs_org_status_lease_expiry_idx"',
    );
  });

  it('ships governed metadata and a rollback for the additive fields', () => {
    const metadata = JSON.parse(
      readFileSync(join(migrationDirectory, 'metadata.json'), 'utf8'),
    ) as Record<string, unknown>;
    const rollback = readFileSync(
      join(migrationDirectory, 'rollback.sql'),
      'utf8',
    );

    expect(metadata).toMatchObject({
      releaseId: 'v1.1-schema-governance',
      owner: 'backend-platform',
      dataMigration: false,
    });
    expect(rollback).toContain(
      'DROP INDEX IF EXISTS "product_research_runs_org_status_lease_expiry_idx"',
    );
    expect(rollback).toContain('DROP COLUMN IF EXISTS "leaseOwner"');
    expect(rollback).toContain('DROP COLUMN IF EXISTS "leaseExpiresAt"');
    expect(rollback).toContain('DROP COLUMN IF EXISTS "executionEpoch"');
  });
});
