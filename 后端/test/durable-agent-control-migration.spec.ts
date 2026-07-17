import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('durable organization agent control migrations', () => {
  const firstMigration = '20260716234000_add_durable_agent_control';
  const secondMigration = '20260716235000_index_agent_control_checkpoints';
  const schema = readFileSync(
    join(process.cwd(), 'prisma', 'schema.prisma'),
    'utf8',
  );
  const firstSql = readFileSync(
    join(
      process.cwd(),
      'prisma',
      'migrations',
      firstMigration,
      'migration.sql',
    ),
    'utf8',
  );
  const secondSql = readFileSync(
    join(
      process.cwd(),
      'prisma',
      'migrations',
      secondMigration,
      'migration.sql',
    ),
    'utf8',
  );

  it('defines an organization-scoped requested control state and resumable run checkpoints', () => {
    expect(schema).toMatch(
      /enum OrganizationAgentControlState\s*{[\s\S]*?RUNNING[\s\S]*?PAUSE_REQUESTED[\s\S]*?STOP_REQUESTED[\s\S]*?}/,
    );
    expect(schema).toMatch(
      /enum ProductResearchRunStatus\s*{[\s\S]*?PAUSED[\s\S]*?STOPPED[\s\S]*?}/,
    );
    expect(schema).toMatch(
      /model OrganizationAgentControl\s*{[\s\S]*?organizationId\s+String\s+@id[\s\S]*?state\s+OrganizationAgentControlState\s+@default\(RUNNING\)[\s\S]*?revision\s+Int\s+@default\(0\)[\s\S]*?@@map\("organization_agent_controls"\)/,
    );
    expect(schema).toMatch(
      /model ProductResearchRun\s*{[\s\S]*?controlRevision\s+Int\s+@default\(0\)[\s\S]*?checkpointStage\s+ProductResearchStage\?[\s\S]*?checkpointedAt\s+DateTime\?/,
    );
    expect(schema).toMatch(
      /model AutomationRun\s*{[\s\S]*?controlRevision\s+Int\s+@default\(0\)[\s\S]*?checkpointStepIndex\s+Int\?[\s\S]*?checkpointedAt\s+DateTime\?/,
    );
    expect(schema).toContain('agentControl');
  });

  it('adds the control primitives atomically without rewriting or deleting existing data', () => {
    expect(firstSql).toContain('BEGIN;');
    expect(firstSql).toContain("SET LOCAL lock_timeout = '5s'");
    expect(firstSql).toContain("SET LOCAL statement_timeout = '120s'");
    expect(firstSql.trimEnd()).toMatch(/COMMIT;$/);
    expect(firstSql).toContain(
      'CREATE TYPE "OrganizationAgentControlState" AS ENUM',
    );
    expect(firstSql).toContain(
      'ALTER TYPE "ProductResearchRunStatus" ADD VALUE IF NOT EXISTS \'PAUSED\'',
    );
    expect(firstSql).toContain(
      'ALTER TYPE "ProductResearchRunStatus" ADD VALUE IF NOT EXISTS \'STOPPED\'',
    );
    expect(firstSql).toContain('CREATE TABLE "organization_agent_controls"');
    expect(firstSql).toContain(
      'ADD COLUMN "controlRevision" INTEGER NOT NULL DEFAULT 0',
    );
    expect(firstSql).toContain(
      'ADD COLUMN "checkpointStage" "ProductResearchStage"',
    );
    expect(firstSql).toContain('ADD COLUMN "checkpointStepIndex" INTEGER');
    expect(firstSql).toContain('LEGACY_FEATURE_FLAG_BACKFILL');
    expect(firstSql).toContain('f."name" = \'agent-paused-\' || o."id"');
    expect(firstSql).not.toMatch(
      /(?:DROP\s+(?:TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE\s+TABLE)\b/i,
    );
    expect(firstSql).not.toMatch(/ALTER\s+COLUMN[\s\S]*?\bTYPE\b/i);
  });

  it('forces tenant RLS on the new control table', () => {
    expect(firstSql).toContain(
      'ALTER TABLE "organization_agent_controls" ENABLE ROW LEVEL SECURITY',
    );
    expect(firstSql).toContain(
      'ALTER TABLE "organization_agent_controls" FORCE ROW LEVEL SECURITY',
    );
    expect(firstSql).toMatch(
      /CREATE POLICY "organization_agent_controls_organization_isolation"[\s\S]*?app\.current_organization_id/,
    );
    const verifyRls = readFileSync(
      join(process.cwd(), 'src', 'cli', 'verify-rls.ts'),
      'utf8',
    );
    expect(verifyRls).toContain("'organization_agent_controls'");
  });

  it('validates the legacy automation status text and adds checkpoint lookup indexes only after enum commit', () => {
    expect(secondSql).toContain('BEGIN;');
    expect(secondSql).toContain('CONSTRAINT "automation_runs_status_check"');
    for (const status of [
      'PENDING',
      'RUNNING',
      'PAUSED',
      'PARTIAL',
      'COMPLETED',
      'FAILED',
      'STOPPED',
    ]) {
      expect(secondSql).toContain(`'${status}'`);
    }
    expect(secondSql).toContain('NOT VALID');
    expect(secondSql).toContain(
      'VALIDATE CONSTRAINT "automation_runs_status_check"',
    );
    expect(secondSql).toContain(
      'CREATE INDEX "product_research_runs_org_status_updated_idx"',
    );
    expect(secondSql).toContain(
      'CREATE INDEX "automation_runs_flow_status_started_idx"',
    );
    expect(secondSql.trimEnd()).toMatch(/COMMIT;$/);
    expect(secondSql).not.toMatch(/\b(?:DROP|DELETE|TRUNCATE)\b/i);
  });

  it('documents the forward-only enum recovery and an automatic index rollback', () => {
    const firstMetadata = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          'prisma',
          'migrations',
          firstMigration,
          'metadata.json',
        ),
        'utf8',
      ),
    ) as { rollbackMode: string; dataMigration: boolean };
    const firstRollback = readFileSync(
      join(
        process.cwd(),
        'prisma',
        'migrations',
        firstMigration,
        'rollback.sql',
      ),
      'utf8',
    );
    const secondMetadata = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          'prisma',
          'migrations',
          secondMigration,
          'metadata.json',
        ),
        'utf8',
      ),
    ) as { rollbackMode: string; dataMigration: boolean };
    const secondRollback = readFileSync(
      join(
        process.cwd(),
        'prisma',
        'migrations',
        secondMigration,
        'rollback.sql',
      ),
      'utf8',
    );

    expect(firstMetadata).toMatchObject({
      rollbackMode: 'FORWARD_ONLY',
      dataMigration: true,
    });
    expect(firstRollback).toContain('FORWARD_ONLY_RECOVERY');
    expect(firstRollback).not.toMatch(/DROP\s+TYPE/i);
    expect(secondMetadata).toMatchObject({
      rollbackMode: 'AUTO',
      dataMigration: false,
    });
    expect(secondRollback).toContain(
      'DROP CONSTRAINT IF EXISTS "automation_runs_status_check"',
    );
    expect(secondRollback).toContain(
      'DROP INDEX IF EXISTS "product_research_runs_org_status_updated_idx"',
    );
  });
});
