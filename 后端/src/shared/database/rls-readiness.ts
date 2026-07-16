export interface DatabaseRoleEvidence {
  role: string;
  superuser: boolean;
  bypassRls: boolean;
}

export interface RlsTableEvidence {
  table: string;
  rlsEnabled: boolean;
  rlsForced: boolean;
  policyCount: number;
  selectPolicyCount: number;
  selectContextBound: boolean;
  insertPolicyCount: number;
  insertContextBound: boolean;
  updatePolicyCount: number;
  updateContextBound: boolean;
  deletePolicyCount: number;
  deleteContextBound: boolean;
}

export function evaluateRlsReadiness(
  role: DatabaseRoleEvidence,
  tables: RlsTableEvidence[],
  expectedTables: string[],
  immutableTables: string[] = [],
) {
  const failures: string[] = [];
  if (role.superuser) {
    failures.push(`Database application role ${role.role} is a superuser`);
  }
  if (role.bypassRls) {
    failures.push(`Database application role ${role.role} has BYPASSRLS`);
  }
  const byName = new Map(tables.map((table) => [table.table, table]));
  const immutable = new Set(immutableTables);
  for (const tableName of expectedTables) {
    const table = byName.get(tableName);
    if (!table) {
      failures.push(`${tableName} is missing`);
      continue;
    }
    if (!table.rlsEnabled) {
      failures.push(`${tableName} does not ENABLE ROW LEVEL SECURITY`);
    }
    if (!table.rlsForced) {
      failures.push(`${tableName} does not FORCE ROW LEVEL SECURITY`);
    }
    if (table.policyCount < 1) {
      failures.push(`${tableName} has no RLS policy`);
    }
    if (table.selectPolicyCount < 1) {
      failures.push(`${tableName} has no SELECT RLS policy`);
    } else if (!table.selectContextBound) {
      failures.push(
        `${tableName} SELECT policies are not bound to app.current_organization_id`,
      );
    }
    if (table.insertPolicyCount < 1) {
      failures.push(`${tableName} has no INSERT RLS policy`);
    } else if (!table.insertContextBound) {
      failures.push(
        `${tableName} INSERT policies are not bound to app.current_organization_id`,
      );
    }
    if (table.updatePolicyCount > 0 && !table.updateContextBound) {
      failures.push(
        `${tableName} UPDATE policies are not bound to app.current_organization_id`,
      );
    }
    if (table.deletePolicyCount > 0 && !table.deleteContextBound) {
      failures.push(
        `${tableName} DELETE policies are not bound to app.current_organization_id`,
      );
    }
    if (
      immutable.has(tableName) &&
      (table.updatePolicyCount > 0 || table.deletePolicyCount > 0)
    ) {
      failures.push(
        `${tableName} is immutable but exposes UPDATE or DELETE policies`,
      );
    }
  }
  return {
    status: failures.length === 0 ? ('passed' as const) : ('failed' as const),
    failures,
  };
}
