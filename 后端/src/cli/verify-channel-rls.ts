import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCEPTANCE_ROLE = 'shopmate_rls_acceptance';

function adminDatabaseUrl(): string | undefined {
  const source = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  const line = source
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith('DATABASE_ADMIN_URL='));
  return line?.slice('DATABASE_ADMIN_URL='.length).trim();
}

interface ChannelEvidence {
  id: string;
  organization_id: string;
  workspace_id?: string;
}

type MarketplaceOrderEvidence = ChannelEvidence;

async function cleanupRole(prisma: PrismaClient) {
  const existing = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ACCEPTANCE_ROLE}') AS exists`,
  );
  if (!existing[0]?.exists) return;
  await prisma.$executeRawUnsafe(`DROP OWNED BY ${ACCEPTANCE_ROLE}`);
  await prisma.$executeRawUnsafe(`DROP ROLE ${ACCEPTANCE_ROLE}`);
}

async function main() {
  const adminUrl = adminDatabaseUrl();
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is required');
  const prisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    await cleanupRole(prisma);
    await prisma.$executeRawUnsafe(
      `CREATE ROLE ${ACCEPTANCE_ROLE} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
    );
    await prisma.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${ACCEPTANCE_ROLE}`,
    );
    await prisma.$executeRawUnsafe(
      `GRANT SELECT ON "workspaces", "memberships", "products", "channel_connections", "marketplace_orders", "audit_archives", "agent_capability_tokens", "mcp_tool_invocations", "knowledge_documents", "profit_calculations", "enterprise_slo_daily_snapshots", "agent_work_memories", "agent_experience_cards", "agent_autonomy_daily_metrics", "trend_insights", "keyword_reports", "alerts", "outbox_events", "agent_runs", "dead_letter_jobs", "product_launches", "product_research_candidate_decisions", "product_research_reports", "review_tasks", "suppliers", "supply_skus", "replenishment_plans", "file_assets", "sops", "prompt_templates", "assistant_sessions", "invoices", "audit_logs", "audit_chain_heads", "team_tasks", "automation_flows", "notifications", "listing_drafts", "image_prompt_projects" TO ${ACCEPTANCE_ROLE}`,
    );

    const source = await prisma.$queryRawUnsafe<ChannelEvidence[]>(`
      SELECT channels.id,
             workspaces."organizationId" AS organization_id,
             channels."workspaceId" AS workspace_id
        FROM "channel_connections" channels
        JOIN "workspaces" workspaces
          ON workspaces.id = channels."workspaceId"
       ORDER BY channels.id
       LIMIT 1
    `);
    if (!source[0]) {
      throw new Error(
        'RLS acceptance requires at least one channel connection',
      );
    }
    const orderSource = await prisma.$queryRawUnsafe<
      MarketplaceOrderEvidence[]
    >(`
      SELECT id, "organizationId" AS organization_id
        FROM "marketplace_orders"
       ORDER BY id
       LIMIT 1
    `);
    if (!orderSource[0]) {
      throw new Error('RLS acceptance requires at least one marketplace order');
    }
    const actors = await prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
      `SELECT "userId" AS user_id
         FROM "memberships"
        WHERE "organizationId" = $1
        ORDER BY id
        LIMIT 1`,
      source[0].organization_id,
    );
    if (!actors[0]) {
      throw new Error('RLS acceptance requires an organization member');
    }

    const evidence = await prisma.$transaction(async (tx) => {
      const temporaryArchiveId = `rls-acceptance-${Date.now()}`;
      const temporaryObjectKey = `rls-acceptance/${temporaryArchiveId}.json`;
      const temporaryCapabilityId = `rls-capability-${Date.now()}`;
      const temporaryMcpInvocationId = `rls-mcp-${Date.now()}`;
      const temporaryKnowledgeDocumentId = `rls-knowledge-${Date.now()}`;
      const temporaryProfitCalculationId = `rls-profit-${Date.now()}`;
      const temporarySloSnapshotId = `rls-slo-${Date.now()}`;
      const temporaryWorkMemoryId = `rls-memory-${Date.now()}`;
      const temporaryExperienceCardId = `rls-experience-${Date.now()}`;
      const temporaryAutonomyMetricId = `rls-autonomy-${Date.now()}`;
      const temporaryTrendInsightId = `rls-trend-${Date.now()}`;
      const temporaryKeywordReportId = `rls-keyword-${Date.now()}`;
      const temporaryAlertId = `rls-alert-${Date.now()}`;
      const temporaryOutboxId = `rls-outbox-${Date.now()}`;
      const temporaryAgentRunId = `rls-agent-run-${Date.now()}`;
      const temporaryDeadLetterId = `rls-dead-letter-${Date.now()}`;
      const temporaryLaunchReviewId = `rls-launch-review-${Date.now()}`;
      const temporaryProductLaunchId = `rls-product-launch-${Date.now()}`;
      const temporaryDecisionReportId = `rls-decision-report-${Date.now()}`;
      const temporaryCandidateDecisionId = `rls-decision-${Date.now()}`;
      const temporarySupplierId = `rls-supplier-${Date.now()}`;
      const temporarySupplySkuId = `rls-supply-sku-${Date.now()}`;
      const temporaryReplenishmentId = `rls-replenishment-${Date.now()}`;
      const temporaryFileAssetId = `rls-file-${Date.now()}`;
      const temporarySopId = `rls-sop-${Date.now()}`;
      const temporaryPromptId = `rls-prompt-${Date.now()}`;
      const temporaryAssistantSessionId = `rls-session-${Date.now()}`;
      const temporaryInvoiceId = `rls-invoice-${Date.now()}`;
      const temporaryTeamTaskId = `rls-task-${Date.now()}`;
      const temporaryAutomationFlowId = `rls-automation-${Date.now()}`;
      const temporaryNotificationId = `rls-notification-${Date.now()}`;
      const temporaryListingDraftId = `rls-listing-${Date.now()}`;
      const temporaryImageProjectId = `rls-image-${Date.now()}`;
      const temporaryProductId = `rls-product-${Date.now()}`;
      if (!source[0].workspace_id) {
        throw new Error('RLS acceptance requires a source workspace');
      }
      await tx.$executeRawUnsafe(
        `INSERT INTO "audit_archives" (
          id, "organizationId", date, "objectKey", "contentHash",
          "entryCount", "firstSequence", "lastSequence",
          "firstPreviousHash", "finalHash", "versionId",
          "objectLockMode", "retainUntil", "verifiedAt", "createdAt"
        ) VALUES (
          $1, $2, '1900-01-01T00:00:00.000Z', $3, $4,
          1, 1, 1, $4, $4, 'rls-acceptance-version',
          'COMPLIANCE', '2999-01-01T00:00:00.000Z', NOW(), NOW()
        )`,
        temporaryArchiveId,
        source[0].organization_id,
        temporaryObjectKey,
        '0'.repeat(64),
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "agent_capability_tokens" (
          id, "organizationId", "actorId", "tokenHash", actions,
          "expiresAt", "createdAt"
        ) VALUES ($1, $2, $3, $4, ARRAY['rls.acceptance'], NOW() + INTERVAL '1 hour', NOW())`,
        temporaryCapabilityId,
        source[0].organization_id,
        actors[0].user_id,
        'a'.repeat(64),
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "mcp_tool_invocations" (
          id, "organizationId", "actorId", action, "toolName", input,
          status, "createdAt", "startedAt"
        ) VALUES ($1, $2, $3, 'rls.acceptance', 'rls_acceptance', '{}'::jsonb,
          'RUNNING', NOW(), NOW())`,
        temporaryMcpInvocationId,
        source[0].organization_id,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "knowledge_documents" (
          id, "organizationId", title, content, tags, visibility,
          "createdBy", "createdAt"
        ) VALUES ($1, $2, 'RLS acceptance', 'temporary evidence', ARRAY[]::text[],
          'ORGANIZATION', $3, NOW())`,
        temporaryKnowledgeDocumentId,
        source[0].organization_id,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "profit_calculations" (
          id, "organizationId", currency, "salePrice", "productCost",
          "totalCost", "estimatedProfit", "profitMargin", roi, scenarios,
          "createdBy", "createdAt"
        ) VALUES ($1, $2, 'CNY', 100, 40, 40, 60, 60, 150, '[]'::jsonb, $3, NOW())`,
        temporaryProfitCalculationId,
        source[0].organization_id,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "enterprise_slo_daily_snapshots" (
          id, "organizationId", date, evidence, "createdAt", "updatedAt"
        ) VALUES ($1, $2, '1800-01-01T00:00:00.000Z', '{}'::jsonb, NOW(), NOW())`,
        temporarySloSnapshotId,
        source[0].organization_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "agent_work_memories" (
          id, "organizationId", "taskType", status, metadata, "createdAt"
        ) VALUES ($1, $2, 'RLS_ACCEPTANCE', 'COMPLETED', '{}'::jsonb, NOW())`,
        temporaryWorkMemoryId,
        source[0].organization_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "agent_experience_cards" (
          id, "organizationId", category, title, lesson, evidence, "createdAt"
        ) VALUES ($1, $2, 'acceptance', 'RLS acceptance', 'temporary evidence',
          '{}'::jsonb, NOW())`,
        temporaryExperienceCardId,
        source[0].organization_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "agent_autonomy_daily_metrics" (
          id, "organizationId", date, "taskSuccessRate", "suggestionAdoptionRate",
          "autonomousCompletionRate", "memoryQueryAccuracy", "createdAt", "updatedAt"
        ) VALUES ($1, $2, '1800-01-01T00:00:00.000Z', 100, 100, 100, 100, NOW(), NOW())`,
        temporaryAutonomyMetricId,
        source[0].organization_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "trend_insights" (
          id, "organizationId", keyword, source, data, "observedAt"
        ) VALUES ($1, $2, 'rls acceptance', 'acceptance', '{}'::jsonb, NOW())`,
        temporaryTrendInsightId,
        source[0].organization_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "keyword_reports" (
          id, "organizationId", query, platforms, keywords, charts,
          "createdBy", "createdAt"
        ) VALUES ($1, $2, 'rls acceptance', ARRAY['ozon'], '[]'::jsonb,
          '{}'::jsonb, $3, NOW())`,
        temporaryKeywordReportId,
        source[0].organization_id,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "alerts" (
          id, "organizationId", type, severity, title, status, "createdAt"
        ) VALUES ($1, $2, 'INVENTORY', 'WARNING', 'RLS acceptance', 'OPEN', NOW())`,
        temporaryAlertId,
        source[0].organization_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "outbox_events" (
          id, "dedupeKey", "organizationId", "aggregateType", "aggregateId",
          "eventType", payload, status, "createdAt", "updatedAt"
        ) VALUES ($1, $1, $2, 'RLSAcceptance', $1, 'rls.acceptance',
          '{}'::jsonb, 'PENDING', NOW(), NOW())`,
        temporaryOutboxId,
        source[0].organization_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "agent_runs" (
          id, "organizationId", "userId", "agentType", status, input,
          "createdAt"
        ) VALUES ($1, $2, $3, 'IMAGE_CREATIVE', 'PENDING', '{}'::jsonb, NOW())`,
        temporaryAgentRunId,
        source[0].organization_id,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "dead_letter_jobs" (
          id, "organizationId", "queueName", "jobId", data, "failedReason",
          "failedAt", "createdAt"
        ) VALUES ($1, $2, 'agent-runs', $1, '{}'::jsonb,
          'RLS acceptance', NOW(), NOW())`,
        temporaryDeadLetterId,
        source[0].organization_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "review_tasks" (
          id, "organizationId", "entityType", "entityId", status,
          "approvalScope", "decisionEvidence", "createdAt"
        ) VALUES ($1, $2, 'PRODUCT_RESEARCH', $1, 'PENDING', '{}'::jsonb,
          '{}'::jsonb, NOW())`,
        temporaryLaunchReviewId,
        source[0].organization_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "product_launches" (
          id, "organizationId", "reviewTaskId", "reportId", "candidateId",
          "candidateIndex", status, "requestedBy", execution, "createdAt",
          "updatedAt"
        ) VALUES ($1, $2, $3, $3, $1, 0, 'QUEUED', $4, '{}'::jsonb,
          NOW(), NOW())`,
        temporaryProductLaunchId,
        source[0].organization_id,
        temporaryLaunchReviewId,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "product_research_reports" (
          id, "organizationId", query, platform, filters, status, "createdBy",
          "createdAt"
        ) VALUES ($1, $2, 'RLS acceptance', 'OZON', '{}'::jsonb, 'COMPLETED',
          $3, NOW())`,
        temporaryDecisionReportId,
        source[0].organization_id,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "product_research_candidate_decisions" (
          id, "organizationId", "reportId", "candidateIndex", status,
          "actorId", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, 0, 'REJECTED', $4, NOW(), NOW())`,
        temporaryCandidateDecisionId,
        source[0].organization_id,
        temporaryDecisionReportId,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "suppliers" (
          id, "organizationId", "workspaceId", name, currency, contact,
          status, "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, 'RLS acceptance supplier', 'CNY', '{}'::jsonb,
          'ACTIVE', NOW(), NOW())`,
        temporarySupplierId,
        source[0].organization_id,
        source[0].workspace_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "supply_skus" (
          id, "organizationId", "workspaceId", "supplierId", sku,
          "productName", "unitCost", currency, moq, "leadTimeDays",
          "safetyStock", "currentStock", "dailySalesAvg", status,
          "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $1, 'RLS acceptance SKU', 1, 'CNY', 1,
          1, 0, 0, 0, 'ACTIVE', NOW(), NOW())`,
        temporarySupplySkuId,
        source[0].organization_id,
        source[0].workspace_id,
        temporarySupplierId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "replenishment_plans" (
          id, "organizationId", "workspaceId", "supplySkuId",
          "recommendedQty", "requestedQty", "reorderPoint", status,
          "inputSnapshot", rationale, "createdBy", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, 1, 1, 1, 'DRAFT', '{}'::jsonb,
          '{}'::jsonb, $5, NOW(), NOW())`,
        temporaryReplenishmentId,
        source[0].organization_id,
        source[0].workspace_id,
        temporarySupplySkuId,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "file_assets" (
          id, "organizationId", "workspaceId", "ownerId", filename,
          "mimeType", size, "storageKey", sha256, purpose, "createdAt"
        ) VALUES ($1, $2, $3, $4, 'rls-acceptance.png', 'image/png', 1,
          $1, $5, 'PRODUCT_IMAGE', NOW())`,
        temporaryFileAssetId,
        source[0].organization_id,
        source[0].workspace_id,
        actors[0].user_id,
        'f'.repeat(64),
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "sops" (
          id, "organizationId", title, status, steps, "createdBy", "createdAt"
        ) VALUES ($1, $2, 'RLS acceptance SOP', 'DRAFT', '[]'::jsonb, $3, NOW())`,
        temporarySopId,
        source[0].organization_id,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "prompt_templates" (
          id, "organizationId", title, category, content, variables,
          "usageCount", "createdBy", "createdAt"
        ) VALUES ($1, $2, 'RLS acceptance prompt', 'acceptance',
          'temporary evidence', '[]'::jsonb, 0, $3, NOW())`,
        temporaryPromptId,
        source[0].organization_id,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "assistant_sessions" (
          id, "organizationId", "workspaceId", "userId", title,
          "contextType", status, "createdAt"
        ) VALUES ($1, $2, $3, $4, 'RLS acceptance session', 'GENERAL',
          'ACTIVE', NOW())`,
        temporaryAssistantSessionId,
        source[0].organization_id,
        source[0].workspace_id,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "invoices" (
          id, "organizationId", amount, currency, status, plan,
          "periodStart", "periodEnd", "createdAt"
        ) VALUES ($1, $2, 1, 'CNY', 'PAID', 'ENTERPRISE', NOW(),
          NOW() + INTERVAL '1 month', NOW())`,
        temporaryInvoiceId,
        source[0].organization_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "team_tasks" (
          id, "organizationId", "workspaceId", title, priority, status,
          "createdBy", "createdAt"
        ) VALUES ($1, $2, $3, 'RLS acceptance task', 'MEDIUM', 'TODO', $4, NOW())`,
        temporaryTeamTaskId,
        source[0].organization_id,
        source[0].workspace_id,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "automation_flows" (
          id, "organizationId", "workspaceId", name, status, "triggerType",
          "triggerConfig", steps, "successRate", "createdBy", "createdAt"
        ) VALUES ($1, $2, $3, 'RLS acceptance automation', 'DRAFT', 'MANUAL',
          '{}'::jsonb, '[]'::jsonb, 0, $4, NOW())`,
        temporaryAutomationFlowId,
        source[0].organization_id,
        source[0].workspace_id,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "notifications" (
          id, "organizationId", "userId", type, title, metadata, "createdAt"
        ) VALUES ($1, $2, $3, 'SYSTEM', 'RLS acceptance notification',
          '{}'::jsonb, NOW())`,
        temporaryNotificationId,
        source[0].organization_id,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "listing_drafts" (
          id, "organizationId", "workspaceId", platform, "createdBy", "createdAt"
        ) VALUES ($1, $2, $3, 'ozon', $4, NOW())`,
        temporaryListingDraftId,
        source[0].organization_id,
        source[0].workspace_id,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "image_prompt_projects" (
          id, "organizationId", "workspaceId", title, "createdBy", "createdAt"
        ) VALUES ($1, $2, $3, 'RLS acceptance image project', $4, NOW())`,
        temporaryImageProjectId,
        source[0].organization_id,
        source[0].workspace_id,
        actors[0].user_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "products" (
          id, "workspaceId", title, images, metadata, "createdAt"
        ) VALUES ($1, $2, 'RLS acceptance product', ARRAY[]::text[], '{}'::jsonb, NOW())`,
        temporaryProductId,
        source[0].workspace_id,
      );
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${ACCEPTANCE_ROLE}`);
      await tx.$executeRawUnsafe(
        "SELECT set_config('app.current_organization_id', $1, true)",
        source[0].organization_id,
      );
      const visible = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT channels.id,
               workspaces."organizationId" AS organization_id
          FROM "channel_connections" channels
          JOIN "workspaces" workspaces
            ON workspaces.id = channels."workspaceId"
         ORDER BY channels.id
      `);
      if (
        visible.some((row) => row.organization_id !== source[0].organization_id)
      ) {
        throw new Error('RLS exposed a channel from another organization');
      }
      await tx.$executeRawUnsafe(
        "SELECT set_config('app.current_organization_id', $1, true)",
        orderSource[0].organization_id,
      );
      const visibleOrders = await tx.$queryRawUnsafe<
        MarketplaceOrderEvidence[]
      >(`
          SELECT id, "organizationId" AS organization_id
            FROM "marketplace_orders"
           ORDER BY id
        `);
      if (
        visibleOrders.some(
          (row) => row.organization_id !== orderSource[0].organization_id,
        )
      ) {
        throw new Error('RLS exposed an order from another organization');
      }
      await tx.$executeRawUnsafe(
        "SELECT set_config('app.current_organization_id', $1, true)",
        source[0].organization_id,
      );
      const visibleArchives = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id
          FROM "audit_archives"
         ORDER BY id
      `);
      if (
        !visibleArchives.some((row) => row.id === temporaryArchiveId) ||
        visibleArchives.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS audit archive tenant visibility is invalid');
      }
      const visibleCapabilities = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id
          FROM "agent_capability_tokens"
         ORDER BY id
      `);
      if (
        !visibleCapabilities.some((row) => row.id === temporaryCapabilityId) ||
        visibleCapabilities.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS capability token tenant visibility is invalid');
      }
      const visibleMcpInvocations = await tx.$queryRawUnsafe<
        ChannelEvidence[]
      >(`
        SELECT id, "organizationId" AS organization_id
          FROM "mcp_tool_invocations"
         ORDER BY id
      `);
      if (
        !visibleMcpInvocations.some(
          (row) => row.id === temporaryMcpInvocationId,
        ) ||
        visibleMcpInvocations.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS MCP invocation tenant visibility is invalid');
      }
      const visibleKnowledgeDocuments = await tx.$queryRawUnsafe<
        ChannelEvidence[]
      >(`
          SELECT id, "organizationId" AS organization_id
            FROM "knowledge_documents"
           ORDER BY id
        `);
      if (
        !visibleKnowledgeDocuments.some(
          (row) => row.id === temporaryKnowledgeDocumentId,
        ) ||
        visibleKnowledgeDocuments.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS knowledge document tenant visibility is invalid');
      }
      const visibleProfitCalculations = await tx.$queryRawUnsafe<
        ChannelEvidence[]
      >(`
          SELECT id, "organizationId" AS organization_id
            FROM "profit_calculations"
           ORDER BY id
        `);
      if (
        !visibleProfitCalculations.some(
          (row) => row.id === temporaryProfitCalculationId,
        ) ||
        visibleProfitCalculations.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS profit calculation tenant visibility is invalid');
      }
      const visibleSloSnapshots = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id
          FROM "enterprise_slo_daily_snapshots"
         ORDER BY id
      `);
      if (
        !visibleSloSnapshots.some((row) => row.id === temporarySloSnapshotId) ||
        visibleSloSnapshots.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS SLO snapshot tenant visibility is invalid');
      }
      const visibleWorkMemories = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id
          FROM "agent_work_memories"
         ORDER BY id
      `);
      if (
        !visibleWorkMemories.some((row) => row.id === temporaryWorkMemoryId) ||
        visibleWorkMemories.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS work memory tenant visibility is invalid');
      }
      const visibleExperienceCards = await tx.$queryRawUnsafe<
        ChannelEvidence[]
      >(`
          SELECT id, "organizationId" AS organization_id
            FROM "agent_experience_cards"
           ORDER BY id
        `);
      if (
        !visibleExperienceCards.some(
          (row) => row.id === temporaryExperienceCardId,
        ) ||
        visibleExperienceCards.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS experience card tenant visibility is invalid');
      }
      const visibleAutonomyMetrics = await tx.$queryRawUnsafe<
        ChannelEvidence[]
      >(`
          SELECT id, "organizationId" AS organization_id
            FROM "agent_autonomy_daily_metrics"
           ORDER BY id
        `);
      if (
        !visibleAutonomyMetrics.some(
          (row) => row.id === temporaryAutonomyMetricId,
        ) ||
        visibleAutonomyMetrics.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS autonomy metric tenant visibility is invalid');
      }
      const visibleTrendInsights = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id
          FROM "trend_insights"
         ORDER BY id
      `);
      if (
        !visibleTrendInsights.some(
          (row) => row.id === temporaryTrendInsightId,
        ) ||
        visibleTrendInsights.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS trend insight tenant visibility is invalid');
      }
      const visibleKeywordReports = await tx.$queryRawUnsafe<
        ChannelEvidence[]
      >(`
        SELECT id, "organizationId" AS organization_id
          FROM "keyword_reports"
         ORDER BY id
      `);
      if (
        !visibleKeywordReports.some(
          (row) => row.id === temporaryKeywordReportId,
        ) ||
        visibleKeywordReports.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS keyword report tenant visibility is invalid');
      }
      const visibleAlerts = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id
          FROM "alerts"
         ORDER BY id
      `);
      if (
        !visibleAlerts.some((row) => row.id === temporaryAlertId) ||
        visibleAlerts.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS alert tenant visibility is invalid');
      }
      const visibleOutboxEvents = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id
          FROM "outbox_events"
         ORDER BY id
      `);
      if (
        !visibleOutboxEvents.some((row) => row.id === temporaryOutboxId) ||
        visibleOutboxEvents.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS outbox event tenant visibility is invalid');
      }
      const visibleAgentRuns = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id
          FROM "agent_runs"
         ORDER BY id
      `);
      if (
        !visibleAgentRuns.some((row) => row.id === temporaryAgentRunId) ||
        visibleAgentRuns.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS agent run tenant visibility is invalid');
      }
      const visibleDeadLetters = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id
          FROM "dead_letter_jobs"
         ORDER BY id
      `);
      if (
        !visibleDeadLetters.some((row) => row.id === temporaryDeadLetterId) ||
        visibleDeadLetters.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS dead letter tenant visibility is invalid');
      }
      const visibleProductLaunches = await tx.$queryRawUnsafe<
        ChannelEvidence[]
      >(`
        SELECT id, "organizationId" AS organization_id
          FROM "product_launches"
         ORDER BY id
      `);
      if (
        !visibleProductLaunches.some(
          (row) => row.id === temporaryProductLaunchId,
        ) ||
        visibleProductLaunches.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS product launch tenant visibility is invalid');
      }
      const visibleReviewTasks = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id
          FROM "review_tasks" ORDER BY id
      `);
      if (
        !visibleReviewTasks.some((row) => row.id === temporaryLaunchReviewId) ||
        visibleReviewTasks.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS review task tenant visibility is invalid');
      }
      const visibleCandidateDecisions = await tx.$queryRawUnsafe<
        ChannelEvidence[]
      >(`
          SELECT id, "organizationId" AS organization_id
            FROM "product_research_candidate_decisions"
           ORDER BY id
        `);
      if (
        !visibleCandidateDecisions.some(
          (row) => row.id === temporaryCandidateDecisionId,
        ) ||
        visibleCandidateDecisions.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS candidate decision tenant visibility is invalid');
      }
      const visibleResearchReports = await tx.$queryRawUnsafe<
        ChannelEvidence[]
      >(`
        SELECT id, "organizationId" AS organization_id
          FROM "product_research_reports" ORDER BY id
      `);
      if (
        !visibleResearchReports.some(
          (row) => row.id === temporaryDecisionReportId,
        ) ||
        visibleResearchReports.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS product research report visibility is invalid');
      }
      const visibleSuppliers = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id FROM "suppliers" ORDER BY id
      `);
      const visibleSupplySkus = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id FROM "supply_skus" ORDER BY id
      `);
      const visibleReplenishmentPlans = await tx.$queryRawUnsafe<
        ChannelEvidence[]
      >(`
        SELECT id, "organizationId" AS organization_id FROM "replenishment_plans" ORDER BY id
      `);
      if (
        !visibleSuppliers.some((row) => row.id === temporarySupplierId) ||
        visibleSuppliers.some(
          (row) => row.organization_id !== source[0].organization_id,
        ) ||
        !visibleSupplySkus.some((row) => row.id === temporarySupplySkuId) ||
        visibleSupplySkus.some(
          (row) => row.organization_id !== source[0].organization_id,
        ) ||
        !visibleReplenishmentPlans.some(
          (row) => row.id === temporaryReplenishmentId,
        ) ||
        visibleReplenishmentPlans.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS supply chain tenant visibility is invalid');
      }
      const visibleFileAssets = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id FROM "file_assets" ORDER BY id
      `);
      if (
        !visibleFileAssets.some((row) => row.id === temporaryFileAssetId) ||
        visibleFileAssets.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS file asset tenant visibility is invalid');
      }
      const visibleSops = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id FROM "sops" ORDER BY id
      `);
      const visiblePrompts = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id FROM "prompt_templates" ORDER BY id
      `);
      if (
        !visibleSops.some((row) => row.id === temporarySopId) ||
        visibleSops.some(
          (row) => row.organization_id !== source[0].organization_id,
        ) ||
        !visiblePrompts.some((row) => row.id === temporaryPromptId) ||
        visiblePrompts.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS SOP or prompt tenant visibility is invalid');
      }
      const visibleAssistantSessions = await tx.$queryRawUnsafe<
        ChannelEvidence[]
      >(`
        SELECT id, "organizationId" AS organization_id FROM "assistant_sessions" ORDER BY id
      `);
      if (
        !visibleAssistantSessions.some(
          (row) => row.id === temporaryAssistantSessionId,
        ) ||
        visibleAssistantSessions.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS assistant session tenant visibility is invalid');
      }
      const visibleInvoices = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id FROM "invoices" ORDER BY id
      `);
      if (
        !visibleInvoices.some((row) => row.id === temporaryInvoiceId) ||
        visibleInvoices.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS invoice tenant visibility is invalid');
      }
      const visibleAuditLogs = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id FROM "audit_logs" ORDER BY id
      `);
      const visibleAuditHeads = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT "organizationId" AS id, "organizationId" AS organization_id
          FROM "audit_chain_heads" ORDER BY "organizationId"
      `);
      if (
        visibleAuditLogs.length === 0 ||
        visibleAuditHeads.length !== 1 ||
        visibleAuditLogs.some(
          (row) => row.organization_id !== source[0].organization_id,
        ) ||
        visibleAuditHeads.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS audit chain tenant visibility is invalid');
      }
      const visibleTeamTasks = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id FROM "team_tasks" ORDER BY id
      `);
      if (
        !visibleTeamTasks.some((row) => row.id === temporaryTeamTaskId) ||
        visibleTeamTasks.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS team task tenant visibility is invalid');
      }
      const visibleAutomationFlows = await tx.$queryRawUnsafe<
        ChannelEvidence[]
      >(`
        SELECT id, "organizationId" AS organization_id
          FROM "automation_flows" ORDER BY id
      `);
      if (
        !visibleAutomationFlows.some(
          (row) => row.id === temporaryAutomationFlowId,
        ) ||
        visibleAutomationFlows.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS automation flow tenant visibility is invalid');
      }
      const visibleNotifications = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id
          FROM "notifications" ORDER BY id
      `);
      if (
        !visibleNotifications.some(
          (row) => row.id === temporaryNotificationId,
        ) ||
        visibleNotifications.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS notification tenant visibility is invalid');
      }
      const visibleListingDrafts = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id
          FROM "listing_drafts" ORDER BY id
      `);
      if (
        !visibleListingDrafts.some(
          (row) => row.id === temporaryListingDraftId,
        ) ||
        visibleListingDrafts.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS listing draft tenant visibility is invalid');
      }
      const visibleImageProjects = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id
          FROM "image_prompt_projects" ORDER BY id
      `);
      if (
        !visibleImageProjects.some(
          (row) => row.id === temporaryImageProjectId,
        ) ||
        visibleImageProjects.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS image project tenant visibility is invalid');
      }
      const visibleWorkspaces = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id FROM "workspaces" ORDER BY id
      `);
      if (
        !visibleWorkspaces.some((row) => row.id === source[0].workspace_id) ||
        visibleWorkspaces.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS workspace tenant visibility is invalid');
      }
      const visibleMemberships = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT id, "organizationId" AS organization_id FROM "memberships" ORDER BY id
      `);
      if (
        !visibleMemberships.some(
          (row) => row.organization_id === source[0].organization_id,
        ) ||
        visibleMemberships.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS membership tenant visibility is invalid');
      }
      const visibleProducts = await tx.$queryRawUnsafe<ChannelEvidence[]>(`
        SELECT products.id, workspaces."organizationId" AS organization_id
          FROM "products"
          JOIN "workspaces" ON workspaces.id = products."workspaceId"
         ORDER BY products.id
      `);
      if (
        !visibleProducts.some((row) => row.id === temporaryProductId) ||
        visibleProducts.some(
          (row) => row.organization_id !== source[0].organization_id,
        )
      ) {
        throw new Error('RLS product tenant visibility is invalid');
      }
      await tx.$executeRawUnsafe(
        "SELECT set_config('app.current_organization_id', '', true)",
      );
      const channelsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "channel_connections"');
      const ordersWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "marketplace_orders"');
      const archivesWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "audit_archives"');
      const capabilitiesWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "agent_capability_tokens"');
      const mcpInvocationsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "mcp_tool_invocations"');
      const knowledgeDocumentsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "knowledge_documents"');
      const profitCalculationsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "profit_calculations"');
      const sloSnapshotsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "enterprise_slo_daily_snapshots"');
      const workMemoriesWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "agent_work_memories"');
      const experienceCardsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "agent_experience_cards"');
      const autonomyMetricsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "agent_autonomy_daily_metrics"');
      const trendInsightsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "trend_insights"');
      const keywordReportsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "keyword_reports"');
      const alertsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "alerts"');
      const outboxWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "outbox_events"');
      const agentRunsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "agent_runs"');
      const deadLettersWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "dead_letter_jobs"');
      const productLaunchesWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "product_launches"');
      const reviewTasksWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "review_tasks"');
      const candidateDecisionsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "product_research_candidate_decisions"');
      const researchReportsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "product_research_reports"');
      const suppliersWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "suppliers"');
      const supplySkusWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "supply_skus"');
      const replenishmentWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "replenishment_plans"');
      const fileAssetsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "file_assets"');
      const sopsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "sops"');
      const promptsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "prompt_templates"');
      const assistantSessionsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "assistant_sessions"');
      const invoicesWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "invoices"');
      const auditLogsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "audit_logs"');
      const auditHeadsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "audit_chain_heads"');
      const teamTasksWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "team_tasks"');
      const automationFlowsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "automation_flows"');
      const notificationsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "notifications"');
      const listingDraftsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "listing_drafts"');
      const imageProjectsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "image_prompt_projects"');
      const workspacesWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "workspaces"');
      const membershipsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "memberships"');
      const productsWithoutContext = await tx.$queryRawUnsafe<
        Array<{ count: bigint }>
      >('SELECT COUNT(*) AS count FROM "products"');
      if (channelsWithoutContext[0]?.count !== 0n) {
        throw new Error(
          'RLS exposed channel credentials without tenant context',
        );
      }
      if (ordersWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed orders without tenant context');
      }
      if (archivesWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed audit archives without tenant context');
      }
      if (capabilitiesWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed capability tokens without tenant context');
      }
      if (mcpInvocationsWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed MCP invocations without tenant context');
      }
      if (knowledgeDocumentsWithoutContext[0]?.count !== 0n) {
        throw new Error(
          'RLS exposed knowledge documents without tenant context',
        );
      }
      if (profitCalculationsWithoutContext[0]?.count !== 0n) {
        throw new Error(
          'RLS exposed profit calculations without tenant context',
        );
      }
      if (sloSnapshotsWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed SLO snapshots without tenant context');
      }
      if (workMemoriesWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed work memories without tenant context');
      }
      if (experienceCardsWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed experience cards without tenant context');
      }
      if (autonomyMetricsWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed autonomy metrics without tenant context');
      }
      if (trendInsightsWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed trend insights without tenant context');
      }
      if (keywordReportsWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed keyword reports without tenant context');
      }
      if (alertsWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed alerts without tenant context');
      }
      if (outboxWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed outbox events without tenant context');
      }
      if (agentRunsWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed agent runs without tenant context');
      }
      if (deadLettersWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed dead letters without tenant context');
      }
      if (productLaunchesWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed product launches without tenant context');
      }
      if (reviewTasksWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed review tasks without tenant context');
      }
      if (candidateDecisionsWithoutContext[0]?.count !== 0n) {
        throw new Error(
          'RLS exposed candidate decisions without tenant context',
        );
      }
      if (researchReportsWithoutContext[0]?.count !== 0n) {
        throw new Error(
          'RLS exposed product research reports without tenant context',
        );
      }
      if (
        suppliersWithoutContext[0]?.count !== 0n ||
        supplySkusWithoutContext[0]?.count !== 0n ||
        replenishmentWithoutContext[0]?.count !== 0n
      ) {
        throw new Error(
          'RLS exposed supply chain records without tenant context',
        );
      }
      if (fileAssetsWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed file assets without tenant context');
      }
      if (
        sopsWithoutContext[0]?.count !== 0n ||
        promptsWithoutContext[0]?.count !== 0n
      ) {
        throw new Error('RLS exposed SOPs or prompts without tenant context');
      }
      if (assistantSessionsWithoutContext[0]?.count !== 0n) {
        throw new Error(
          'RLS exposed assistant sessions without tenant context',
        );
      }
      if (invoicesWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed invoices without tenant context');
      }
      if (
        auditLogsWithoutContext[0]?.count !== 0n ||
        auditHeadsWithoutContext[0]?.count !== 0n
      ) {
        throw new Error('RLS exposed audit chain without tenant context');
      }
      if (teamTasksWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed team tasks without tenant context');
      }
      if (automationFlowsWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed automation flows without tenant context');
      }
      if (notificationsWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed notifications without tenant context');
      }
      if (listingDraftsWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed listing drafts without tenant context');
      }
      if (imageProjectsWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed image projects without tenant context');
      }
      if (workspacesWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed workspaces without tenant context');
      }
      if (membershipsWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed memberships without tenant context');
      }
      if (productsWithoutContext[0]?.count !== 0n) {
        throw new Error('RLS exposed products without tenant context');
      }
      await tx.$executeRawUnsafe('RESET ROLE');
      await tx.$executeRawUnsafe(
        'DELETE FROM "audit_archives" WHERE id = $1',
        temporaryArchiveId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "agent_capability_tokens" WHERE id = $1',
        temporaryCapabilityId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "mcp_tool_invocations" WHERE id = $1',
        temporaryMcpInvocationId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "knowledge_documents" WHERE id = $1',
        temporaryKnowledgeDocumentId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "profit_calculations" WHERE id = $1',
        temporaryProfitCalculationId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "enterprise_slo_daily_snapshots" WHERE id = $1',
        temporarySloSnapshotId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "agent_work_memories" WHERE id = $1',
        temporaryWorkMemoryId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "agent_experience_cards" WHERE id = $1',
        temporaryExperienceCardId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "agent_autonomy_daily_metrics" WHERE id = $1',
        temporaryAutonomyMetricId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "trend_insights" WHERE id = $1',
        temporaryTrendInsightId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "keyword_reports" WHERE id = $1',
        temporaryKeywordReportId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "alerts" WHERE id = $1',
        temporaryAlertId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "outbox_events" WHERE id = $1',
        temporaryOutboxId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "agent_runs" WHERE id = $1',
        temporaryAgentRunId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "dead_letter_jobs" WHERE id = $1',
        temporaryDeadLetterId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "product_launches" WHERE id = $1',
        temporaryProductLaunchId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "review_tasks" WHERE id = $1',
        temporaryLaunchReviewId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "product_research_candidate_decisions" WHERE id = $1',
        temporaryCandidateDecisionId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "product_research_reports" WHERE id = $1',
        temporaryDecisionReportId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "replenishment_plans" WHERE id = $1',
        temporaryReplenishmentId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "supply_skus" WHERE id = $1',
        temporarySupplySkuId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "suppliers" WHERE id = $1',
        temporarySupplierId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "file_assets" WHERE id = $1',
        temporaryFileAssetId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "sops" WHERE id = $1',
        temporarySopId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "prompt_templates" WHERE id = $1',
        temporaryPromptId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "assistant_sessions" WHERE id = $1',
        temporaryAssistantSessionId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "invoices" WHERE id = $1',
        temporaryInvoiceId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "team_tasks" WHERE id = $1',
        temporaryTeamTaskId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "automation_flows" WHERE id = $1',
        temporaryAutomationFlowId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "notifications" WHERE id = $1',
        temporaryNotificationId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "listing_drafts" WHERE id = $1',
        temporaryListingDraftId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "image_prompt_projects" WHERE id = $1',
        temporaryImageProjectId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM "products" WHERE id = $1',
        temporaryProductId,
      );
      return {
        channelConnections: {
          organizationId: source[0].organization_id,
          visibleRows: visible.length,
          foreignRows: 0,
          rowsWithoutContext: Number(channelsWithoutContext[0]?.count ?? 0n),
        },
        marketplaceOrders: {
          organizationId: orderSource[0].organization_id,
          visibleRows: visibleOrders.length,
          foreignRows: 0,
          rowsWithoutContext: Number(ordersWithoutContext[0]?.count ?? 0n),
        },
        auditArchives: {
          organizationId: source[0].organization_id,
          visibleRows: visibleArchives.length,
          foreignRows: 0,
          rowsWithoutContext: Number(archivesWithoutContext[0]?.count ?? 0n),
          temporaryEvidenceRemoved: true,
        },
        agentCapabilityTokens: {
          organizationId: source[0].organization_id,
          visibleRows: visibleCapabilities.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            capabilitiesWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        mcpToolInvocations: {
          organizationId: source[0].organization_id,
          visibleRows: visibleMcpInvocations.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            mcpInvocationsWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        knowledgeDocuments: {
          organizationId: source[0].organization_id,
          visibleRows: visibleKnowledgeDocuments.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            knowledgeDocumentsWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        profitCalculations: {
          organizationId: source[0].organization_id,
          visibleRows: visibleProfitCalculations.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            profitCalculationsWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        enterpriseSloSnapshots: {
          organizationId: source[0].organization_id,
          visibleRows: visibleSloSnapshots.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            sloSnapshotsWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        agentWorkMemories: {
          organizationId: source[0].organization_id,
          visibleRows: visibleWorkMemories.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            workMemoriesWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        agentExperienceCards: {
          organizationId: source[0].organization_id,
          visibleRows: visibleExperienceCards.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            experienceCardsWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        agentAutonomyDailyMetrics: {
          organizationId: source[0].organization_id,
          visibleRows: visibleAutonomyMetrics.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            autonomyMetricsWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        trendInsights: {
          organizationId: source[0].organization_id,
          visibleRows: visibleTrendInsights.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            trendInsightsWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        keywordReports: {
          organizationId: source[0].organization_id,
          visibleRows: visibleKeywordReports.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            keywordReportsWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        alerts: {
          organizationId: source[0].organization_id,
          visibleRows: visibleAlerts.length,
          foreignRows: 0,
          rowsWithoutContext: Number(alertsWithoutContext[0]?.count ?? 0n),
          temporaryEvidenceRemoved: true,
        },
        outboxEvents: {
          organizationId: source[0].organization_id,
          visibleRows: visibleOutboxEvents.length,
          foreignRows: 0,
          rowsWithoutContext: Number(outboxWithoutContext[0]?.count ?? 0n),
          temporaryEvidenceRemoved: true,
        },
        agentRuns: {
          organizationId: source[0].organization_id,
          visibleRows: visibleAgentRuns.length,
          foreignRows: 0,
          rowsWithoutContext: Number(agentRunsWithoutContext[0]?.count ?? 0n),
          temporaryEvidenceRemoved: true,
        },
        deadLetterJobs: {
          organizationId: source[0].organization_id,
          visibleRows: visibleDeadLetters.length,
          foreignRows: 0,
          rowsWithoutContext: Number(deadLettersWithoutContext[0]?.count ?? 0n),
          temporaryEvidenceRemoved: true,
        },
        productLaunches: {
          organizationId: source[0].organization_id,
          visibleRows: visibleProductLaunches.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            productLaunchesWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        reviewTasks: {
          organizationId: source[0].organization_id,
          visibleRows: visibleReviewTasks.length,
          foreignRows: 0,
          rowsWithoutContext: Number(reviewTasksWithoutContext[0]?.count ?? 0n),
          temporaryEvidenceRemoved: true,
        },
        productResearchCandidateDecisions: {
          organizationId: source[0].organization_id,
          visibleRows: visibleCandidateDecisions.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            candidateDecisionsWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        productResearchReports: {
          organizationId: source[0].organization_id,
          visibleRows: visibleResearchReports.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            researchReportsWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        supplyChain: {
          organizationId: source[0].organization_id,
          suppliersVisible: visibleSuppliers.length,
          supplySkusVisible: visibleSupplySkus.length,
          replenishmentPlansVisible: visibleReplenishmentPlans.length,
          foreignRows: 0,
          rowsWithoutContext:
            Number(suppliersWithoutContext[0]?.count ?? 0n) +
            Number(supplySkusWithoutContext[0]?.count ?? 0n) +
            Number(replenishmentWithoutContext[0]?.count ?? 0n),
          temporaryEvidenceRemoved: true,
        },
        fileAssets: {
          organizationId: source[0].organization_id,
          visibleRows: visibleFileAssets.length,
          foreignRows: 0,
          rowsWithoutContext: Number(fileAssetsWithoutContext[0]?.count ?? 0n),
          temporaryEvidenceRemoved: true,
        },
        sopsAndPrompts: {
          organizationId: source[0].organization_id,
          sopsVisible: visibleSops.length,
          promptsVisible: visiblePrompts.length,
          foreignRows: 0,
          rowsWithoutContext:
            Number(sopsWithoutContext[0]?.count ?? 0n) +
            Number(promptsWithoutContext[0]?.count ?? 0n),
          temporaryEvidenceRemoved: true,
        },
        assistantSessions: {
          organizationId: source[0].organization_id,
          visibleRows: visibleAssistantSessions.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            assistantSessionsWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        invoices: {
          organizationId: source[0].organization_id,
          visibleRows: visibleInvoices.length,
          foreignRows: 0,
          rowsWithoutContext: Number(invoicesWithoutContext[0]?.count ?? 0n),
          temporaryEvidenceRemoved: true,
        },
        auditChain: {
          organizationId: source[0].organization_id,
          logsVisible: visibleAuditLogs.length,
          headsVisible: visibleAuditHeads.length,
          foreignRows: 0,
          rowsWithoutContext:
            Number(auditLogsWithoutContext[0]?.count ?? 0n) +
            Number(auditHeadsWithoutContext[0]?.count ?? 0n),
          existingEvidencePreserved: true,
        },
        teamTasks: {
          organizationId: source[0].organization_id,
          visibleRows: visibleTeamTasks.length,
          foreignRows: 0,
          rowsWithoutContext: Number(teamTasksWithoutContext[0]?.count ?? 0n),
          temporaryEvidenceRemoved: true,
        },
        automationFlows: {
          organizationId: source[0].organization_id,
          visibleRows: visibleAutomationFlows.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            automationFlowsWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        notifications: {
          organizationId: source[0].organization_id,
          visibleRows: visibleNotifications.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            notificationsWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        listingDrafts: {
          organizationId: source[0].organization_id,
          visibleRows: visibleListingDrafts.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            listingDraftsWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        imagePromptProjects: {
          organizationId: source[0].organization_id,
          visibleRows: visibleImageProjects.length,
          foreignRows: 0,
          rowsWithoutContext: Number(
            imageProjectsWithoutContext[0]?.count ?? 0n,
          ),
          temporaryEvidenceRemoved: true,
        },
        workspaces: {
          organizationId: source[0].organization_id,
          visibleRows: visibleWorkspaces.length,
          foreignRows: 0,
          rowsWithoutContext: Number(workspacesWithoutContext[0]?.count ?? 0n),
        },
        memberships: {
          organizationId: source[0].organization_id,
          visibleRows: visibleMemberships.length,
          foreignRows: 0,
          rowsWithoutContext: Number(membershipsWithoutContext[0]?.count ?? 0n),
        },
        products: {
          organizationId: source[0].organization_id,
          visibleRows: visibleProducts.length,
          foreignRows: 0,
          rowsWithoutContext: Number(productsWithoutContext[0]?.count ?? 0n),
          temporaryEvidenceRemoved: true,
        },
      };
    });

    process.stdout.write(
      `${JSON.stringify({ status: 'passed', role: ACCEPTANCE_ROLE, ...evidence }, null, 2)}\n`,
    );
  } finally {
    await cleanupRole(prisma).catch(() => undefined);
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
