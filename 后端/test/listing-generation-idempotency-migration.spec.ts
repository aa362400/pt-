import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const backendRoot = join(__dirname, '..');
const migrationDirectory = join(
  backendRoot,
  'prisma',
  'migrations',
  '20260717020000_add_listing_generation_idempotency',
);

describe('listing generation idempotency migration', () => {
  it('adds a durable user-scoped request ledger with one draft binding', () => {
    const schema = readFileSync(
      join(backendRoot, 'prisma', 'schema.prisma'),
      'utf8',
    );
    const migration = readFileSync(
      join(migrationDirectory, 'migration.sql'),
      'utf8',
    );

    expect(schema).toMatch(
      /model ListingGenerationRequest\s*\{[\s\S]*?organizationId\s+String[\s\S]*?userId\s+String[\s\S]*?idempotencyKeyHash\s+String[\s\S]*?requestHash\s+String[\s\S]*?status\s+String\s+@default\("IN_PROGRESS"\)[\s\S]*?listingDraftId\s+String\?\s+@unique[\s\S]*?@@unique\(\[organizationId, userId, idempotencyKeyHash\]/,
    );
    expect(migration).toContain('CREATE TABLE "listing_generation_requests"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "listing_generation_requests_org_user_key_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "listing_generation_requests_listing_draft_key"',
    );
    expect(migration).toContain(
      'CONSTRAINT "listing_generation_requests_status_check"',
    );
    expect(migration).toContain(
      'CONSTRAINT "listing_generation_requests_request_hash_check"',
    );
    expect(migration).not.toMatch(
      /(?:DELETE\s+FROM|TRUNCATE\s+TABLE|DROP\s+TABLE)\b/i,
    );
  });

  it('forces tenant RLS and registers the table in readiness verification', () => {
    const migration = readFileSync(
      join(migrationDirectory, 'migration.sql'),
      'utf8',
    );
    const verifyRls = readFileSync(
      join(backendRoot, 'src', 'cli', 'verify-rls.ts'),
      'utf8',
    );

    expect(migration).toContain(
      'ALTER TABLE "listing_generation_requests" ENABLE ROW LEVEL SECURITY',
    );
    expect(migration).toContain(
      'ALTER TABLE "listing_generation_requests" FORCE ROW LEVEL SECURITY',
    );
    expect(migration).toMatch(
      /CREATE POLICY "listing_generation_requests_organization_isolation"[\s\S]*?app\.current_organization_id/,
    );
    expect(verifyRls).toContain("'listing_generation_requests'");
  });

  it('ships governed forward recovery instead of a data-losing automatic rollback', () => {
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
      risk: 'HIGH',
      rollbackMode: 'FORWARD_ONLY',
      dataMigration: false,
    });
    expect(rollback).toContain('FORWARD_ONLY_RECOVERY');
    expect(rollback).not.toMatch(/DROP\s+TABLE/i);
  });
});
