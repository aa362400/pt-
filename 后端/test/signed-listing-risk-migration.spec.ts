import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('signed listing risk migration', () => {
  const sql = readFileSync(
    resolve(
      process.cwd(),
      'prisma/migrations/20260716232000_require_signed_listing_risk_clearance/migration.sql',
    ),
    'utf8',
  );

  it('requires signed candidate and exact final-listing risk evidence', () => {
    expect(sql).toContain('risk-clearance-evidence/v1');
    expect(sql).toContain('listing-final-risk-clearance/v1');
    expect(sql).toContain('listing-risk-subject/v1');
    expect(sql).toContain("'^hmac-sha256:[a-f0-9]{64}$'");
    expect(sql).toContain("listing_screening->>'decision' <> 'PASS'");
    expect(sql).toContain("listing_screening->>'publishable' <> 'true'");
    expect(sql).toContain('mcpManifestHash');
    expect(sql).toContain('mcpExecutableHash');
  });

  it('binds the final subject to organization, listing, title, platform, and images', () => {
    expect(sql).toContain(
      '\'listing:\' || NEW."organizationId" || \':\' || NEW."listingDraftId"',
    );
    expect(sql).toContain(
      "lower(COALESCE(listing_subject->>'platform', '')) <> 'ozon'",
    );
    expect(sql).toContain(
      'NEW."snapshot"#>>\'{canonicalProduct,identity,title}\'',
    );
    expect(sql).toContain(
      "jsonb_array_length(listing_subject->'imageHashes') = 0",
    );
  });

  it('makes signed risk-clearance records append-only', () => {
    expect(sql).toContain('signed risk clearance records are append-only');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON "product_risk_records"');
  });
});
