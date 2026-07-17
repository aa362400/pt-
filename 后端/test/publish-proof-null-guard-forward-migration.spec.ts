import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const backendRoot = join(__dirname, '..');
const migrationName = '20260717021000_harden_publish_proof_null_guards';
const migrationDirectory = join(
  backendRoot,
  'prisma',
  'migrations',
  migrationName,
);

describe('publish proof NULL guard forward migration', () => {
  const sql = readFileSync(join(migrationDirectory, 'migration.sql'), 'utf8');

  it('replaces every publish proof validator without mutating applied history', () => {
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION "validate_listing_publish_snapshot_economics_chain"()',
    );
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION "validate_external_submission_economics_chain"()',
    );
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION "validate_listing_publish_snapshot_signed_risk"()',
    );
    expect(sql).not.toMatch(/\b(?:DELETE|TRUNCATE|DROP TABLE)\b/i);
  });

  it('fails closed when economics freshness policy fields are absent or NULL', () => {
    expect(sql).toContain(
      "jsonb_typeof(evaluation_policy->'dispatchFreshnessBufferSeconds') IS DISTINCT FROM 'number'",
    );
    expect(sql).toContain(
      "jsonb_typeof(evaluation_policy->'maxEvidenceAgeSeconds') IS DISTINCT FROM 'number'",
    );
    expect(sql).toContain(
      "COALESCE(evaluation_policy->>'dispatchFreshnessBufferSeconds', '') !~ '^\\d+$'",
    );
    expect(sql).toContain(
      "COALESCE(evaluation_policy->>'maxEvidenceAgeSeconds', '') !~ '^\\d+$'",
    );
  });

  it('fails closed when candidate or final-listing risk fields are absent', () => {
    expect(sql).toContain(
      "candidate_risk->>'schemaVersion' IS DISTINCT FROM 'risk-clearance-evidence/v1'",
    );
    expect(sql).toContain(
      "COALESCE(candidate_attestation->>'expiresAt', '') = ''",
    );
    expect(sql).toContain(
      "listing_screening->>'decision' IS DISTINCT FROM 'PASS'",
    );
    expect(sql).toContain(
      "listing_screening->>'publishable' IS DISTINCT FROM 'true'",
    );
    expect(sql).toContain(
      "jsonb_typeof(listing_screening->'hardGateReasons') IS DISTINCT FROM 'array'",
    );
    expect(sql).not.toContain('<>');
  });

  it('indexes the user foreign key before the request ledger receives traffic', () => {
    expect(sql).toContain(
      'CREATE INDEX "listing_generation_requests_userId_idx"',
    );
    expect(sql).toContain('ON "listing_generation_requests"("userId")');
  });

  it('is governed as a forward-only high-risk security hardening', () => {
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
    expect(rollback).toContain('FORWARD_ONLY');
    expect(rollback).not.toMatch(/DROP\s+(?:FUNCTION|INDEX|TABLE)/i);
  });

  it('ships real PostgreSQL semantic rejection cases for every NULL bypass', () => {
    const semanticSql = readFileSync(
      join(
        backendRoot,
        'scripts',
        'migrations',
        'verify-candidate-economics-semantics.sql',
      ),
      'utf8',
    );

    expect(semanticSql).toContain('expected_null_policy_rejection');
    expect(semanticSql).toContain('expected_candidate_expiry_rejection');
    expect(semanticSql).toContain('expected_listing_expiry_rejection');
    expect(semanticSql).toContain('expected_partial_screening_rejection');
  });
});
