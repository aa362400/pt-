import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('candidate economics publish proof hardening migration', () => {
  const migrationSql = readFileSync(
    join(
      process.cwd(),
      'prisma',
      'migrations',
      '20260716231000_harden_candidate_economics_publish_proof',
      'migration.sql',
    ),
    'utf8',
  );

  it('is atomic and only replaces proof validators', () => {
    expect(migrationSql).toMatch(/^--[\s\S]*?BEGIN;/);
    expect(migrationSql).toContain("SET LOCAL lock_timeout = '5s'");
    expect(migrationSql).toContain("SET LOCAL statement_timeout = '120s'");
    expect(migrationSql.trimEnd()).toMatch(/COMMIT;$/);
    expect(migrationSql).not.toMatch(/\b(?:DROP|DELETE|TRUNCATE)\b/i);
    expect(migrationSql).not.toMatch(/\b(?:CREATE|ALTER)\s+TABLE\b/i);
  });

  it('requires the exact eleven base roles with at most one FX rate', () => {
    for (const role of [
      'ADVERTISING',
      'DOMESTIC_TRANSPORT',
      'FX_VOLATILITY_RESERVE',
      'OZON_COMMISSION',
      'OZON_FULFILLMENT',
      'OZON_PAYMENT',
      'OZON_STORAGE',
      'PACKAGING',
      'REFUND_LOSS',
      'SALE_PRICE',
      'TAX',
    ]) {
      expect(migrationSql).toContain(`'${role}'`);
    }
    expect(migrationSql).toContain("'FX_RATE'");
    expect(migrationSql).toContain('economics input membership is incomplete');
  });

  it('binds v3 JSON price, economics hashes, risk clearance, and freshness', () => {
    expect(migrationSql).toContain("'listing-publish-snapshot/v3'");
    expect(migrationSql).toContain("'{economics,evaluationId}'");
    expect(migrationSql).toContain("'{payload,price}'");
    expect(migrationSql).toContain("'{safetyEvidence,risk,clearanceRecordId}'");
    expect(migrationSql).toContain("'RISK_CLEARANCE_ATTESTED'");
    expect(migrationSql).toContain('dispatchFreshnessBufferSeconds');
    expect(migrationSql).toContain('evaluation_gross_margin < 0.5');
    expect(migrationSql).toContain('candidate."status" = \'RECOMMENDED\'');
  });

  it('revalidates freshness at claim/send but permits late outcome recording', () => {
    expect(migrationSql).toContain(
      "NEW.\"status\" IN ('CLAIMED', 'REQUEST_SENT')",
    );
    expect(migrationSql).toContain('IF NOT validates_dispatch THEN');
    expect(migrationSql).toContain(
      'Result/reconciliation updates must remain recordable after expiry',
    );
  });

  it('binds the external v3 request to the same immutable snapshot and proof', () => {
    expect(migrationSql).toContain("'external-submission/v3'");
    expect(migrationSql).toContain(
      'snapshot."snapshotHash" = NEW."requestHash"',
    );
    expect(migrationSql).toContain("'{economicsEvaluationHash}'");
    expect(migrationSql).toContain(
      'external submission request proof binding mismatch',
    );
  });
});
