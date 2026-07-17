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
  appCanUpdate?: boolean;
  appCanDelete?: boolean;
  immutableMutationGuard?: boolean;
  deleteGuard?: boolean;
}

export function evaluateRlsReadiness(
  role: DatabaseRoleEvidence,
  tables: RlsTableEvidence[],
  expectedTables: string[],
  immutableTables: string[] = [],
  deleteProtectedTables: string[] = [],
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
  const deleteProtected = new Set(deleteProtectedTables);
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
    if (immutable.has(tableName) && table.appCanUpdate !== false) {
      failures.push(`${tableName} application role can UPDATE immutable rows`);
    }
    if (immutable.has(tableName) && table.appCanDelete !== false) {
      failures.push(`${tableName} application role can DELETE immutable rows`);
    }
    if (immutable.has(tableName) && table.immutableMutationGuard !== true) {
      failures.push(
        `${tableName} has no enabled BEFORE UPDATE OR DELETE immutable guard`,
      );
    }
    if (deleteProtected.has(tableName) && table.deletePolicyCount > 0) {
      failures.push(
        `${tableName} is delete-protected but exposes a DELETE policy`,
      );
    }
    if (deleteProtected.has(tableName) && table.appCanDelete !== false) {
      failures.push(`${tableName} application role can DELETE protected rows`);
    }
    if (deleteProtected.has(tableName) && table.deleteGuard !== true) {
      failures.push(`${tableName} has no enabled BEFORE DELETE guard`);
    }
  }
  return {
    status: failures.length === 0 ? ('passed' as const) : ('failed' as const),
    failures,
  };
}
