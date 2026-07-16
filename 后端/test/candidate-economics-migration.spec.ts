import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('candidate economics migration', () => {
  const migrationName = '20260716230000_add_candidate_economics_evidence';
  const migrationSql = readFileSync(
    join(process.cwd(), 'prisma', 'migrations', migrationName, 'migration.sql'),
    'utf8',
  );

  const ledgerTables = [
    'candidate_economics_evidence',
    'candidate_economics_evaluations',
    'candidate_economics_evaluation_inputs',
  ];

  it('creates only the three candidate economics ledgers and additive publish links', () => {
    for (const table of ledgerTables) {
      expect(migrationSql).toContain(`CREATE TABLE "${table}"`);
    }

    expect(migrationSql).toContain('ALTER TABLE "product_launches"');
    expect(migrationSql).toContain('ADD COLUMN "researchCandidateId" TEXT');
    expect(migrationSql).toContain('ADD COLUMN "economicsEvaluationId" TEXT');
    expect(migrationSql).toContain('ALTER TABLE "listing_publish_snapshots"');
    expect(migrationSql).toContain('ADD COLUMN "economicsInputSetHash" TEXT');
    expect(migrationSql).toContain('ALTER TABLE "external_submissions"');
    expect(migrationSql).not.toMatch(/DROP\s+(?:TABLE|COLUMN)\b/i);
    expect(migrationSql).not.toMatch(/ALTER\s+COLUMN[\s\S]*?\bTYPE\b/i);
  });

  it('applies atomically with bounded lock and statement waits', () => {
    expect(migrationSql.trimStart()).toMatch(/^BEGIN;/);
    expect(migrationSql).toContain("SET LOCAL lock_timeout = '5s'");
    expect(migrationSql).toContain("SET LOCAL statement_timeout = '120s'");
    expect(migrationSql.trimEnd()).toMatch(/COMMIT;$/);
  });

  it('links every Prisma relation with RESTRICT semantics', () => {
    const expectedForeignKeys = [
      ['candidate_economics_evidence_organizationId_fkey', 'organizations'],
      ['candidate_economics_evidence_workspaceId_fkey', 'workspaces'],
      [
        'candidate_economics_evidence_researchRunId_fkey',
        'product_research_runs',
      ],
      ['candidate_economics_evidence_candidateId_fkey', 'product_candidates'],
      [
        'candidate_economics_evaluations_supplierQuoteEvidenceId_fkey',
        'supplier_quote_evidence',
      ],
      ['candidate_economics_evaluations_organizationId_fkey', 'organizations'],
      ['candidate_economics_evaluations_workspaceId_fkey', 'workspaces'],
      [
        'candidate_economics_evaluations_researchRunId_fkey',
        'product_research_runs',
      ],
      ['candidate_economics_evaluations_candidateId_fkey', 'product_candidates'],
      [
        'candidate_economics_evaluation_inputs_organizationId_fkey',
        'organizations',
      ],
      [
        'candidate_economics_evaluation_inputs_workspaceId_fkey',
        'workspaces',
      ],
      [
        'candidate_economics_evaluation_inputs_researchRunId_fkey',
        'product_research_runs',
      ],
      [
        'candidate_economics_evaluation_inputs_candidateId_fkey',
        'product_candidates',
      ],
      [
        'candidate_economics_evaluation_inputs_evaluationId_fkey',
        'candidate_economics_evaluations',
      ],
      [
        'candidate_economics_evaluation_inputs_economicsEvidenceId_fkey',
        'candidate_economics_evidence',
      ],
      ['product_launches_researchCandidateId_fkey', 'product_candidates'],
      [
        'product_launches_economicsEvaluationId_fkey',
        'candidate_economics_evaluations',
      ],
      [
        'listing_publish_snapshots_economicsEvaluationId_fkey',
        'candidate_economics_evaluations',
      ],
      [
        'external_submissions_economicsEvaluationId_fkey',
        'candidate_economics_evaluations',
      ],
    ] as const;

    for (const [constraint, parent] of expectedForeignKeys) {
      expect(migrationSql).toMatch(
        new RegExp(
          `CONSTRAINT "${constraint}"[\\s\\S]*?REFERENCES "${parent}"\\("id"\\)[\\s\\S]*?ON DELETE RESTRICT ON UPDATE CASCADE`,
        ),
      );
    }
    expect(expectedForeignKeys).toHaveLength(19);
  });

  it('enforces trusted evidence and evaluation shapes in PostgreSQL', () => {
    for (const constraint of [
      'candidate_economics_evidence_contract_check',
      'candidate_economics_evidence_value_shape_check',
      'candidate_economics_evidence_time_chain_check',
      'candidate_economics_evaluations_contract_check',
      'candidate_economics_evaluations_result_shape_check',
      'candidate_economics_evaluation_inputs_contract_check',
    ]) {
      expect(migrationSql).toContain(`CONSTRAINT "${constraint}"`);
    }
    expect(migrationSql).toContain(
      "'economics-evidence/' || \"organizationId\" || '/raw/' || \"rawSnapshotSha256\"",
    );
  });

  it('locks the complete parent chain and blocks later rebinding', () => {
    for (const functionName of [
      'lock_candidate_economics_evidence_parents',
      'lock_candidate_economics_evaluation_parents',
      'lock_candidate_economics_evaluation_input_parents',
      'reject_candidate_economics_workspace_rebinding',
      'reject_candidate_economics_research_run_rebinding',
      'reject_candidate_economics_candidate_rebinding',
    ]) {
      expect(migrationSql).toContain(`CREATE FUNCTION "${functionName}"()`);
      expect(migrationSql).toContain(
        `REVOKE ALL ON FUNCTION "${functionName}"() FROM PUBLIC`,
      );
    }
    expect(migrationSql.match(/SECURITY DEFINER/g)?.length).toBeGreaterThanOrEqual(
      6,
    );
    expect(migrationSql).toContain('SET row_security = off');
    expect(migrationSql).toContain(
      'CREATE TRIGGER "candidate_economics_candidate_delete_guard"',
    );
  });

  it('validates outward proof links and protects publish audit rows from deletion', () => {
    for (const functionName of [
      'validate_product_launch_economics_chain',
      'validate_listing_publish_snapshot_economics_chain',
      'validate_external_submission_economics_chain',
      'reject_economics_publish_audit_delete',
    ]) {
      expect(migrationSql).toContain(`CREATE FUNCTION "${functionName}"()`);
    }
    expect(migrationSql).toContain(
      'CREATE TRIGGER "listing_publish_snapshots_delete_guard"',
    );
    expect(migrationSql).toContain(
      'CREATE TRIGGER "external_submissions_delete_guard"',
    );
    expect(migrationSql).toContain(
      'REVOKE DELETE ON "listing_publish_snapshots" FROM "shopmate_app"',
    );
    expect(migrationSql).toContain(
      'REVOKE DELETE ON "external_submissions" FROM "shopmate_app"',
    );
  });

  it('replaces broad publish-ledger policies with context-bound non-delete policies', () => {
    expect(migrationSql).toContain(
      'DROP POLICY "listing_publish_snapshots_organization_isolation"',
    );
    expect(migrationSql).toContain(
      'DROP POLICY "external_submissions_organization_isolation"',
    );
    expect(migrationSql).toContain(
      'CREATE POLICY "listing_publish_snapshots_update"',
    );
    expect(migrationSql).toContain(
      'CREATE POLICY "external_submissions_update"',
    );
    expect(migrationSql).not.toMatch(
      /CREATE POLICY "(?:listing_publish_snapshots|external_submissions)[^"]*"[\s\S]*?FOR DELETE/,
    );
  });

  it('forces tenant RLS and exposes append-only application policies', () => {
    for (const table of ledgerTables) {
      expect(migrationSql).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      expect(migrationSql).toContain(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      );
      expect(migrationSql).toMatch(
        new RegExp(
          `CREATE POLICY "${table}_select"[\\s\\S]*?ON "${table}"[\\s\\S]*?FOR SELECT[\\s\\S]*?app\\.current_organization_id`,
        ),
      );
      expect(migrationSql).toMatch(
        new RegExp(
          `CREATE POLICY "${table}_insert"[\\s\\S]*?ON "${table}"[\\s\\S]*?FOR INSERT[\\s\\S]*?app\\.current_organization_id`,
        ),
      );
      expect(migrationSql).not.toMatch(
        new RegExp(`ON "${table}"[\\s\\S]*?FOR (?:UPDATE|DELETE)`),
      );
      expect(migrationSql).toContain(
        `REVOKE UPDATE, DELETE ON "${table}" FROM "shopmate_app"`,
      );
    }
  });

  it('keeps all three ledgers immutable even for a privileged writer', () => {
    expect(migrationSql).toContain(
      'CREATE TRIGGER "candidate_economics_evidence_immutable_guard"',
    );
    expect(migrationSql).toContain(
      'CREATE TRIGGER "candidate_economics_evaluations_immutable_guard"',
    );
    expect(migrationSql).toContain(
      'CREATE TRIGGER "candidate_economics_evaluation_inputs_immutable_guard"',
    );
    expect(migrationSql.match(/BEFORE UPDATE OR DELETE/g)).toHaveLength(3);
  });

  it('includes the new ledgers in runtime RLS and immutability readiness', () => {
    const verifyRls = readFileSync(
      join(process.cwd(), 'src', 'cli', 'verify-rls.ts'),
      'utf8',
    );

    for (const table of ledgerTables) {
      expect(verifyRls.match(new RegExp(`'${table}'`, 'g'))).toHaveLength(2);
    }
    expect(verifyRls).toContain("'listing_publish_snapshots'");
    expect(verifyRls).toContain("'external_submissions'");
    expect(verifyRls).toContain('app_can_update');
    expect(verifyRls).toContain('immutable_mutation_guard');
    expect(verifyRls).toContain('delete_guard');
  });

  it('keeps app-role bootstrap least-privileged after blanket grants', () => {
    const bootstrap = readFileSync(
      join(process.cwd(), 'src', 'cli', 'bootstrap-database-app-role.ts'),
      'utf8',
    );
    for (const table of [
      'supplier_quote_evidence',
      'supplier_image_search_evidence',
      ...ledgerTables,
    ]) {
      expect(bootstrap).toContain(table);
    }
    expect(bootstrap).toContain('IMMUTABLE_INSERT_ONLY_TABLES');
    expect(bootstrap).toContain('DELETE_PROTECTED_TABLES');
  });
});
