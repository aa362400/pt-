-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('AMAZON_US', 'AMAZON_EU', 'AMAZON_JP', 'AMAZON_AU', 'SHOPIFY', 'WOOCOMMERCE', 'MANUAL');

-- CreateEnum
CREATE TYPE "ChannelSyncStatus" AS ENUM ('PENDING', 'SYNCING', 'SUCCESS', 'FAILED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('PRODUCT_IMAGE', 'KNOWLEDGE_DOC', 'LISTING_IMAGE', 'BRAND_ASSET', 'REPORT_EXPORT', 'AVATAR', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('PRIVATE', 'WORKSPACE', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "SopStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SessionContextType" AS ENUM ('GENERAL', 'PRODUCT_RESEARCH', 'LISTING_OPTIMIZATION', 'ADVERTISING', 'PROFIT_ANALYSIS', 'CUSTOMER_SERVICE', 'TRAINING');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('PRODUCT_RESEARCHER', 'LISTING_OPTIMIZER', 'ADVERTISING_STRATEGIST', 'PROFIT_ANALYST', 'CUSTOMER_INSIGHT', 'CONTENT_WRITER', 'KEYWORD_EXPLORER', 'GENERAL_ASSISTANT', 'IMAGE_CREATIVE');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "AutomationFlowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ERROR', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('SCHEDULE', 'WEBHOOK', 'CONDITION', 'EVENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('SYSTEM', 'SALES_DROP', 'INVENTORY', 'PRICE_CHANGE', 'POLICY_CHANGE', 'REVIEW_ALERT', 'AD_PERFORMANCE', 'ACCOUNT_HEALTH');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ImageMode" AS ENUM ('SINGLE', 'BULK', 'VARIATION', 'AIP_GENERATED');

-- CreateEnum
CREATE TYPE "ImageProjectStatus" AS ENUM ('DRAFT', 'GENERATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SYSTEM', 'ALERT', 'REPORT_READY', 'MENTION', 'TASK_ASSIGNED', 'APPROVAL_REQUIRED', 'MILESTONE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelType" "ChannelType" NOT NULL,
    "marketplace" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_connections" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalShopId" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "syncStatus" "ChannelSyncStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "channel_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sku" TEXT,
    "asinOrExternalId" TEXT,
    "images" TEXT[],
    "cost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "price" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "ownerId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT,
    "purpose" "FilePurpose" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "fileAssetId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'ORGANIZATION',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sops" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "SopStatus" NOT NULL DEFAULT 'DRAFT',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "createdBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_tasks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "dueAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contextType" "SessionContextType" NOT NULL DEFAULT 'GENERAL',
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT NOT NULL,
    "agentType" "AgentType" NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "status" "AgentRunStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "tokenUsage" JSONB,
    "costAmount" DECIMAL(65,30),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_flows" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AutomationFlowStatus" NOT NULL DEFAULT 'DRAFT',
    "triggerType" "TriggerType" NOT NULL,
    "triggerConfig" JSONB NOT NULL DEFAULT '{}',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "result" JSONB,
    "error" JSONB,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_metric_snapshots" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "healthScore" DOUBLE PRECISION,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "conversionRate" DOUBLE PRECISION,
    "acos" DOUBLE PRECISION,
    "reviewRate" DOUBLE PRECISION,
    "refundRate" DOUBLE PRECISION,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "store_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "source" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_insights" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "market" TEXT,
    "category" TEXT,
    "keyword" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "growthRate" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trend_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_research_reports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "query" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "summary" TEXT,
    "opportunities" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_research_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_reports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "query" TEXT NOT NULL,
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "country" TEXT NOT NULL DEFAULT 'US',
    "totalKeywords" INTEGER,
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "charts" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_drafts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT,
    "platform" TEXT NOT NULL,
    "title" TEXT,
    "bullets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "seoTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "score" DOUBLE PRECISION,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profit_calculations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "productId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "salePrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "productCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "packagingCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "shippingCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "platformFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paymentFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "adCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "storageCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "otherCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "estimatedProfit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "profitMargin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "roi" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scenarios" JSONB NOT NULL DEFAULT '[]',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profit_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_prompt_projects" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "title" TEXT NOT NULL,
    "productId" TEXT,
    "mode" "ImageMode" NOT NULL DEFAULT 'SINGLE',
    "prompt" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "generatedAssets" JSONB NOT NULL DEFAULT '[]',
    "status" "ImageProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "image_prompt_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_plan_idx" ON "organizations"("plan");

-- CreateIndex
CREATE INDEX "organizations_slug_idx" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "memberships_organizationId_idx" ON "memberships"("organizationId");

-- CreateIndex
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");

-- CreateIndex
CREATE INDEX "memberships_role_idx" ON "memberships"("role");

-- CreateIndex
CREATE INDEX "memberships_status_idx" ON "memberships"("status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_organizationId_key" ON "memberships"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "workspaces_organizationId_idx" ON "workspaces"("organizationId");

-- CreateIndex
CREATE INDEX "workspaces_channelType_idx" ON "workspaces"("channelType");

-- CreateIndex
CREATE INDEX "workspaces_status_idx" ON "workspaces"("status");

-- CreateIndex
CREATE INDEX "channel_connections_workspaceId_idx" ON "channel_connections"("workspaceId");

-- CreateIndex
CREATE INDEX "channel_connections_provider_idx" ON "channel_connections"("provider");

-- CreateIndex
CREATE INDEX "channel_connections_syncStatus_idx" ON "channel_connections"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "channel_connections_workspaceId_provider_key" ON "channel_connections"("workspaceId", "provider");

-- CreateIndex
CREATE INDEX "products_workspaceId_idx" ON "products"("workspaceId");

-- CreateIndex
CREATE INDEX "products_sku_idx" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_asinOrExternalId_idx" ON "products"("asinOrExternalId");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "products_createdAt_idx" ON "products"("createdAt");

-- CreateIndex
CREATE INDEX "file_assets_organizationId_idx" ON "file_assets"("organizationId");

-- CreateIndex
CREATE INDEX "file_assets_workspaceId_idx" ON "file_assets"("workspaceId");

-- CreateIndex
CREATE INDEX "file_assets_ownerId_idx" ON "file_assets"("ownerId");

-- CreateIndex
CREATE INDEX "file_assets_purpose_idx" ON "file_assets"("purpose");

-- CreateIndex
CREATE INDEX "knowledge_documents_organizationId_idx" ON "knowledge_documents"("organizationId");

-- CreateIndex
CREATE INDEX "knowledge_documents_workspaceId_idx" ON "knowledge_documents"("workspaceId");

-- CreateIndex
CREATE INDEX "knowledge_documents_createdBy_idx" ON "knowledge_documents"("createdBy");

-- CreateIndex
CREATE INDEX "knowledge_documents_visibility_idx" ON "knowledge_documents"("visibility");

-- CreateIndex
CREATE INDEX "knowledge_documents_title_idx" ON "knowledge_documents"("title");

-- CreateIndex
CREATE INDEX "sops_organizationId_idx" ON "sops"("organizationId");

-- CreateIndex
CREATE INDEX "sops_status_idx" ON "sops"("status");

-- CreateIndex
CREATE INDEX "sops_createdBy_idx" ON "sops"("createdBy");

-- CreateIndex
CREATE INDEX "team_tasks_organizationId_idx" ON "team_tasks"("organizationId");

-- CreateIndex
CREATE INDEX "team_tasks_workspaceId_idx" ON "team_tasks"("workspaceId");

-- CreateIndex
CREATE INDEX "team_tasks_assigneeId_idx" ON "team_tasks"("assigneeId");

-- CreateIndex
CREATE INDEX "team_tasks_createdBy_idx" ON "team_tasks"("createdBy");

-- CreateIndex
CREATE INDEX "team_tasks_status_idx" ON "team_tasks"("status");

-- CreateIndex
CREATE INDEX "team_tasks_priority_idx" ON "team_tasks"("priority");

-- CreateIndex
CREATE INDEX "prompt_templates_organizationId_idx" ON "prompt_templates"("organizationId");

-- CreateIndex
CREATE INDEX "prompt_templates_category_idx" ON "prompt_templates"("category");

-- CreateIndex
CREATE INDEX "prompt_templates_createdBy_idx" ON "prompt_templates"("createdBy");

-- CreateIndex
CREATE INDEX "assistant_sessions_organizationId_idx" ON "assistant_sessions"("organizationId");

-- CreateIndex
CREATE INDEX "assistant_sessions_workspaceId_idx" ON "assistant_sessions"("workspaceId");

-- CreateIndex
CREATE INDEX "assistant_sessions_userId_idx" ON "assistant_sessions"("userId");

-- CreateIndex
CREATE INDEX "assistant_sessions_contextType_idx" ON "assistant_sessions"("contextType");

-- CreateIndex
CREATE INDEX "assistant_sessions_status_idx" ON "assistant_sessions"("status");

-- CreateIndex
CREATE INDEX "assistant_messages_sessionId_idx" ON "assistant_messages"("sessionId");

-- CreateIndex
CREATE INDEX "assistant_messages_createdAt_idx" ON "assistant_messages"("createdAt");

-- CreateIndex
CREATE INDEX "agent_runs_organizationId_idx" ON "agent_runs"("organizationId");

-- CreateIndex
CREATE INDEX "agent_runs_workspaceId_idx" ON "agent_runs"("workspaceId");

-- CreateIndex
CREATE INDEX "agent_runs_userId_idx" ON "agent_runs"("userId");

-- CreateIndex
CREATE INDEX "agent_runs_agentType_idx" ON "agent_runs"("agentType");

-- CreateIndex
CREATE INDEX "agent_runs_status_idx" ON "agent_runs"("status");

-- CreateIndex
CREATE INDEX "agent_runs_createdAt_idx" ON "agent_runs"("createdAt");

-- CreateIndex
CREATE INDEX "automation_flows_organizationId_idx" ON "automation_flows"("organizationId");

-- CreateIndex
CREATE INDEX "automation_flows_workspaceId_idx" ON "automation_flows"("workspaceId");

-- CreateIndex
CREATE INDEX "automation_flows_status_idx" ON "automation_flows"("status");

-- CreateIndex
CREATE INDEX "automation_flows_triggerType_idx" ON "automation_flows"("triggerType");

-- CreateIndex
CREATE INDEX "automation_runs_flowId_idx" ON "automation_runs"("flowId");

-- CreateIndex
CREATE INDEX "automation_runs_status_idx" ON "automation_runs"("status");

-- CreateIndex
CREATE INDEX "automation_runs_startedAt_idx" ON "automation_runs"("startedAt");

-- CreateIndex
CREATE INDEX "store_metric_snapshots_workspaceId_idx" ON "store_metric_snapshots"("workspaceId");

-- CreateIndex
CREATE INDEX "store_metric_snapshots_date_idx" ON "store_metric_snapshots"("date");

-- CreateIndex
CREATE UNIQUE INDEX "store_metric_snapshots_workspaceId_date_key" ON "store_metric_snapshots"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "alerts_organizationId_idx" ON "alerts"("organizationId");

-- CreateIndex
CREATE INDEX "alerts_workspaceId_idx" ON "alerts"("workspaceId");

-- CreateIndex
CREATE INDEX "alerts_type_idx" ON "alerts"("type");

-- CreateIndex
CREATE INDEX "alerts_severity_idx" ON "alerts"("severity");

-- CreateIndex
CREATE INDEX "alerts_status_idx" ON "alerts"("status");

-- CreateIndex
CREATE INDEX "alerts_createdAt_idx" ON "alerts"("createdAt");

-- CreateIndex
CREATE INDEX "trend_insights_organizationId_idx" ON "trend_insights"("organizationId");

-- CreateIndex
CREATE INDEX "trend_insights_workspaceId_idx" ON "trend_insights"("workspaceId");

-- CreateIndex
CREATE INDEX "trend_insights_keyword_idx" ON "trend_insights"("keyword");

-- CreateIndex
CREATE INDEX "trend_insights_category_idx" ON "trend_insights"("category");

-- CreateIndex
CREATE INDEX "trend_insights_observedAt_idx" ON "trend_insights"("observedAt");

-- CreateIndex
CREATE INDEX "product_research_reports_organizationId_idx" ON "product_research_reports"("organizationId");

-- CreateIndex
CREATE INDEX "product_research_reports_workspaceId_idx" ON "product_research_reports"("workspaceId");

-- CreateIndex
CREATE INDEX "product_research_reports_createdBy_idx" ON "product_research_reports"("createdBy");

-- CreateIndex
CREATE INDEX "product_research_reports_status_idx" ON "product_research_reports"("status");

-- CreateIndex
CREATE INDEX "keyword_reports_organizationId_idx" ON "keyword_reports"("organizationId");

-- CreateIndex
CREATE INDEX "keyword_reports_workspaceId_idx" ON "keyword_reports"("workspaceId");

-- CreateIndex
CREATE INDEX "keyword_reports_createdBy_idx" ON "keyword_reports"("createdBy");

-- CreateIndex
CREATE INDEX "keyword_reports_country_idx" ON "keyword_reports"("country");

-- CreateIndex
CREATE INDEX "listing_drafts_organizationId_idx" ON "listing_drafts"("organizationId");

-- CreateIndex
CREATE INDEX "listing_drafts_workspaceId_idx" ON "listing_drafts"("workspaceId");

-- CreateIndex
CREATE INDEX "listing_drafts_productId_idx" ON "listing_drafts"("productId");

-- CreateIndex
CREATE INDEX "listing_drafts_createdBy_idx" ON "listing_drafts"("createdBy");

-- CreateIndex
CREATE INDEX "listing_drafts_status_idx" ON "listing_drafts"("status");

-- CreateIndex
CREATE INDEX "profit_calculations_organizationId_idx" ON "profit_calculations"("organizationId");

-- CreateIndex
CREATE INDEX "profit_calculations_workspaceId_idx" ON "profit_calculations"("workspaceId");

-- CreateIndex
CREATE INDEX "profit_calculations_productId_idx" ON "profit_calculations"("productId");

-- CreateIndex
CREATE INDEX "profit_calculations_createdBy_idx" ON "profit_calculations"("createdBy");

-- CreateIndex
CREATE INDEX "image_prompt_projects_organizationId_idx" ON "image_prompt_projects"("organizationId");

-- CreateIndex
CREATE INDEX "image_prompt_projects_workspaceId_idx" ON "image_prompt_projects"("workspaceId");

-- CreateIndex
CREATE INDEX "image_prompt_projects_productId_idx" ON "image_prompt_projects"("productId");

-- CreateIndex
CREATE INDEX "image_prompt_projects_createdBy_idx" ON "image_prompt_projects"("createdBy");

-- CreateIndex
CREATE INDEX "image_prompt_projects_status_idx" ON "image_prompt_projects"("status");

-- CreateIndex
CREATE INDEX "notifications_organizationId_idx" ON "notifications"("organizationId");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "notifications_readAt_idx" ON "notifications"("readAt");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_idx" ON "audit_logs"("resourceType");

-- CreateIndex
CREATE INDEX "audit_logs_resourceId_idx" ON "audit_logs"("resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sops" ADD CONSTRAINT "sops_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sops" ADD CONSTRAINT "sops_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_tasks_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_sessions" ADD CONSTRAINT "assistant_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_sessions" ADD CONSTRAINT "assistant_sessions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_sessions" ADD CONSTRAINT "assistant_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "assistant_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_flows" ADD CONSTRAINT "automation_flows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_flows" ADD CONSTRAINT "automation_flows_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "automation_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_metric_snapshots" ADD CONSTRAINT "store_metric_snapshots_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_insights" ADD CONSTRAINT "trend_insights_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_insights" ADD CONSTRAINT "trend_insights_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_research_reports" ADD CONSTRAINT "product_research_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_research_reports" ADD CONSTRAINT "product_research_reports_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_research_reports" ADD CONSTRAINT "product_research_reports_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_reports" ADD CONSTRAINT "keyword_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_reports" ADD CONSTRAINT "keyword_reports_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_reports" ADD CONSTRAINT "keyword_reports_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_drafts" ADD CONSTRAINT "listing_drafts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_drafts" ADD CONSTRAINT "listing_drafts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_drafts" ADD CONSTRAINT "listing_drafts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_drafts" ADD CONSTRAINT "listing_drafts_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_calculations" ADD CONSTRAINT "profit_calculations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_calculations" ADD CONSTRAINT "profit_calculations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_calculations" ADD CONSTRAINT "profit_calculations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_calculations" ADD CONSTRAINT "profit_calculations_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_prompt_projects" ADD CONSTRAINT "image_prompt_projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_prompt_projects" ADD CONSTRAINT "image_prompt_projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_prompt_projects" ADD CONSTRAINT "image_prompt_projects_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_prompt_projects" ADD CONSTRAINT "image_prompt_projects_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

