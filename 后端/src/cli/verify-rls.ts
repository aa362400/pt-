import { PrismaClient } from '@prisma/client';
import {
  evaluateRlsReadiness,
  type DatabaseRoleEvidence,
  type RlsTableEvidence,
} from '../shared/database/rls-readiness.js';

const EXPECTED_TABLES = [
  'dead_letter_jobs',
  'workspaces',
  'memberships',
  'channel_connections',
  'products',
  'file_assets',
  'knowledge_documents',
  'sops',
  'team_tasks',
  'prompt_templates',
  'assistant_sessions',
  'agent_runs',
  'outbox_events',
  'automation_flows',
  'organization_agent_controls',
  'marketplace_orders',
  'alerts',
  'trend_insights',
  'product_research_reports',
  'product_research_candidate_decisions',
  'mcp_tool_invocations',
  'agent_capability_tokens',
  'suppliers',
  'supply_skus',
  'replenishment_plans',
  'keyword_reports',
  'listing_drafts',
  'listing_generation_requests',
  'profit_calculations',
  'image_prompt_projects',
  'notifications',
  'audit_logs',
  'audit_chain_heads',
  'audit_archives',
  'review_tasks',
  'product_launches',
  'agent_work_memories',
  'agent_experience_cards',
  'agent_autonomy_daily_metrics',
  'enterprise_slo_daily_snapshots',
  'invoices',
  'product_research_runs',
  'product_research_stage_runs',
  'product_candidates',
  'product_signals',
  'product_risk_records',
  'product_scores',
  'scoring_versions',
  'product_research_source_health',
  'product_feedback',
  'research_report_artifacts',
  'supplier_quote_evidence',
  'supplier_image_search_evidence',
  'candidate_economics_evidence',
  'candidate_economics_evaluations',
  'candidate_economics_evaluation_inputs',
  'listing_publish_snapshots',
  'external_submissions',
] as const;

const IMMUTABLE_TABLES = [
  'supplier_quote_evidence',
  'supplier_image_search_evidence',
  'candidate_economics_evidence',
  'candidate_economics_evaluations',
  'candidate_economics_evaluation_inputs',
] as const;

const DELETE_PROTECTED_TABLES = [
  'listing_publish_snapshots',
  'external_submissions',
] as const;

interface RoleRow {
  role: string;
  superuser: boolean;
  bypass_rls: boolean;
}

interface TableRow {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  policy_count: bigint;
  select_policy_count: bigint;
  select_context_bound: boolean;
  insert_policy_count: bigint;
  insert_context_bound: boolean;
  update_policy_count: bigint;
  update_context_bound: boolean;
  delete_policy_count: bigint;
  delete_context_bound: boolean;
  app_can_update: boolean;
  app_can_delete: boolean;
  immutable_mutation_guard: boolean;
  delete_guard: boolean;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const roles = await prisma.$queryRawUnsafe<RoleRow[]>(`
      SELECT current_user AS role,
             rol.rolsuper AS superuser,
             rol.rolbypassrls AS bypass_rls
        FROM pg_roles rol
       WHERE rol.rolname = current_user
    `);
    const tableNames = EXPECTED_TABLES.map((name) => `'${name}'`).join(',');
    const rows = await prisma.$queryRawUnsafe<TableRow[]>(`
      WITH policy_facts AS (
        SELECT cls.relname AS table_name,
               cls.relrowsecurity AS rls_enabled,
               cls.relforcerowsecurity AS rls_forced,
               has_table_privilege(current_user, cls.oid, 'UPDATE') AS app_can_update,
               has_table_privilege(current_user, cls.oid, 'DELETE') AS app_can_delete,
               EXISTS (
                 SELECT 1
                 FROM pg_trigger mutation_guard
                 WHERE mutation_guard.tgrelid = cls.oid
                   AND NOT mutation_guard.tgisinternal
                   AND mutation_guard.tgenabled <> 'D'
                   AND mutation_guard.tgname LIKE '%immutable_guard'
                   AND (mutation_guard.tgtype::integer & 2) = 2
                   AND (mutation_guard.tgtype::integer & 8) = 8
                   AND (mutation_guard.tgtype::integer & 16) = 16
               ) AS immutable_mutation_guard,
               EXISTS (
                 SELECT 1
                 FROM pg_trigger delete_guard
                 WHERE delete_guard.tgrelid = cls.oid
                   AND NOT delete_guard.tgisinternal
                   AND delete_guard.tgenabled <> 'D'
                   AND delete_guard.tgname LIKE '%delete_guard'
                   AND (delete_guard.tgtype::integer & 2) = 2
                   AND (delete_guard.tgtype::integer & 8) = 8
               ) AS delete_guard,
               pol.polname,
               pol.polcmd,
               COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') AS using_expr,
               COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS check_expr
          FROM pg_class cls
          JOIN pg_namespace ns ON ns.oid = cls.relnamespace
          LEFT JOIN pg_policy pol ON pol.polrelid = cls.oid
         WHERE ns.nspname = current_schema()
           AND cls.relkind = 'r'
           AND cls.relname IN (${tableNames})
      )
      SELECT table_name,
             rls_enabled,
             rls_forced,
             app_can_update,
             app_can_delete,
             immutable_mutation_guard,
             delete_guard,
             COUNT(polname) AS policy_count,
             COUNT(polname) FILTER (WHERE polcmd IN ('r', '*')) AS select_policy_count,
             COALESCE(
               BOOL_AND(
                 POSITION('app.current_organization_id' IN using_expr) > 0
                 OR (
                   table_name = 'memberships'
                   AND polname = 'memberships_login_bootstrap'
                   AND POSITION('app.current_user_id' IN using_expr) > 0
                 )
               )
                 FILTER (WHERE polcmd IN ('r', '*')),
               FALSE
             ) AS select_context_bound,
             COUNT(polname) FILTER (WHERE polcmd IN ('a', '*')) AS insert_policy_count,
             COALESCE(
               BOOL_AND(
                 POSITION(
                   'app.current_organization_id' IN
                   CASE
                     WHEN check_expr <> '' THEN check_expr
                     WHEN polcmd = '*' THEN using_expr
                     ELSE ''
                   END
                 ) > 0
               ) FILTER (WHERE polcmd IN ('a', '*')),
               FALSE
             ) AS insert_context_bound,
             COUNT(polname) FILTER (WHERE polcmd IN ('w', '*')) AS update_policy_count,
             COALESCE(
               BOOL_AND(
                 POSITION('app.current_organization_id' IN using_expr) > 0
                 AND POSITION(
                   'app.current_organization_id' IN
                   CASE WHEN check_expr <> '' THEN check_expr ELSE using_expr END
                 ) > 0
               ) FILTER (WHERE polcmd IN ('w', '*')),
               TRUE
             ) AS update_context_bound,
             COUNT(polname) FILTER (WHERE polcmd IN ('d', '*')) AS delete_policy_count,
             COALESCE(
               BOOL_AND(POSITION('app.current_organization_id' IN using_expr) > 0)
                 FILTER (WHERE polcmd IN ('d', '*')),
               TRUE
             ) AS delete_context_bound
        FROM policy_facts
       GROUP BY table_name, rls_enabled, rls_forced,
                app_can_update, app_can_delete,
                immutable_mutation_guard, delete_guard
       ORDER BY table_name
    `);
    const role: DatabaseRoleEvidence = {
      role: roles[0]?.role ?? 'unknown',
      superuser: roles[0]?.superuser ?? true,
      bypassRls: roles[0]?.bypass_rls ?? true,
    };
    const tables: RlsTableEvidence[] = rows.map((row) => ({
      table: row.table_name,
      rlsEnabled: row.rls_enabled,
      rlsForced: row.rls_forced,
      policyCount: Number(row.policy_count),
      selectPolicyCount: Number(row.select_policy_count),
      selectContextBound: row.select_context_bound,
      insertPolicyCount: Number(row.insert_policy_count),
      insertContextBound: row.insert_context_bound,
      updatePolicyCount: Number(row.update_policy_count),
      updateContextBound: row.update_context_bound,
      deletePolicyCount: Number(row.delete_policy_count),
      deleteContextBound: row.delete_context_bound,
      appCanUpdate: row.app_can_update,
      appCanDelete: row.app_can_delete,
      immutableMutationGuard: row.immutable_mutation_guard,
      deleteGuard: row.delete_guard,
    }));
    const result = evaluateRlsReadiness(
      role,
      tables,
      [...EXPECTED_TABLES],
      [...IMMUTABLE_TABLES],
      [...DELETE_PROTECTED_TABLES],
    );
    process.stdout.write(
      `${JSON.stringify({ ...result, role, tables }, null, 2)}\n`,
    );
    if (result.status !== 'passed') process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
