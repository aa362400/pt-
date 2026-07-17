import { evaluateRlsReadiness } from '../src/shared/database/rls-readiness.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('evaluateRlsReadiness', () => {
  const expected = ['workspaces', 'channel_connections'];

  it('passes only forced context-bound policies under a non-bypass role', () => {
    expect(
      evaluateRlsReadiness(
        { role: 'shopmate_app', superuser: false, bypassRls: false },
        expected.map((table) => ({
          table,
          rlsEnabled: true,
          rlsForced: true,
          policyCount: 2,
          selectPolicyCount: 1,
          selectContextBound: true,
          insertPolicyCount: 1,
          insertContextBound: true,
          updatePolicyCount: 0,
          updateContextBound: true,
          deletePolicyCount: 0,
          deleteContextBound: true,
        })),
        expected,
      ),
    ).toEqual({ status: 'passed', failures: [] });
  });

  it('fails for privileged roles and missing or ineffective policies', () => {
    const result = evaluateRlsReadiness(
      { role: 'postgres', superuser: true, bypassRls: true },
      [
        {
          table: 'workspaces',
          rlsEnabled: true,
          rlsForced: false,
          policyCount: 1,
          selectPolicyCount: 1,
          selectContextBound: false,
          insertPolicyCount: 0,
          insertContextBound: false,
          updatePolicyCount: 0,
          updateContextBound: true,
          deletePolicyCount: 0,
          deleteContextBound: true,
        },
      ],
      expected,
    );

    expect(result.status).toBe('failed');
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'Database application role postgres is a superuser',
        'Database application role postgres has BYPASSRLS',
        'workspaces does not FORCE ROW LEVEL SECURITY',
        'workspaces SELECT policies are not bound to app.current_organization_id',
        'workspaces has no INSERT RLS policy',
        'channel_connections is missing',
      ]),
    );
  });

  it('fails a safe SELECT plus unsafe INSERT policy combination', () => {
    const result = evaluateRlsReadiness(
      { role: 'shopmate_app', superuser: false, bypassRls: false },
      [
        {
          table: 'workspaces',
          rlsEnabled: true,
          rlsForced: true,
          policyCount: 2,
          selectPolicyCount: 1,
          selectContextBound: true,
          insertPolicyCount: 1,
          insertContextBound: false,
          updatePolicyCount: 0,
          updateContextBound: true,
          deletePolicyCount: 0,
          deleteContextBound: true,
        },
      ],
      ['workspaces'],
    );

    expect(result).toEqual({
      status: 'failed',
      failures: [
        'workspaces INSERT policies are not bound to app.current_organization_id',
      ],
    });
  });

  it('rejects UPDATE or DELETE policies on declared immutable ledgers', () => {
    const result = evaluateRlsReadiness(
      { role: 'shopmate_app', superuser: false, bypassRls: false },
      [
        {
          table: 'supplier_image_search_evidence',
          rlsEnabled: true,
          rlsForced: true,
          policyCount: 3,
          selectPolicyCount: 1,
          selectContextBound: true,
          insertPolicyCount: 1,
          insertContextBound: true,
          updatePolicyCount: 1,
          updateContextBound: true,
          deletePolicyCount: 0,
          deleteContextBound: true,
        },
      ],
      ['supplier_image_search_evidence'],
      ['supplier_image_search_evidence'],
    );

    expect(result.failures).toContain(
      'supplier_image_search_evidence is immutable but exposes UPDATE or DELETE policies',
    );
  });

  it('requires immutable ledgers to deny mutation privileges and expose an enabled guard', () => {
    const result = evaluateRlsReadiness(
      { role: 'shopmate_app', superuser: false, bypassRls: false },
      [
        {
          table: 'candidate_economics_evidence',
          rlsEnabled: true,
          rlsForced: true,
          policyCount: 2,
          selectPolicyCount: 1,
          selectContextBound: true,
          insertPolicyCount: 1,
          insertContextBound: true,
          updatePolicyCount: 0,
          updateContextBound: true,
          deletePolicyCount: 0,
          deleteContextBound: true,
          appCanUpdate: true,
          appCanDelete: false,
          immutableMutationGuard: false,
          deleteGuard: true,
        },
      ],
      ['candidate_economics_evidence'],
      ['candidate_economics_evidence'],
    );

    expect(result.failures).toEqual(
      expect.arrayContaining([
        'candidate_economics_evidence application role can UPDATE immutable rows',
        'candidate_economics_evidence has no enabled BEFORE UPDATE OR DELETE immutable guard',
      ]),
    );
  });

  it('requires publish audit tables to deny DELETE and expose an enabled guard', () => {
    const result = evaluateRlsReadiness(
      { role: 'shopmate_app', superuser: false, bypassRls: false },
      [
        {
          table: 'listing_publish_snapshots',
          rlsEnabled: true,
          rlsForced: true,
          policyCount: 4,
          selectPolicyCount: 1,
          selectContextBound: true,
          insertPolicyCount: 1,
          insertContextBound: true,
          updatePolicyCount: 1,
          updateContextBound: true,
          deletePolicyCount: 1,
          deleteContextBound: true,
          appCanUpdate: true,
          appCanDelete: true,
          immutableMutationGuard: false,
          deleteGuard: false,
        },
      ],
      ['listing_publish_snapshots'],
      [],
      ['listing_publish_snapshots'],
    );

    expect(result.failures).toEqual(
      expect.arrayContaining([
        'listing_publish_snapshots is delete-protected but exposes a DELETE policy',
        'listing_publish_snapshots application role can DELETE protected rows',
        'listing_publish_snapshots has no enabled BEFORE DELETE guard',
      ]),
    );
  });

  it('keeps the login bootstrap policy exception narrowly user-bound', () => {
    const verifyRls = readFileSync(
      join(process.cwd(), 'src', 'cli', 'verify-rls.ts'),
      'utf8',
    );

    expect(verifyRls).toContain("table_name = 'memberships'");
    expect(verifyRls).toContain("polname = 'memberships_login_bootstrap'");
    expect(verifyRls).toContain(
      "POSITION('app.current_user_id' IN using_expr) > 0",
    );
  });

  it('keeps every direct organization-owned Prisma model behind forced RLS', () => {
    const prismaDir = join(process.cwd(), 'prisma');
    const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
    const migrationSql = readdirSync(join(prismaDir, 'migrations'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        join(prismaDir, 'migrations', entry.name, 'migration.sql'),
      )
      .map((path) => {
        try {
          return readFileSync(path, 'utf8');
        } catch {
          return '';
        }
      })
      .join('\n');

    const tenantTables = [
      ...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm),
    ]
      .filter((match) => /^\s*organizationId\s/m.test(match[2]))
      .map((match) => {
        const mapped = match[2].match(/@@map\("([^"]+)"\)/);
        return mapped?.[1] ?? match[1];
      });

    const missing = tenantTables.filter((table) => {
      const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const enabled = new RegExp(
        `ALTER TABLE\\s+"${escaped}"\\s+ENABLE ROW LEVEL SECURITY`,
        'i',
      ).test(migrationSql);
      const forced = new RegExp(
        `ALTER TABLE\\s+"${escaped}"\\s+FORCE ROW LEVEL SECURITY`,
        'i',
      ).test(migrationSql);
      const contextBound = new RegExp(
        `CREATE POLICY[\\s\\S]*?ON\\s+"${escaped}"[\\s\\S]*?app\\.current_organization_id`,
        'i',
      ).test(migrationSql);
      return !enabled || !forced || !contextBound;
    });

    expect(missing).toEqual([]);
  });

  it('keeps transitively organization-owned child tables behind forced RLS', () => {
    const prismaDir = join(process.cwd(), 'prisma');
    const migrationSql = readdirSync(join(prismaDir, 'migrations'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        join(prismaDir, 'migrations', entry.name, 'migration.sql'),
      )
      .map((path) => {
        try {
          return readFileSync(path, 'utf8');
        } catch {
          return '';
        }
      })
      .join('\n');

    const transitiveTenantTables = [
      {
        table: 'assistant_messages',
        parent: 'assistant_sessions',
        foreignKey: 'sessionId',
      },
      {
        table: 'automation_runs',
        parent: 'automation_flows',
        foreignKey: 'flowId',
      },
      {
        table: 'store_metric_snapshots',
        parent: 'workspaces',
        foreignKey: 'workspaceId',
      },
      {
        table: 'store_agent_profiles',
        parent: 'workspaces',
        foreignKey: 'workspaceId',
      },
    ];

    const missing = transitiveTenantTables.filter(
      ({ table, parent, foreignKey }) => {
        const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedParent = parent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedForeignKey = foreignKey.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&',
        );
        const enabled = new RegExp(
          `ALTER TABLE\\s+"${escapedTable}"\\s+ENABLE ROW LEVEL SECURITY`,
          'i',
        ).test(migrationSql);
        const forced = new RegExp(
          `ALTER TABLE\\s+"${escapedTable}"\\s+FORCE ROW LEVEL SECURITY`,
          'i',
        ).test(migrationSql);
        const contextBound = new RegExp(
          `CREATE POLICY[\\s\\S]*?ON\\s+"${escapedTable}"[\\s\\S]*?"${escapedParent}"[\\s\\S]*?"${escapedForeignKey}"[\\s\\S]*?app\\.current_organization_id`,
          'i',
        ).test(migrationSql);
        return !enabled || !forced || !contextBound;
      },
    );

    expect(missing.map(({ table }) => table)).toEqual([]);
  });
});
