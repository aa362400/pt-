--
-- PostgreSQL database dump
--


-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: ActionProposalStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ActionProposalStatus" AS ENUM (
    'PENDING',
    'EXECUTING',
    'UNKNOWN',
    'APPROVED',
    'EXECUTED',
    'DISMISSED',
    'FAILED',
    'EXPIRED',
    'CHANGES_REQUESTED',
    'REJECTED'
);


--
-- Name: AgentLifecycleStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AgentLifecycleStatus" AS ENUM (
    'CREATED',
    'PLANNING',
    'WAITING_TOOL',
    'WAITING_APPROVAL',
    'EXECUTING',
    'VERIFYING',
    'RETRY_SCHEDULED',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
);


--
-- Name: AgentRunStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AgentRunStatus" AS ENUM (
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'TIMEOUT',
    'ENQUEUING',
    'QUEUED',
    'RETRYING',
    'DEAD_LETTERED'
);


--
-- Name: AgentStepStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AgentStepStatus" AS ENUM (
    'PENDING',
    'RUNNING',
    'WAITING_APPROVAL',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
);


--
-- Name: AgentType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AgentType" AS ENUM (
    'PRODUCT_RESEARCHER',
    'LISTING_OPTIMIZER',
    'ADVERTISING_STRATEGIST',
    'PROFIT_ANALYST',
    'CUSTOMER_INSIGHT',
    'CONTENT_WRITER',
    'KEYWORD_EXPLORER',
    'GENERAL_ASSISTANT',
    'IMAGE_CREATIVE',
    'PLANNER'
);


--
-- Name: AlertSeverity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AlertSeverity" AS ENUM (
    'INFO',
    'WARNING',
    'CRITICAL',
    'EMERGENCY'
);


--
-- Name: AlertStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AlertStatus" AS ENUM (
    'OPEN',
    'ACKNOWLEDGED',
    'RESOLVED',
    'DISMISSED'
);


--
-- Name: AlertType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AlertType" AS ENUM (
    'SYSTEM',
    'SALES_DROP',
    'INVENTORY',
    'PRICE_CHANGE',
    'POLICY_CHANGE',
    'REVIEW_ALERT',
    'AD_PERFORMANCE',
    'ACCOUNT_HEALTH'
);


--
-- Name: ApprovalDecisionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ApprovalDecisionType" AS ENUM (
    'APPROVE',
    'REJECT',
    'REQUEST_CHANGES',
    'OVERRIDE'
);


--
-- Name: AutomationFlowStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AutomationFlowStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'PAUSED',
    'ERROR',
    'ARCHIVED'
);


--
-- Name: ChannelSyncStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ChannelSyncStatus" AS ENUM (
    'PENDING',
    'SYNCING',
    'SUCCESS',
    'FAILED',
    'DISCONNECTED'
);


--
-- Name: ChannelType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ChannelType" AS ENUM (
    'AMAZON_US',
    'AMAZON_EU',
    'AMAZON_JP',
    'AMAZON_AU',
    'SHOPIFY',
    'WOOCOMMERCE',
    'MANUAL',
    'OZON'
);


--
-- Name: DeadLetterClassification; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DeadLetterClassification" AS ENUM (
    'UNCLASSIFIED',
    'RETRYABLE',
    'PERMANENT',
    'DATA_MISSING',
    'PROVIDER_FAILURE'
);


--
-- Name: DeadLetterResolutionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DeadLetterResolutionStatus" AS ENUM (
    'OPEN',
    'REPLAYING',
    'REPLAYED',
    'RESOLVED'
);


--
-- Name: DocumentVisibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentVisibility" AS ENUM (
    'PRIVATE',
    'WORKSPACE',
    'ORGANIZATION'
);


--
-- Name: ExternalSubmissionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ExternalSubmissionStatus" AS ENUM (
    'PREPARED',
    'REQUEST_SENT',
    'ACKNOWLEDGED',
    'SUCCEEDED',
    'REJECTED',
    'UNKNOWN',
    'CLAIMED',
    'RETRYABLE_FAILED',
    'RECONCILING'
);


--
-- Name: FilePurpose; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FilePurpose" AS ENUM (
    'PRODUCT_IMAGE',
    'KNOWLEDGE_DOC',
    'LISTING_IMAGE',
    'BRAND_ASSET',
    'REPORT_EXPORT',
    'AVATAR',
    'OTHER'
);


--
-- Name: ImageMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ImageMode" AS ENUM (
    'SINGLE',
    'BULK',
    'VARIATION',
    'AIP_GENERATED'
);


--
-- Name: ImageProjectStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ImageProjectStatus" AS ENUM (
    'DRAFT',
    'GENERATING',
    'COMPLETED',
    'FAILED'
);


--
-- Name: ImageQaStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ImageQaStatus" AS ENUM (
    'PENDING',
    'PASSED',
    'FAILED',
    'ERROR'
);


--
-- Name: ListingPublishSnapshotStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ListingPublishSnapshotStatus" AS ENUM (
    'APPROVED',
    'SUBMITTING',
    'SUBMITTED',
    'ACTIVE',
    'BLOCKED',
    'FAILED'
);


--
-- Name: ListingSandboxRiskLevel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ListingSandboxRiskLevel" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'BLOCKED'
);


--
-- Name: ListingSandboxStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ListingSandboxStatus" AS ENUM (
    'PASSED',
    'REVIEW_REQUIRED',
    'BLOCKED',
    'OVERRIDDEN'
);


--
-- Name: ListingStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ListingStatus" AS ENUM (
    'DRAFT',
    'IN_REVIEW',
    'PUBLISHED',
    'REJECTED',
    'ARCHIVED',
    'APPROVED'
);


--
-- Name: McpInvocationStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."McpInvocationStatus" AS ENUM (
    'RUNNING',
    'COMPLETED',
    'FAILED'
);


--
-- Name: MembershipRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MembershipRole" AS ENUM (
    'OWNER',
    'ADMIN',
    'MEMBER',
    'VIEWER'
);


--
-- Name: MembershipStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MembershipStatus" AS ENUM (
    'ACTIVE',
    'INVITED',
    'SUSPENDED',
    'REMOVED'
);


--
-- Name: MessageRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MessageRole" AS ENUM (
    'USER',
    'ASSISTANT',
    'SYSTEM',
    'TOOL'
);


--
-- Name: NotificationType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NotificationType" AS ENUM (
    'SYSTEM',
    'ALERT',
    'REPORT_READY',
    'MENTION',
    'TASK_ASSIGNED',
    'APPROVAL_REQUIRED',
    'MILESTONE'
);


--
-- Name: OutboxStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."OutboxStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'PUBLISHED',
    'RETRYING',
    'FAILED',
    'DEAD_LETTERED'
);


--
-- Name: Plan; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Plan" AS ENUM (
    'FREE',
    'STARTER',
    'PROFESSIONAL',
    'ENTERPRISE'
);


--
-- Name: ProductCandidateStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductCandidateStatus" AS ENUM (
    'DISCOVERED',
    'ELIGIBLE',
    'SCORED',
    'RECOMMENDED',
    'WATCH',
    'HOLD',
    'REJECTED'
);


--
-- Name: ProductLaunchStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductLaunchStatus" AS ENUM (
    'QUEUED',
    'GENERATING_IMAGES',
    'SUBMITTING_TO_OZON',
    'RECOVERING',
    'SUBMITTED_TO_OZON',
    'ACTIVE_ON_OZON',
    'BLOCKED',
    'FAILED',
    'AWAITING_PUBLISH_APPROVAL'
);


--
-- Name: ProductResearchDecision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductResearchDecision" AS ENUM (
    'TEST_NOW',
    'WATCH',
    'HOLD',
    'REJECT'
);


--
-- Name: ProductResearchRunStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductResearchRunStatus" AS ENUM (
    'PENDING',
    'RUNNING',
    'PARTIAL',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
);


--
-- Name: ProductResearchRunTrigger; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductResearchRunTrigger" AS ENUM (
    'SCHEDULE',
    'MANUAL',
    'RETRY',
    'BACKFILL'
);


--
-- Name: ProductResearchSourceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductResearchSourceStatus" AS ENUM (
    'HEALTHY',
    'DEGRADED',
    'FAILED',
    'DISABLED',
    'NOT_CONFIGURED',
    'CSV_ONLY'
);


--
-- Name: ProductResearchStage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductResearchStage" AS ENUM (
    'COLLECT',
    'NORMALIZE',
    'KEYWORDS',
    'DEMAND',
    'COMPETITION',
    'PROFIT',
    'RISK',
    'SCORE',
    'REPORT',
    'FEEDBACK'
);


--
-- Name: ProductResearchStageStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductResearchStageStatus" AS ENUM (
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'PARTIAL',
    'FAILED',
    'SKIPPED'
);


--
-- Name: ProductRiskReviewStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductRiskReviewStatus" AS ENUM (
    'AUTO',
    'NEEDS_REVIEW',
    'CONFIRMED',
    'DISMISSED'
);


--
-- Name: ProductRiskSeverity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductRiskSeverity" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'BLOCKED'
);


--
-- Name: ProductSignalQuality; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductSignalQuality" AS ENUM (
    'VERIFIED',
    'ESTIMATED',
    'MANUAL',
    'UNKNOWN'
);


--
-- Name: ProductSignalStrength; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductSignalStrength" AS ENUM (
    'STRONG',
    'MEDIUM',
    'WEAK',
    'INVALID'
);


--
-- Name: ProductStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'PAUSED',
    'ARCHIVED',
    'DELETED'
);


--
-- Name: PromptVersionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PromptVersionStatus" AS ENUM (
    'DRAFT',
    'CHALLENGER',
    'CHAMPION',
    'RETIRED'
);


--
-- Name: ReplenishmentPlanStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ReplenishmentPlanStatus" AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED'
);


--
-- Name: ResearchArtifactType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ResearchArtifactType" AS ENUM (
    'TOP_MD',
    'TOP_JSON',
    'WATCHLIST_JSON',
    'REJECTED_JSON',
    'RISK_JSON',
    'SOURCE_HEALTH_JSON',
    'RUN_LOG_JSON'
);


--
-- Name: ResearchCandidateDecisionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ResearchCandidateDecisionStatus" AS ENUM (
    'APPROVED',
    'REJECTED'
);


--
-- Name: ReviewEntityType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ReviewEntityType" AS ENUM (
    'AGENT_RUN',
    'IMAGE_GENERATION',
    'LISTING_DRAFT',
    'PRODUCT_RESEARCH',
    'SUPPLY_PLAN'
);


--
-- Name: ReviewStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ReviewStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'REWORK'
);


--
-- Name: ScoringVersionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ScoringVersionStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'RETIRED'
);


--
-- Name: SessionContextType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SessionContextType" AS ENUM (
    'GENERAL',
    'PRODUCT_RESEARCH',
    'LISTING_OPTIMIZATION',
    'ADVERTISING',
    'PROFIT_ANALYSIS',
    'CUSTOMER_SERVICE',
    'TRAINING'
);


--
-- Name: SessionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SessionStatus" AS ENUM (
    'ACTIVE',
    'PAUSED',
    'ARCHIVED'
);


--
-- Name: SopStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SopStatus" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED'
);


--
-- Name: SupplyRecordStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupplyRecordStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


--
-- Name: TaskPriority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskPriority" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'URGENT'
);


--
-- Name: TaskStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskStatus" AS ENUM (
    'TODO',
    'IN_PROGRESS',
    'REVIEW',
    'DONE',
    'CANCELLED'
);


--
-- Name: TrainingJobStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TrainingJobStatus" AS ENUM (
    'DRAFT',
    'QUEUED',
    'RUNNING',
    'SUCCEEDED',
    'FAILED',
    'CANCELLED'
);


--
-- Name: TriggerType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TriggerType" AS ENUM (
    'SCHEDULE',
    'WEBHOOK',
    'CONDITION',
    'EVENT',
    'MANUAL'
);


--
-- Name: prevent_action_proposal_payload_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_action_proposal_payload_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."notificationId" IS DISTINCT FROM OLD."notificationId"
    OR NEW."requestedBy" IS DISTINCT FROM OLD."requestedBy"
    OR NEW."approverId" IS DISTINCT FROM OLD."approverId"
    OR NEW."source" IS DISTINCT FROM OLD."source"
    OR NEW."action" IS DISTINCT FROM OLD."action"
    OR NEW."params" IS DISTINCT FROM OLD."params"
    OR NEW."context" IS DISTINCT FROM OLD."context"
    OR NEW."payloadHash" IS DISTINCT FROM OLD."payloadHash"
    OR NEW."dedupeKey" IS DISTINCT FROM OLD."dedupeKey"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Action proposal payload is immutable';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_external_submission_identity_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_external_submission_identity_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."productLaunchId" IS DISTINCT FROM OLD."productLaunchId"
    OR NEW."publishSnapshotId" IS DISTINCT FROM OLD."publishSnapshotId"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."operation" IS DISTINCT FROM OLD."operation"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash"
    OR (
      OLD."payloadHash" IS NOT NULL
      AND NEW."payloadHash" IS DISTINCT FROM OLD."payloadHash"
    )
    OR NEW."request" IS DISTINCT FROM OLD."request"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'External submission identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_listing_publish_snapshot_payload_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_listing_publish_snapshot_payload_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."productLaunchId" IS DISTINCT FROM OLD."productLaunchId"
    OR NEW."listingDraftId" IS DISTINCT FROM OLD."listingDraftId"
    OR NEW."reviewTaskId" IS DISTINCT FROM OLD."reviewTaskId"
    OR NEW."productId" IS DISTINCT FROM OLD."productId"
    OR NEW."channelId" IS DISTINCT FROM OLD."channelId"
    OR NEW."target" IS DISTINCT FROM OLD."target"
    OR NEW."schemaVersion" IS DISTINCT FROM OLD."schemaVersion"
    OR NEW."listingApprovalHash" IS DISTINCT FROM OLD."listingApprovalHash"
    OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot"
    OR NEW."snapshotHash" IS DISTINCT FROM OLD."snapshotHash"
    OR NEW."approvedBy" IS DISTINCT FROM OLD."approvedBy"
    OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Listing publish snapshot payload is immutable';
  END IF;
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: action_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.action_proposals (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "notificationId" text NOT NULL,
    "requestedBy" text NOT NULL,
    "approverId" text NOT NULL,
    source text NOT NULL,
    action text NOT NULL,
    params jsonb NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    "payloadHash" text NOT NULL,
    status public."ActionProposalStatus" DEFAULT 'PENDING'::public."ActionProposalStatus" NOT NULL,
    result jsonb,
    error text,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "claimedAt" timestamp(3) without time zone,
    "decidedAt" timestamp(3) without time zone,
    "executedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "dedupeKey" text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "activeDedupeSlot" text,
    "executionAttempt" integer DEFAULT 0 NOT NULL,
    "lastHeartbeatAt" timestamp(3) without time zone,
    "executionGrantHash" text,
    "executionGrantScope" text,
    "executionGrantDecisionId" text,
    "executionGrantExpiresAt" timestamp(3) without time zone,
    "executionGrantConsumedAt" timestamp(3) without time zone
);

ALTER TABLE ONLY public.action_proposals FORCE ROW LEVEL SECURITY;


--
-- Name: agent_autonomy_daily_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_autonomy_daily_metrics (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    "taskSuccessRate" double precision NOT NULL,
    "suggestionAdoptionRate" double precision NOT NULL,
    "autonomousCompletionRate" double precision NOT NULL,
    "memoryQueryAccuracy" double precision NOT NULL,
    "unauthorizedActionCount" integer DEFAULT 0 NOT NULL,
    "totalTasks" integer DEFAULT 0 NOT NULL,
    "successfulTasks" integer DEFAULT 0 NOT NULL,
    "totalSuggestions" integer DEFAULT 0 NOT NULL,
    "acceptedSuggestions" integer DEFAULT 0 NOT NULL,
    "autonomousCompletions" integer DEFAULT 0 NOT NULL,
    "memoryQaTotal" integer DEFAULT 0 NOT NULL,
    "memoryQaCorrect" integer DEFAULT 0 NOT NULL,
    passed boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.agent_autonomy_daily_metrics FORCE ROW LEVEL SECURITY;


--
-- Name: agent_autonomy_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_autonomy_policies (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text,
    "scopeKey" text NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    "allowedTools" text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "deniedTools" text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "highRiskApproval" boolean DEFAULT true NOT NULL,
    "createdBy" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT agent_autonomy_policies_level_check CHECK (((level >= 0) AND (level <= 4)))
);

ALTER TABLE ONLY public.agent_autonomy_policies FORCE ROW LEVEL SECURITY;


--
-- Name: agent_capability_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_capability_tokens (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "actorId" text NOT NULL,
    "tokenHash" text NOT NULL,
    actions text[],
    description text,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "lastUsedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.agent_capability_tokens FORCE ROW LEVEL SECURITY;


--
-- Name: agent_eval_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_eval_snapshots (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "agentType" public."AgentType" NOT NULL,
    "windowStart" timestamp(3) without time zone NOT NULL,
    "windowEnd" timestamp(3) without time zone NOT NULL,
    scores jsonb NOT NULL,
    "sampleSize" integer NOT NULL,
    coverage double precision NOT NULL,
    version text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.agent_eval_snapshots FORCE ROW LEVEL SECURITY;


--
-- Name: agent_experience_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_experience_cards (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "sourceReviewTaskId" text,
    "taskType" text,
    "entityType" text,
    category text NOT NULL,
    title text NOT NULL,
    lesson text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    "scoreImpact" double precision,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.agent_experience_cards FORCE ROW LEVEL SECURITY;


--
-- Name: agent_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_plans (
    id text NOT NULL,
    "conversationId" text NOT NULL,
    "organizationId" text NOT NULL,
    goal text NOT NULL,
    status text DEFAULT 'PLANNED'::text NOT NULL,
    plan jsonb NOT NULL,
    result jsonb,
    error jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.agent_plans FORCE ROW LEVEL SECURITY;


--
-- Name: agent_run_leases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_run_leases (
    "runId" text NOT NULL,
    "organizationId" text NOT NULL,
    "ownerId" text NOT NULL,
    "leaseUntil" timestamp(3) without time zone NOT NULL,
    "heartbeatAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT agent_run_leases_version_check CHECK ((version >= 0))
);

ALTER TABLE ONLY public.agent_run_leases FORCE ROW LEVEL SECURITY;


--
-- Name: agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_runs (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "userId" text NOT NULL,
    "agentType" public."AgentType" NOT NULL,
    provider text DEFAULT 'openai'::text NOT NULL,
    status public."AgentRunStatus" DEFAULT 'PENDING'::public."AgentRunStatus" NOT NULL,
    input jsonb NOT NULL,
    output jsonb,
    "errorCode" text,
    "errorMessage" text,
    "tokenUsage" jsonb,
    "costAmount" numeric(65,30),
    "startedAt" timestamp(3) without time zone,
    "finishedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    progress jsonb,
    "clientRequestId" text,
    attempt integer DEFAULT 1 NOT NULL,
    "lifecycleStatus" public."AgentLifecycleStatus" DEFAULT 'CREATED'::public."AgentLifecycleStatus" NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    "currentStep" text,
    "traceId" text,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT agent_runs_version_check CHECK ((version >= 0))
);

ALTER TABLE ONLY public.agent_runs FORCE ROW LEVEL SECURITY;


--
-- Name: agent_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_steps (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "runId" text NOT NULL,
    "stepKey" text NOT NULL,
    "stepType" text NOT NULL,
    "toolName" text,
    "toolCallId" text,
    status public."AgentStepStatus" DEFAULT 'PENDING'::public."AgentStepStatus" NOT NULL,
    "inputRef" text,
    "outputRef" text,
    attempt integer DEFAULT 1 NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    "errorCode" text,
    "errorMessage" text,
    "startedAt" timestamp(3) without time zone,
    "finishedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT agent_steps_attempt_check CHECK ((attempt > 0)),
    CONSTRAINT agent_steps_version_check CHECK ((version >= 0))
);

ALTER TABLE ONLY public.agent_steps FORCE ROW LEVEL SECURITY;


--
-- Name: agent_tool_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_tool_executions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "planId" text NOT NULL,
    "toolName" text NOT NULL,
    "toolVersion" text NOT NULL,
    status text DEFAULT 'PLANNED'::text NOT NULL,
    "riskLevel" text NOT NULL,
    "idempotencyKey" text NOT NULL,
    "inputHash" text NOT NULL,
    input jsonb NOT NULL,
    output jsonb,
    error jsonb,
    "startedAt" timestamp(3) without time zone,
    "finishedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.agent_tool_executions FORCE ROW LEVEL SECURITY;


--
-- Name: agent_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_transitions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "runId" text NOT NULL,
    "fromStatus" public."AgentLifecycleStatus",
    "toStatus" public."AgentLifecycleStatus" NOT NULL,
    "eventType" text NOT NULL,
    "eventKey" text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    attempt integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT agent_transitions_attempt_check CHECK ((attempt > 0))
);

ALTER TABLE ONLY public.agent_transitions FORCE ROW LEVEL SECURITY;


--
-- Name: agent_work_memories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_work_memories (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "agentRunId" text,
    "productId" text,
    "productName" text,
    "taskType" text NOT NULL,
    status text NOT NULL,
    score double precision,
    "reviewStatus" text,
    "reviewNotes" text,
    "durationSeconds" double precision DEFAULT 0 NOT NULL,
    result jsonb,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.agent_work_memories FORCE ROW LEVEL SECURITY;


--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    type public."AlertType" NOT NULL,
    severity public."AlertSeverity" DEFAULT 'WARNING'::public."AlertSeverity" NOT NULL,
    title text NOT NULL,
    description text,
    status public."AlertStatus" DEFAULT 'OPEN'::public."AlertStatus" NOT NULL,
    source text,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "resolvedAt" timestamp(3) without time zone
);

ALTER TABLE ONLY public.alerts FORCE ROW LEVEL SECURITY;


--
-- Name: approval_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_decisions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "actionProposalId" text NOT NULL,
    decision public."ApprovalDecisionType" NOT NULL,
    "actorId" text NOT NULL,
    "actorRole" text NOT NULL,
    reason text,
    "payloadHash" text NOT NULL,
    "sandboxReportId" text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.approval_decisions FORCE ROW LEVEL SECURITY;


--
-- Name: assistant_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_messages (
    id text NOT NULL,
    "sessionId" text NOT NULL,
    role public."MessageRole" NOT NULL,
    content text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.assistant_messages FORCE ROW LEVEL SECURITY;


--
-- Name: assistant_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_sessions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "userId" text NOT NULL,
    title text NOT NULL,
    "contextType" public."SessionContextType" DEFAULT 'GENERAL'::public."SessionContextType" NOT NULL,
    status public."SessionStatus" DEFAULT 'ACTIVE'::public."SessionStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "allowedDomains" text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "autonomyLevel" integer DEFAULT 1 NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "assistant_sessions_autonomyLevel_check" CHECK ((("autonomyLevel" >= 0) AND ("autonomyLevel" <= 4)))
);

ALTER TABLE ONLY public.assistant_sessions FORCE ROW LEVEL SECURITY;


--
-- Name: audit_archives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_archives (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    "objectKey" text NOT NULL,
    "contentHash" text NOT NULL,
    "entryCount" integer NOT NULL,
    "firstSequence" bigint NOT NULL,
    "lastSequence" bigint NOT NULL,
    "firstPreviousHash" text NOT NULL,
    "finalHash" text NOT NULL,
    "versionId" text NOT NULL,
    "objectLockMode" text NOT NULL,
    "retainUntil" timestamp(3) without time zone NOT NULL,
    "verifiedAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.audit_archives FORCE ROW LEVEL SECURITY;


--
-- Name: audit_chain_heads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_chain_heads (
    "organizationId" text NOT NULL,
    "lastSequence" bigint DEFAULT 0 NOT NULL,
    "lastHash" text NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.audit_chain_heads FORCE ROW LEVEL SECURITY;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "actorId" text NOT NULL,
    action text NOT NULL,
    "resourceType" text NOT NULL,
    "resourceId" text NOT NULL,
    before jsonb,
    after jsonb,
    ip text,
    "userAgent" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sequence bigint,
    "previousHash" text,
    "entryHash" text,
    "hashAlgorithm" text DEFAULT 'SHA-256'::text
);

ALTER TABLE ONLY public.audit_logs FORCE ROW LEVEL SECURITY;


--
-- Name: automation_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_flows (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    name text NOT NULL,
    description text,
    status public."AutomationFlowStatus" DEFAULT 'DRAFT'::public."AutomationFlowStatus" NOT NULL,
    "triggerType" public."TriggerType" NOT NULL,
    "triggerConfig" jsonb DEFAULT '{}'::jsonb NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    "successRate" double precision DEFAULT 0 NOT NULL,
    "lastRunAt" timestamp(3) without time zone,
    "nextRunAt" timestamp(3) without time zone,
    "createdBy" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dedupeKey" text
);

ALTER TABLE ONLY public.automation_flows FORCE ROW LEVEL SECURITY;


--
-- Name: automation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_runs (
    id text NOT NULL,
    "flowId" text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finishedAt" timestamp(3) without time zone,
    result jsonb,
    error jsonb,
    "leaseOwner" text,
    "leaseExpiresAt" timestamp(3) without time zone,
    attempt integer DEFAULT 0 NOT NULL,
    "traceId" text
);

ALTER TABLE ONLY public.automation_runs FORCE ROW LEVEL SECURITY;


--
-- Name: automation_step_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_step_executions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "automationRunId" text NOT NULL,
    "stepKey" text NOT NULL,
    "stepIndex" integer NOT NULL,
    action text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    attempt integer DEFAULT 0 NOT NULL,
    "leaseOwner" text,
    "leaseExpiresAt" timestamp(3) without time zone,
    result jsonb,
    error jsonb,
    "startedAt" timestamp(3) without time zone,
    "finishedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.automation_step_executions FORCE ROW LEVEL SECURITY;


--
-- Name: business_outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_outcomes (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "productId" text,
    "opportunityId" text,
    "listingDraftId" text,
    "publishSnapshotId" text,
    source text NOT NULL,
    "periodStart" timestamp(3) without time zone NOT NULL,
    "periodEnd" timestamp(3) without time zone NOT NULL,
    metrics jsonb NOT NULL,
    evidence jsonb NOT NULL,
    confidence double precision NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "agentRunId" text,
    "externalReference" text,
    CONSTRAINT business_outcomes_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision)))
);

ALTER TABLE ONLY public.business_outcomes FORCE ROW LEVEL SECURITY;


--
-- Name: channel_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_connections (
    id text NOT NULL,
    "workspaceId" text NOT NULL,
    provider text NOT NULL,
    "externalShopId" text,
    "accessTokenEncrypted" text NOT NULL,
    "refreshTokenEncrypted" text,
    "tokenExpiresAt" timestamp(3) without time zone,
    "syncStatus" public."ChannelSyncStatus" DEFAULT 'PENDING'::public."ChannelSyncStatus" NOT NULL,
    "lastSyncedAt" timestamp(3) without time zone
);

ALTER TABLE ONLY public.channel_connections FORCE ROW LEVEL SECURITY;


--
-- Name: dead_letter_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dead_letter_jobs (
    id text NOT NULL,
    "queueName" text NOT NULL,
    "jobId" text NOT NULL,
    data jsonb NOT NULL,
    "failedReason" text,
    "failedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "inspectedAt" timestamp(3) without time zone,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "organizationId" text,
    "failedAttempts" integer DEFAULT 0 NOT NULL,
    classification public."DeadLetterClassification" DEFAULT 'UNCLASSIFIED'::public."DeadLetterClassification" NOT NULL,
    "classificationReason" text,
    "replayEligible" boolean DEFAULT false NOT NULL,
    "classifiedAt" timestamp(3) without time zone,
    "classifiedBy" text,
    "resolutionStatus" public."DeadLetterResolutionStatus" DEFAULT 'OPEN'::public."DeadLetterResolutionStatus" NOT NULL,
    "replayRunId" text,
    "resolvedAt" timestamp(3) without time zone,
    "resolvedBy" text,
    "replayClaimedAt" timestamp(3) without time zone,
    "replayClaimedBy" text
);

ALTER TABLE ONLY public.dead_letter_jobs FORCE ROW LEVEL SECURITY;


--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_tokens (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: enterprise_slo_daily_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enterprise_slo_daily_snapshots (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    "totalTasks" integer DEFAULT 0 NOT NULL,
    "successfulTasks" integer DEFAULT 0 NOT NULL,
    "taskSuccessRate" double precision,
    "qualitySamples" integer DEFAULT 0 NOT NULL,
    "qualityPassed" integer DEFAULT 0 NOT NULL,
    "qualityPassRate" double precision,
    "autonomousCompletions" integer DEFAULT 0 NOT NULL,
    "autonomousCompletionRate" double precision,
    "totalSuggestions" integer DEFAULT 0 NOT NULL,
    "acceptedSuggestions" integer DEFAULT 0 NOT NULL,
    "suggestionAdoptionRate" double precision,
    "unauthorizedActionCount" integer DEFAULT 0 NOT NULL,
    "p95LatencyMs" integer,
    "queueBacklog" integer DEFAULT 0 NOT NULL,
    "queueEvidenceAvailable" boolean DEFAULT false NOT NULL,
    "unresolvedDeadLetters" integer DEFAULT 0 NOT NULL,
    "totalCostAmount" numeric(65,30) DEFAULT 0 NOT NULL,
    "costSampleCount" integer DEFAULT 0 NOT NULL,
    "averageCostPerTask" numeric(65,30),
    "errorBudgetConsumed" double precision,
    "dataComplete" boolean DEFAULT false NOT NULL,
    "missingEvidence" text[] DEFAULT ARRAY[]::text[],
    passed boolean DEFAULT false NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "blockedUnauthorizedAttemptCount" integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.enterprise_slo_daily_snapshots FORCE ROW LEVEL SECURITY;


--
-- Name: external_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_submissions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "productLaunchId" text NOT NULL,
    "publishSnapshotId" text NOT NULL,
    provider text DEFAULT 'OZON'::text NOT NULL,
    operation text DEFAULT 'PRODUCT_PUBLISH'::text NOT NULL,
    "idempotencyKey" text NOT NULL,
    "requestHash" text NOT NULL,
    status public."ExternalSubmissionStatus" DEFAULT 'PREPARED'::public."ExternalSubmissionStatus" NOT NULL,
    "attemptCount" integer DEFAULT 0 NOT NULL,
    request jsonb DEFAULT '{}'::jsonb NOT NULL,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    "externalTaskId" text,
    "externalProductId" text,
    "failureCode" text,
    "failureMessage" text,
    "requestSentAt" timestamp(3) without time zone,
    "acknowledgedAt" timestamp(3) without time zone,
    "resolvedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "payloadHash" text,
    "claimToken" text,
    "claimedAt" timestamp(3) without time zone,
    "responseReceivedAt" timestamp(3) without time zone,
    "reconciliationResult" jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE ONLY public.external_submissions FORCE ROW LEVEL SECURITY;


--
-- Name: feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_flags (
    id text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    "orgIds" text[] DEFAULT ARRAY[]::text[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: feedback_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback_signals (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "runId" text,
    "approvalId" text,
    "listingId" text,
    "snapshotId" text,
    "promptVersion" text,
    "modelVersion" text,
    "agentType" public."AgentType",
    "signalType" text NOT NULL,
    source text NOT NULL,
    "externalReference" text NOT NULL,
    value jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.feedback_signals FORCE ROW LEVEL SECURITY;


--
-- Name: file_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_assets (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "ownerId" text NOT NULL,
    filename text NOT NULL,
    "mimeType" text NOT NULL,
    size integer NOT NULL,
    "storageKey" text NOT NULL,
    "publicUrl" text,
    purpose public."FilePurpose" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sha256 text
);

ALTER TABLE ONLY public.file_assets FORCE ROW LEVEL SECURITY;


--
-- Name: image_prompt_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.image_prompt_projects (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    title text NOT NULL,
    "productId" text,
    mode public."ImageMode" DEFAULT 'SINGLE'::public."ImageMode" NOT NULL,
    prompt text,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    "generatedAssets" jsonb DEFAULT '[]'::jsonb NOT NULL,
    status public."ImageProjectStatus" DEFAULT 'DRAFT'::public."ImageProjectStatus" NOT NULL,
    "createdBy" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "referenceAssetId" text,
    "qaStatus" public."ImageQaStatus" DEFAULT 'PENDING'::public."ImageQaStatus" NOT NULL,
    "qaVersion" text DEFAULT 'visual-qa/v1'::text NOT NULL,
    "qaResult" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "qaCompletedAt" timestamp(3) without time zone
);

ALTER TABLE ONLY public.image_prompt_projects FORCE ROW LEVEL SECURITY;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    amount numeric(65,30) NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    plan text NOT NULL,
    "periodStart" timestamp(3) without time zone NOT NULL,
    "periodEnd" timestamp(3) without time zone NOT NULL,
    "paidAt" timestamp(3) without time zone,
    "stripeInvoiceId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.invoices FORCE ROW LEVEL SECURITY;


--
-- Name: keyword_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.keyword_reports (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    query text NOT NULL,
    platforms text[] DEFAULT ARRAY[]::text[],
    country text DEFAULT 'US'::text NOT NULL,
    "totalKeywords" integer,
    keywords jsonb DEFAULT '[]'::jsonb NOT NULL,
    charts jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdBy" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.keyword_reports FORCE ROW LEVEL SECURITY;


--
-- Name: knowledge_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_documents (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    title text NOT NULL,
    content text NOT NULL,
    "fileAssetId" text,
    tags text[] DEFAULT ARRAY[]::text[],
    visibility public."DocumentVisibility" DEFAULT 'ORGANIZATION'::public."DocumentVisibility" NOT NULL,
    "createdBy" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.knowledge_documents FORCE ROW LEVEL SECURITY;


--
-- Name: listing_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_drafts (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text NOT NULL,
    "productId" text,
    platform text NOT NULL,
    title text,
    bullets text[] DEFAULT ARRAY[]::text[],
    description text,
    "seoTags" text[] DEFAULT ARRAY[]::text[],
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    status public."ListingStatus" DEFAULT 'DRAFT'::public."ListingStatus" NOT NULL,
    score double precision,
    "createdBy" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "schemaVersion" text DEFAULT 'listing-bundle/v1'::text NOT NULL,
    bundle jsonb DEFAULT '{}'::jsonb NOT NULL,
    "validationResult" jsonb DEFAULT '{}'::jsonb NOT NULL,
    provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    "evaluationResult" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "contentHash" text,
    "productLaunchId" text,
    "approvalHash" text
);

ALTER TABLE ONLY public.listing_drafts FORCE ROW LEVEL SECURITY;


--
-- Name: listing_publish_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_publish_snapshots (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "productLaunchId" text NOT NULL,
    "listingDraftId" text NOT NULL,
    "reviewTaskId" text NOT NULL,
    "productId" text NOT NULL,
    "channelId" text NOT NULL,
    target text DEFAULT 'OZON'::text NOT NULL,
    "schemaVersion" text DEFAULT 'listing-publish-snapshot/v2'::text NOT NULL,
    "listingApprovalHash" text NOT NULL,
    snapshot jsonb NOT NULL,
    "snapshotHash" text NOT NULL,
    status public."ListingPublishSnapshotStatus" DEFAULT 'APPROVED'::public."ListingPublishSnapshotStatus" NOT NULL,
    "approvedBy" text NOT NULL,
    "approvedAt" timestamp(3) without time zone NOT NULL,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    "failureCode" text,
    "failureMessage" text,
    "submittedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.listing_publish_snapshots FORCE ROW LEVEL SECURITY;


--
-- Name: listing_sandbox_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_sandbox_reports (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "publishSnapshotId" text NOT NULL,
    "snapshotHash" text NOT NULL,
    target text DEFAULT 'OZON'::text NOT NULL,
    "policyVersion" text NOT NULL,
    status public."ListingSandboxStatus" NOT NULL,
    "riskLevel" public."ListingSandboxRiskLevel" NOT NULL,
    blocking boolean DEFAULT false NOT NULL,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    "evaluatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "overriddenBy" text,
    "overrideReason" text,
    "overriddenAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.listing_sandbox_reports FORCE ROW LEVEL SECURITY;


--
-- Name: market_observation_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_observation_batches (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    "workspaceId" text,
    source text NOT NULL,
    "pageType" text NOT NULL,
    "pageUrl" text NOT NULL,
    query text,
    category text,
    "capturedAt" timestamp(3) without time zone NOT NULL,
    locale text,
    "pageTitle" text,
    "pageFingerprint" text NOT NULL,
    "parserVersion" text NOT NULL,
    "extensionVersion" text,
    "rawEvidence" jsonb NOT NULL,
    confidence double precision NOT NULL,
    "requiresReview" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT market_observation_batches_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision)))
);

ALTER TABLE ONLY public.market_observation_batches FORCE ROW LEVEL SECURITY;


--
-- Name: market_observation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_observation_items (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "batchId" text NOT NULL,
    "externalId" text,
    "offerId" text,
    title text NOT NULL,
    url text NOT NULL,
    "imageUrl" text,
    brand text,
    category text,
    "sellerName" text,
    "currentPrice" numeric(65,30),
    "originalPrice" numeric(65,30),
    currency text,
    rating double precision,
    "reviewCount" integer,
    "displayedSalesText" text,
    "position" integer,
    badges jsonb DEFAULT '[]'::jsonb NOT NULL,
    "deliveryText" text,
    "promotionText" text,
    sponsored boolean,
    "rawEvidence" jsonb NOT NULL,
    "evidenceHash" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.market_observation_items FORCE ROW LEVEL SECURITY;


--
-- Name: marketplace_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_orders (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text NOT NULL,
    "channelId" text,
    provider text NOT NULL,
    "fulfillmentType" text,
    "externalOrderId" text,
    "externalPostingNumber" text NOT NULL,
    status text NOT NULL,
    "orderedAt" timestamp(3) without time zone,
    "deliveredAt" timestamp(3) without time zone,
    currency text DEFAULT 'RUB'::text NOT NULL,
    "totalAmount" numeric(65,30) DEFAULT 0 NOT NULL,
    "itemCount" integer DEFAULT 0 NOT NULL,
    raw jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.marketplace_orders FORCE ROW LEVEL SECURITY;


--
-- Name: mcp_tool_invocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_tool_invocations (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "actorId" text NOT NULL,
    action text NOT NULL,
    "toolName" text NOT NULL,
    status public."McpInvocationStatus" DEFAULT 'RUNNING'::public."McpInvocationStatus" NOT NULL,
    input jsonb NOT NULL,
    output jsonb,
    "durationMs" integer,
    "errorCode" text,
    "errorMessage" text,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finishedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.mcp_tool_invocations FORCE ROW LEVEL SECURITY;


--
-- Name: memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memberships (
    id text NOT NULL,
    "userId" text NOT NULL,
    "organizationId" text NOT NULL,
    role public."MembershipRole" NOT NULL,
    status public."MembershipStatus" DEFAULT 'ACTIVE'::public."MembershipStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.memberships FORCE ROW LEVEL SECURITY;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    type public."NotificationType" NOT NULL,
    title text NOT NULL,
    body text,
    "readAt" timestamp(3) without time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.notifications FORCE ROW LEVEL SECURITY;


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    plan public."Plan" DEFAULT 'FREE'::public."Plan" NOT NULL,
    "trialEndsAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "stripeCustomerId" text
);


--
-- Name: outbox_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbox_events (
    id text NOT NULL,
    "dedupeKey" text NOT NULL,
    "organizationId" text,
    "aggregateType" text NOT NULL,
    "aggregateId" text NOT NULL,
    "eventType" text NOT NULL,
    payload jsonb NOT NULL,
    status public."OutboxStatus" DEFAULT 'PENDING'::public."OutboxStatus" NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "nextRetryAt" timestamp(3) without time zone,
    "lockedAt" timestamp(3) without time zone,
    "lockedBy" text,
    "lastError" text,
    "publishedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.outbox_events FORCE ROW LEVEL SECURITY;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: policy_rule_hits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_rule_hits (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "sandboxReportId" text NOT NULL,
    "ruleCode" text NOT NULL,
    category text NOT NULL,
    severity public."ListingSandboxRiskLevel" NOT NULL,
    blocking boolean DEFAULT false NOT NULL,
    message text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.policy_rule_hits FORCE ROW LEVEL SECURITY;


--
-- Name: product_candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_candidates (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "researchRunId" text NOT NULL,
    "legacyReportId" text,
    fingerprint text NOT NULL,
    "canonicalName" text NOT NULL,
    "productType" text NOT NULL,
    material text,
    "primaryUse" text,
    "customizationMethod" text,
    "targetAudience" text,
    market text,
    "sourceCount" integer DEFAULT 0 NOT NULL,
    "signalStrength" public."ProductSignalStrength" DEFAULT 'INVALID'::public."ProductSignalStrength" NOT NULL,
    "confidenceScore" double precision,
    "dataCompleteness" double precision DEFAULT 0 NOT NULL,
    status public."ProductCandidateStatus" DEFAULT 'DISCOVERED'::public."ProductCandidateStatus" NOT NULL,
    "firstSeenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastSeenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "rawSummary" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.product_candidates FORCE ROW LEVEL SECURITY;


--
-- Name: product_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_feedback (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text NOT NULL,
    "candidateId" text NOT NULL,
    "productId" text,
    "listingDraftId" text,
    "productLaunchId" text,
    "eventType" text NOT NULL,
    "eventAt" timestamp(3) without time zone NOT NULL,
    value numeric(65,30),
    currency text,
    source text NOT NULL,
    "externalReference" text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.product_feedback FORCE ROW LEVEL SECURITY;


--
-- Name: product_launches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_launches (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "reviewTaskId" text NOT NULL,
    "reportId" text NOT NULL,
    "candidateId" text NOT NULL,
    "candidateIndex" integer NOT NULL,
    "productId" text,
    "imageProjectId" text,
    "agentRunId" text,
    "channelId" text,
    status public."ProductLaunchStatus" DEFAULT 'QUEUED'::public."ProductLaunchStatus" NOT NULL,
    "confirmAutoPublish" boolean DEFAULT false NOT NULL,
    "requestedBy" text NOT NULL,
    "failureCode" text,
    "failureMessage" text,
    execution jsonb DEFAULT '{}'::jsonb NOT NULL,
    "startedAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "imageGenerationApproved" boolean DEFAULT false NOT NULL,
    "listingDraftId" text,
    "publishReviewTaskId" text,
    "approvedContentHash" text,
    "publishApprovedBy" text,
    "publishApprovedAt" timestamp(3) without time zone,
    "referenceAssetId" text,
    "referenceAssetSha256" text,
    "selectedPublishSnapshotId" text,
    "approvedPublishSnapshotHash" text,
    "publishExecutionGrantHash" text,
    "publishExecutionGrantScope" text,
    "publishExecutionGrantSnapshotHash" text,
    "publishExecutionGrantExpiresAt" timestamp(3) without time zone,
    "publishExecutionGrantConsumedAt" timestamp(3) without time zone
);

ALTER TABLE ONLY public.product_launches FORCE ROW LEVEL SECURITY;


--
-- Name: product_opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_opportunities (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "observationItemId" text NOT NULL,
    title text NOT NULL,
    "externalId" text,
    "sourceUrl" text NOT NULL,
    status text DEFAULT 'CANDIDATE'::text NOT NULL,
    score double precision,
    decision text,
    dimensions jsonb NOT NULL,
    reasons jsonb NOT NULL,
    risks jsonb NOT NULL,
    "missingEvidence" jsonb NOT NULL,
    sources jsonb NOT NULL,
    "scoringVersion" text NOT NULL,
    "evidenceConfidence" double precision NOT NULL,
    "createdBy" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "product_opportunities_evidenceConfidence_check" CHECK ((("evidenceConfidence" >= (0)::double precision) AND ("evidenceConfidence" <= (1)::double precision)))
);

ALTER TABLE ONLY public.product_opportunities FORCE ROW LEVEL SECURITY;


--
-- Name: product_research_candidate_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_research_candidate_decisions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "reportId" text NOT NULL,
    "workspaceId" text,
    "candidateIndex" integer NOT NULL,
    status public."ResearchCandidateDecisionStatus" NOT NULL,
    reason text,
    "actorId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "candidateId" text
);

ALTER TABLE ONLY public.product_research_candidate_decisions FORCE ROW LEVEL SECURITY;


--
-- Name: product_research_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_research_reports (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    query text NOT NULL,
    platform text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    summary text,
    opportunities jsonb,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    "createdBy" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "researchRunId" text
);

ALTER TABLE ONLY public.product_research_reports FORCE ROW LEVEL SECURITY;


--
-- Name: product_research_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_research_runs (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "workspaceScopeKey" text DEFAULT 'ORG'::text NOT NULL,
    "automationRunId" text,
    "parentRunId" text,
    "businessDate" date NOT NULL,
    "scheduleTimezone" text DEFAULT 'Asia/Shanghai'::text NOT NULL,
    trigger public."ProductResearchRunTrigger" NOT NULL,
    attempt integer DEFAULT 0 NOT NULL,
    status public."ProductResearchRunStatus" DEFAULT 'PENDING'::public."ProductResearchRunStatus" NOT NULL,
    "currentStage" public."ProductResearchStage",
    "partialData" boolean DEFAULT false NOT NULL,
    "configSnapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "configVersion" text NOT NULL,
    "scoringVersionId" text,
    "candidateLimit" integer DEFAULT 300 NOT NULL,
    "topLimit" integer DEFAULT 10 NOT NULL,
    "startedAt" timestamp(3) without time zone,
    "finishedAt" timestamp(3) without time zone,
    "errorSummary" jsonb,
    "createdBy" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.product_research_runs FORCE ROW LEVEL SECURITY;


--
-- Name: product_research_source_health; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_research_source_health (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "researchRunId" text,
    source text NOT NULL,
    status public."ProductResearchSourceStatus" NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "requestedAt" timestamp(3) without time zone,
    "finishedAt" timestamp(3) without time zone,
    "lastSuccessAt" timestamp(3) without time zone,
    "itemCount" integer DEFAULT 0 NOT NULL,
    "latencyMs" integer,
    "dataFreshnessSeconds" integer,
    "httpStatus" integer,
    "errorCode" text,
    "errorMessage" text,
    "budgetUsed" numeric(65,30),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.product_research_source_health FORCE ROW LEVEL SECURITY;


--
-- Name: product_research_stage_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_research_stage_runs (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "researchRunId" text NOT NULL,
    stage public."ProductResearchStage" NOT NULL,
    status public."ProductResearchStageStatus" DEFAULT 'PENDING'::public."ProductResearchStageStatus" NOT NULL,
    attempt integer DEFAULT 0 NOT NULL,
    "inputSnapshot" jsonb,
    "outputSummary" jsonb,
    "startedAt" timestamp(3) without time zone,
    "finishedAt" timestamp(3) without time zone,
    "errorCode" text,
    "errorMessage" text,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.product_research_stage_runs FORCE ROW LEVEL SECURITY;


--
-- Name: product_risk_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_risk_records (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "researchRunId" text NOT NULL,
    "candidateId" text NOT NULL,
    "riskType" text NOT NULL,
    severity public."ProductRiskSeverity" NOT NULL,
    "ruleVersion" text NOT NULL,
    "matchedTerm" text,
    evidence jsonb NOT NULL,
    source text,
    "reviewStatus" public."ProductRiskReviewStatus" DEFAULT 'AUTO'::public."ProductRiskReviewStatus" NOT NULL,
    "reviewTaskId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.product_risk_records FORCE ROW LEVEL SECURITY;


--
-- Name: product_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_scores (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "researchRunId" text NOT NULL,
    "candidateId" text NOT NULL,
    "scoringVersionId" text NOT NULL,
    "componentScores" jsonb NOT NULL,
    "rawTotal" numeric(65,30) NOT NULL,
    "finalScore" numeric(65,30) NOT NULL,
    "hardGateStatus" text NOT NULL,
    "hardGateReasons" text[] DEFAULT ARRAY[]::text[],
    "confidenceScore" double precision NOT NULL,
    "missingDataPenalties" jsonb DEFAULT '[]'::jsonb NOT NULL,
    rank integer,
    decision public."ProductResearchDecision" NOT NULL,
    explanation jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.product_scores FORCE ROW LEVEL SECURITY;


--
-- Name: product_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_signals (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "researchRunId" text NOT NULL,
    "candidateId" text NOT NULL,
    source text NOT NULL,
    provider text NOT NULL,
    "externalId" text,
    url text,
    market text,
    "metricName" text NOT NULL,
    "metricValue" numeric(65,30),
    unit text,
    "observedAt" timestamp(3) without time zone NOT NULL,
    "fetchedAt" timestamp(3) without time zone NOT NULL,
    quality public."ProductSignalQuality" NOT NULL,
    "rawSnapshotRef" text,
    "rawData" jsonb,
    "sourceHash" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.product_signals FORCE ROW LEVEL SECURITY;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id text NOT NULL,
    "workspaceId" text NOT NULL,
    title text NOT NULL,
    sku text,
    "asinOrExternalId" text,
    images text[],
    cost numeric(65,30) DEFAULT 0 NOT NULL,
    price numeric(65,30) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    status public."ProductStatus" DEFAULT 'DRAFT'::public."ProductStatus" NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.products FORCE ROW LEVEL SECURITY;


--
-- Name: profit_calculations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profit_calculations (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "productId" text,
    currency text DEFAULT 'USD'::text NOT NULL,
    "salePrice" numeric(65,30) DEFAULT 0 NOT NULL,
    "productCost" numeric(65,30) DEFAULT 0 NOT NULL,
    "packagingCost" numeric(65,30) DEFAULT 0 NOT NULL,
    "shippingCost" numeric(65,30) DEFAULT 0 NOT NULL,
    "platformFee" numeric(65,30) DEFAULT 0 NOT NULL,
    "paymentFee" numeric(65,30) DEFAULT 0 NOT NULL,
    "adCost" numeric(65,30) DEFAULT 0 NOT NULL,
    "storageCost" numeric(65,30) DEFAULT 0 NOT NULL,
    "otherCost" numeric(65,30) DEFAULT 0 NOT NULL,
    "totalCost" numeric(65,30) DEFAULT 0 NOT NULL,
    "estimatedProfit" numeric(65,30) DEFAULT 0 NOT NULL,
    "profitMargin" double precision DEFAULT 0 NOT NULL,
    roi double precision DEFAULT 0 NOT NULL,
    scenarios jsonb DEFAULT '[]'::jsonb NOT NULL,
    "createdBy" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.profit_calculations FORCE ROW LEVEL SECURITY;


--
-- Name: prompt_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompt_templates (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    title text NOT NULL,
    description text,
    category text NOT NULL,
    content text NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb NOT NULL,
    "usageCount" integer DEFAULT 0 NOT NULL,
    "createdBy" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.prompt_templates FORCE ROW LEVEL SECURITY;


--
-- Name: prompt_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompt_versions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "agentType" public."AgentType" NOT NULL,
    version text NOT NULL,
    "templateRef" text NOT NULL,
    "contentHash" text NOT NULL,
    "routingWeight" double precision DEFAULT 0 NOT NULL,
    status public."PromptVersionStatus" DEFAULT 'DRAFT'::public."PromptVersionStatus" NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdBy" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "activatedAt" timestamp(3) without time zone
);

ALTER TABLE ONLY public.prompt_versions FORCE ROW LEVEL SECURITY;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: replenishment_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.replenishment_plans (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text NOT NULL,
    "supplySkuId" text NOT NULL,
    "recommendedQty" integer NOT NULL,
    "requestedQty" integer NOT NULL,
    "reorderPoint" integer NOT NULL,
    "projectedDaysLeft" double precision,
    status public."ReplenishmentPlanStatus" DEFAULT 'DRAFT'::public."ReplenishmentPlanStatus" NOT NULL,
    "inputSnapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
    rationale jsonb DEFAULT '{}'::jsonb NOT NULL,
    "reviewTaskId" text,
    "createdBy" text NOT NULL,
    "approvedBy" text,
    "approvedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.replenishment_plans FORCE ROW LEVEL SECURITY;


--
-- Name: research_report_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.research_report_artifacts (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "researchRunId" text NOT NULL,
    "artifactType" public."ResearchArtifactType" NOT NULL,
    "schemaVersion" text NOT NULL,
    "storageKey" text NOT NULL,
    "contentHash" text NOT NULL,
    "byteSize" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.research_report_artifacts FORCE ROW LEVEL SECURITY;


--
-- Name: review_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_tasks (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "entityType" public."ReviewEntityType" NOT NULL,
    "entityId" text NOT NULL,
    status public."ReviewStatus" DEFAULT 'PENDING'::public."ReviewStatus" NOT NULL,
    score double precision,
    threshold double precision DEFAULT 60.0 NOT NULL,
    "autoApproved" boolean DEFAULT false NOT NULL,
    "autoRegenerations" integer DEFAULT 0 NOT NULL,
    "assignedTo" text,
    notes text,
    "reviewedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "approvalScope" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "decisionEvidence" jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE ONLY public.review_tasks FORCE ROW LEVEL SECURITY;


--
-- Name: router_decision_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.router_decision_logs (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "runId" text NOT NULL,
    "decisionKey" text NOT NULL,
    "agentType" public."AgentType" NOT NULL,
    "selectedModel" text NOT NULL,
    "selectedPromptVersion" text,
    reason jsonb NOT NULL,
    "latencyMs" integer,
    "costAmount" numeric(65,30),
    "qualityScore" double precision,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.router_decision_logs FORCE ROW LEVEL SECURITY;


--
-- Name: scoring_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scoring_versions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    "workspaceScopeKey" text DEFAULT 'ORG'::text NOT NULL,
    version text NOT NULL,
    status public."ScoringVersionStatus" DEFAULT 'DRAFT'::public."ScoringVersionStatus" NOT NULL,
    weights jsonb NOT NULL,
    thresholds jsonb NOT NULL,
    reason text NOT NULL,
    "basedOnVersionId" text,
    "createdBy" text NOT NULL,
    "activatedBy" text,
    "activatedAt" timestamp(3) without time zone,
    "retiredAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.scoring_versions FORCE ROW LEVEL SECURITY;


--
-- Name: sops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sops (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    title text NOT NULL,
    description text,
    status public."SopStatus" DEFAULT 'DRAFT'::public."SopStatus" NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    "createdBy" text NOT NULL,
    "publishedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.sops FORCE ROW LEVEL SECURITY;


--
-- Name: store_agent_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_agent_profiles (
    id text NOT NULL,
    "workspaceId" text NOT NULL,
    "targetCategories" text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "forbiddenTerms" text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "minimumProfitMargin" double precision,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.store_agent_profiles FORCE ROW LEVEL SECURITY;


--
-- Name: store_metric_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_metric_snapshots (
    id text NOT NULL,
    "workspaceId" text NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    "healthScore" double precision,
    orders integer DEFAULT 0 NOT NULL,
    revenue numeric(65,30) DEFAULT 0 NOT NULL,
    "conversionRate" double precision,
    acos double precision,
    "reviewRate" double precision,
    "refundRate" double precision,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE ONLY public.store_metric_snapshots FORCE ROW LEVEL SECURITY;


--
-- Name: stripe_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_webhook_events (
    id text NOT NULL,
    provider text DEFAULT 'STRIPE'::text NOT NULL,
    "providerEventId" text NOT NULL,
    livemode boolean NOT NULL,
    "eventType" text NOT NULL,
    "objectId" text,
    "resolvedOrganizationId" text,
    "processedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    name text NOT NULL,
    code text,
    currency text DEFAULT 'USD'::text NOT NULL,
    contact jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text,
    status public."SupplyRecordStatus" DEFAULT 'ACTIVE'::public."SupplyRecordStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.suppliers FORCE ROW LEVEL SECURITY;


--
-- Name: supply_skus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supply_skus (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text NOT NULL,
    "productId" text,
    "supplierId" text NOT NULL,
    sku text NOT NULL,
    "productName" text NOT NULL,
    "unitCost" numeric(18,4) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    moq integer DEFAULT 1 NOT NULL,
    "leadTimeDays" integer DEFAULT 0 NOT NULL,
    "safetyStock" integer DEFAULT 0 NOT NULL,
    "currentStock" integer DEFAULT 0 NOT NULL,
    "dailySalesAvg" double precision DEFAULT 0 NOT NULL,
    status public."SupplyRecordStatus" DEFAULT 'ACTIVE'::public."SupplyRecordStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.supply_skus FORCE ROW LEVEL SECURITY;


--
-- Name: team_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_tasks (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    title text NOT NULL,
    description text,
    "assigneeId" text,
    priority public."TaskPriority" DEFAULT 'MEDIUM'::public."TaskPriority" NOT NULL,
    status public."TaskStatus" DEFAULT 'TODO'::public."TaskStatus" NOT NULL,
    "dueAt" timestamp(3) without time zone,
    "createdBy" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.team_tasks FORCE ROW LEVEL SECURITY;


--
-- Name: training_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_jobs (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "agentType" public."AgentType" NOT NULL,
    status public."TrainingJobStatus" DEFAULT 'DRAFT'::public."TrainingJobStatus" NOT NULL,
    "datasetRef" text NOT NULL,
    "inputHash" text NOT NULL,
    "requestedBy" text NOT NULL,
    "approvedBy" text,
    result jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "startedAt" timestamp(3) without time zone,
    "finishedAt" timestamp(3) without time zone
);

ALTER TABLE ONLY public.training_jobs FORCE ROW LEVEL SECURITY;


--
-- Name: trend_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trend_insights (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workspaceId" text,
    market text,
    category text,
    keyword text NOT NULL,
    score double precision DEFAULT 0 NOT NULL,
    "growthRate" double precision,
    source text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    "observedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.trend_insights FORCE ROW LEVEL SECURITY;


--
-- Name: user_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_consents (
    id text NOT NULL,
    "userId" text NOT NULL,
    type text NOT NULL,
    version text NOT NULL,
    "consentedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ip text
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    "passwordHash" text NOT NULL,
    name text NOT NULL,
    "avatarUrl" text,
    locale text DEFAULT 'zh-CN'::text NOT NULL,
    timezone text DEFAULT 'Asia/Shanghai'::text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "emailVerifiedAt" timestamp(3) without time zone,
    "twoFactorEnabled" boolean DEFAULT false NOT NULL,
    "twoFactorSecret" text,
    "failedLoginAttempts" integer DEFAULT 0 NOT NULL,
    "lockedUntil" timestamp(3) without time zone,
    "lastFailedLoginAt" timestamp(3) without time zone
);


--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "channelType" public."ChannelType" NOT NULL,
    marketplace text,
    currency text DEFAULT 'USD'::text NOT NULL,
    timezone text DEFAULT 'Asia/Shanghai'::text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.workspaces FORCE ROW LEVEL SECURITY;


--
-- Name: action_proposals action_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_proposals
    ADD CONSTRAINT action_proposals_pkey PRIMARY KEY (id);


--
-- Name: agent_autonomy_daily_metrics agent_autonomy_daily_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_autonomy_daily_metrics
    ADD CONSTRAINT agent_autonomy_daily_metrics_pkey PRIMARY KEY (id);


--
-- Name: agent_autonomy_policies agent_autonomy_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_autonomy_policies
    ADD CONSTRAINT agent_autonomy_policies_pkey PRIMARY KEY (id);


--
-- Name: agent_capability_tokens agent_capability_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_capability_tokens
    ADD CONSTRAINT agent_capability_tokens_pkey PRIMARY KEY (id);


--
-- Name: agent_eval_snapshots agent_eval_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_eval_snapshots
    ADD CONSTRAINT agent_eval_snapshots_pkey PRIMARY KEY (id);


--
-- Name: agent_experience_cards agent_experience_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_experience_cards
    ADD CONSTRAINT agent_experience_cards_pkey PRIMARY KEY (id);


--
-- Name: agent_plans agent_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_plans
    ADD CONSTRAINT agent_plans_pkey PRIMARY KEY (id);


--
-- Name: agent_run_leases agent_run_leases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_run_leases
    ADD CONSTRAINT agent_run_leases_pkey PRIMARY KEY ("runId");


--
-- Name: agent_runs agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_pkey PRIMARY KEY (id);


--
-- Name: agent_steps agent_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_steps
    ADD CONSTRAINT agent_steps_pkey PRIMARY KEY (id);


--
-- Name: agent_tool_executions agent_tool_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tool_executions
    ADD CONSTRAINT agent_tool_executions_pkey PRIMARY KEY (id);


--
-- Name: agent_transitions agent_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_transitions
    ADD CONSTRAINT agent_transitions_pkey PRIMARY KEY (id);


--
-- Name: agent_work_memories agent_work_memories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_work_memories
    ADD CONSTRAINT agent_work_memories_pkey PRIMARY KEY (id);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: approval_decisions approval_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_decisions
    ADD CONSTRAINT approval_decisions_pkey PRIMARY KEY (id);


--
-- Name: assistant_messages assistant_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_messages
    ADD CONSTRAINT assistant_messages_pkey PRIMARY KEY (id);


--
-- Name: assistant_sessions assistant_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_sessions
    ADD CONSTRAINT assistant_sessions_pkey PRIMARY KEY (id);


--
-- Name: audit_archives audit_archives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_archives
    ADD CONSTRAINT audit_archives_pkey PRIMARY KEY (id);


--
-- Name: audit_chain_heads audit_chain_heads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_chain_heads
    ADD CONSTRAINT audit_chain_heads_pkey PRIMARY KEY ("organizationId");


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: automation_flows automation_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_flows
    ADD CONSTRAINT automation_flows_pkey PRIMARY KEY (id);


--
-- Name: automation_runs automation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_pkey PRIMARY KEY (id);


--
-- Name: automation_step_executions automation_step_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_step_executions
    ADD CONSTRAINT automation_step_executions_pkey PRIMARY KEY (id);


--
-- Name: business_outcomes business_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_outcomes
    ADD CONSTRAINT business_outcomes_pkey PRIMARY KEY (id);


--
-- Name: channel_connections channel_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_connections
    ADD CONSTRAINT channel_connections_pkey PRIMARY KEY (id);


--
-- Name: dead_letter_jobs dead_letter_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dead_letter_jobs
    ADD CONSTRAINT dead_letter_jobs_pkey PRIMARY KEY (id);


--
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


--
-- Name: enterprise_slo_daily_snapshots enterprise_slo_daily_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enterprise_slo_daily_snapshots
    ADD CONSTRAINT enterprise_slo_daily_snapshots_pkey PRIMARY KEY (id);


--
-- Name: external_submissions external_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_submissions
    ADD CONSTRAINT external_submissions_pkey PRIMARY KEY (id);


--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (id);


--
-- Name: feedback_signals feedback_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_signals
    ADD CONSTRAINT feedback_signals_pkey PRIMARY KEY (id);


--
-- Name: file_assets file_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_assets
    ADD CONSTRAINT file_assets_pkey PRIMARY KEY (id);


--
-- Name: image_prompt_projects image_prompt_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_prompt_projects
    ADD CONSTRAINT image_prompt_projects_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: keyword_reports keyword_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_reports
    ADD CONSTRAINT keyword_reports_pkey PRIMARY KEY (id);


--
-- Name: knowledge_documents knowledge_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_pkey PRIMARY KEY (id);


--
-- Name: listing_drafts listing_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_drafts
    ADD CONSTRAINT listing_drafts_pkey PRIMARY KEY (id);


--
-- Name: listing_publish_snapshots listing_publish_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_publish_snapshots
    ADD CONSTRAINT listing_publish_snapshots_pkey PRIMARY KEY (id);


--
-- Name: listing_sandbox_reports listing_sandbox_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_sandbox_reports
    ADD CONSTRAINT listing_sandbox_reports_pkey PRIMARY KEY (id);


--
-- Name: market_observation_batches market_observation_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_observation_batches
    ADD CONSTRAINT market_observation_batches_pkey PRIMARY KEY (id);


--
-- Name: market_observation_items market_observation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_observation_items
    ADD CONSTRAINT market_observation_items_pkey PRIMARY KEY (id);


--
-- Name: marketplace_orders marketplace_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_orders
    ADD CONSTRAINT marketplace_orders_pkey PRIMARY KEY (id);


--
-- Name: mcp_tool_invocations mcp_tool_invocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tool_invocations
    ADD CONSTRAINT mcp_tool_invocations_pkey PRIMARY KEY (id);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: outbox_events outbox_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: policy_rule_hits policy_rule_hits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_rule_hits
    ADD CONSTRAINT policy_rule_hits_pkey PRIMARY KEY (id);


--
-- Name: product_candidates product_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_candidates
    ADD CONSTRAINT product_candidates_pkey PRIMARY KEY (id);


--
-- Name: product_feedback product_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_feedback
    ADD CONSTRAINT product_feedback_pkey PRIMARY KEY (id);


--
-- Name: product_launches product_launches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_launches
    ADD CONSTRAINT product_launches_pkey PRIMARY KEY (id);


--
-- Name: product_opportunities product_opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_opportunities
    ADD CONSTRAINT product_opportunities_pkey PRIMARY KEY (id);


--
-- Name: product_research_candidate_decisions product_research_candidate_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_candidate_decisions
    ADD CONSTRAINT product_research_candidate_decisions_pkey PRIMARY KEY (id);


--
-- Name: product_research_reports product_research_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_reports
    ADD CONSTRAINT product_research_reports_pkey PRIMARY KEY (id);


--
-- Name: product_research_runs product_research_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_runs
    ADD CONSTRAINT product_research_runs_pkey PRIMARY KEY (id);


--
-- Name: product_research_source_health product_research_source_health_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_source_health
    ADD CONSTRAINT product_research_source_health_pkey PRIMARY KEY (id);


--
-- Name: product_research_stage_runs product_research_stage_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_stage_runs
    ADD CONSTRAINT product_research_stage_runs_pkey PRIMARY KEY (id);


--
-- Name: product_risk_records product_risk_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_risk_records
    ADD CONSTRAINT product_risk_records_pkey PRIMARY KEY (id);


--
-- Name: product_scores product_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_scores
    ADD CONSTRAINT product_scores_pkey PRIMARY KEY (id);


--
-- Name: product_signals product_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_signals
    ADD CONSTRAINT product_signals_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profit_calculations profit_calculations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profit_calculations
    ADD CONSTRAINT profit_calculations_pkey PRIMARY KEY (id);


--
-- Name: prompt_templates prompt_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_templates
    ADD CONSTRAINT prompt_templates_pkey PRIMARY KEY (id);


--
-- Name: prompt_versions prompt_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_versions
    ADD CONSTRAINT prompt_versions_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: replenishment_plans replenishment_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replenishment_plans
    ADD CONSTRAINT replenishment_plans_pkey PRIMARY KEY (id);


--
-- Name: research_report_artifacts research_report_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_report_artifacts
    ADD CONSTRAINT research_report_artifacts_pkey PRIMARY KEY (id);


--
-- Name: review_tasks review_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_tasks
    ADD CONSTRAINT review_tasks_pkey PRIMARY KEY (id);


--
-- Name: router_decision_logs router_decision_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.router_decision_logs
    ADD CONSTRAINT router_decision_logs_pkey PRIMARY KEY (id);


--
-- Name: scoring_versions scoring_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoring_versions
    ADD CONSTRAINT scoring_versions_pkey PRIMARY KEY (id);


--
-- Name: sops sops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sops
    ADD CONSTRAINT sops_pkey PRIMARY KEY (id);


--
-- Name: store_agent_profiles store_agent_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_agent_profiles
    ADD CONSTRAINT store_agent_profiles_pkey PRIMARY KEY (id);


--
-- Name: store_metric_snapshots store_metric_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_metric_snapshots
    ADD CONSTRAINT store_metric_snapshots_pkey PRIMARY KEY (id);


--
-- Name: stripe_webhook_events stripe_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: supply_skus supply_skus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_skus
    ADD CONSTRAINT supply_skus_pkey PRIMARY KEY (id);


--
-- Name: team_tasks team_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_tasks
    ADD CONSTRAINT team_tasks_pkey PRIMARY KEY (id);


--
-- Name: training_jobs training_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_jobs
    ADD CONSTRAINT training_jobs_pkey PRIMARY KEY (id);


--
-- Name: trend_insights trend_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trend_insights
    ADD CONSTRAINT trend_insights_pkey PRIMARY KEY (id);


--
-- Name: user_consents user_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_consents
    ADD CONSTRAINT user_consents_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: action_proposals_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "action_proposals_createdAt_idx" ON public.action_proposals USING btree ("createdAt");


--
-- Name: action_proposals_executionGrantExpiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "action_proposals_executionGrantExpiresAt_idx" ON public.action_proposals USING btree ("executionGrantExpiresAt");


--
-- Name: action_proposals_executionGrantHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "action_proposals_executionGrantHash_key" ON public.action_proposals USING btree ("executionGrantHash");


--
-- Name: action_proposals_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "action_proposals_expiresAt_idx" ON public.action_proposals USING btree ("expiresAt");


--
-- Name: action_proposals_notificationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "action_proposals_notificationId_key" ON public.action_proposals USING btree ("notificationId");


--
-- Name: action_proposals_organizationId_approverId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "action_proposals_organizationId_approverId_status_idx" ON public.action_proposals USING btree ("organizationId", "approverId", status);


--
-- Name: action_proposals_organizationId_dedupeKey_activeDedupeSlot_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "action_proposals_organizationId_dedupeKey_activeDedupeSlot_key" ON public.action_proposals USING btree ("organizationId", "dedupeKey", "activeDedupeSlot");


--
-- Name: action_proposals_organizationId_executionGrantDecisionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "action_proposals_organizationId_executionGrantDecisionId_idx" ON public.action_proposals USING btree ("organizationId", "executionGrantDecisionId");


--
-- Name: action_proposals_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "action_proposals_organizationId_status_idx" ON public.action_proposals USING btree ("organizationId", status);


--
-- Name: agent_autonomy_daily_metrics_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_autonomy_daily_metrics_date_idx ON public.agent_autonomy_daily_metrics USING btree (date);


--
-- Name: agent_autonomy_daily_metrics_organizationId_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "agent_autonomy_daily_metrics_organizationId_date_key" ON public.agent_autonomy_daily_metrics USING btree ("organizationId", date);


--
-- Name: agent_autonomy_daily_metrics_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_autonomy_daily_metrics_organizationId_idx" ON public.agent_autonomy_daily_metrics USING btree ("organizationId");


--
-- Name: agent_autonomy_daily_metrics_passed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_autonomy_daily_metrics_passed_idx ON public.agent_autonomy_daily_metrics USING btree (passed);


--
-- Name: agent_autonomy_policies_organizationId_scopeKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "agent_autonomy_policies_organizationId_scopeKey_key" ON public.agent_autonomy_policies USING btree ("organizationId", "scopeKey");


--
-- Name: agent_autonomy_policies_organizationId_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_autonomy_policies_organizationId_userId_idx" ON public.agent_autonomy_policies USING btree ("organizationId", "userId");


--
-- Name: agent_capability_tokens_actorId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_capability_tokens_actorId_idx" ON public.agent_capability_tokens USING btree ("actorId");


--
-- Name: agent_capability_tokens_organizationId_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_capability_tokens_organizationId_expiresAt_idx" ON public.agent_capability_tokens USING btree ("organizationId", "expiresAt");


--
-- Name: agent_capability_tokens_organizationId_revokedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_capability_tokens_organizationId_revokedAt_idx" ON public.agent_capability_tokens USING btree ("organizationId", "revokedAt");


--
-- Name: agent_capability_tokens_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "agent_capability_tokens_tokenHash_key" ON public.agent_capability_tokens USING btree ("tokenHash");


--
-- Name: agent_capability_tokens_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_capability_tokens_workspaceId_idx" ON public.agent_capability_tokens USING btree ("workspaceId");


--
-- Name: agent_eval_snapshots_org_agent_window_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_eval_snapshots_org_agent_window_idx ON public.agent_eval_snapshots USING btree ("organizationId", "agentType", "windowEnd");


--
-- Name: agent_eval_snapshots_org_agent_window_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agent_eval_snapshots_org_agent_window_version_key ON public.agent_eval_snapshots USING btree ("organizationId", "agentType", "windowStart", "windowEnd", version);


--
-- Name: agent_experience_cards_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_experience_cards_category_idx ON public.agent_experience_cards USING btree (category);


--
-- Name: agent_experience_cards_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_experience_cards_createdAt_idx" ON public.agent_experience_cards USING btree ("createdAt");


--
-- Name: agent_experience_cards_entityType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_experience_cards_entityType_idx" ON public.agent_experience_cards USING btree ("entityType");


--
-- Name: agent_experience_cards_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_experience_cards_organizationId_idx" ON public.agent_experience_cards USING btree ("organizationId");


--
-- Name: agent_experience_cards_sourceReviewTaskId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_experience_cards_sourceReviewTaskId_idx" ON public.agent_experience_cards USING btree ("sourceReviewTaskId");


--
-- Name: agent_experience_cards_taskType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_experience_cards_taskType_idx" ON public.agent_experience_cards USING btree ("taskType");


--
-- Name: agent_experience_cards_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_experience_cards_workspaceId_idx" ON public.agent_experience_cards USING btree ("workspaceId");


--
-- Name: agent_plans_conversationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_plans_conversationId_createdAt_idx" ON public.agent_plans USING btree ("conversationId", "createdAt");


--
-- Name: agent_plans_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_plans_organizationId_status_idx" ON public.agent_plans USING btree ("organizationId", status);


--
-- Name: agent_run_leases_organizationId_leaseUntil_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_run_leases_organizationId_leaseUntil_idx" ON public.agent_run_leases USING btree ("organizationId", "leaseUntil");


--
-- Name: agent_run_leases_ownerId_leaseUntil_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_run_leases_ownerId_leaseUntil_idx" ON public.agent_run_leases USING btree ("ownerId", "leaseUntil");


--
-- Name: agent_runs_agentType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_runs_agentType_idx" ON public.agent_runs USING btree ("agentType");


--
-- Name: agent_runs_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_runs_createdAt_idx" ON public.agent_runs USING btree ("createdAt");


--
-- Name: agent_runs_organizationId_clientRequestId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "agent_runs_organizationId_clientRequestId_key" ON public.agent_runs USING btree ("organizationId", "clientRequestId");


--
-- Name: agent_runs_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_runs_organizationId_idx" ON public.agent_runs USING btree ("organizationId");


--
-- Name: agent_runs_organizationId_lifecycleStatus_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_runs_organizationId_lifecycleStatus_createdAt_idx" ON public.agent_runs USING btree ("organizationId", "lifecycleStatus", "createdAt");


--
-- Name: agent_runs_organizationId_status_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_runs_organizationId_status_createdAt_idx" ON public.agent_runs USING btree ("organizationId", status, "createdAt");


--
-- Name: agent_runs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_runs_status_idx ON public.agent_runs USING btree (status);


--
-- Name: agent_runs_traceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_runs_traceId_idx" ON public.agent_runs USING btree ("traceId");


--
-- Name: agent_runs_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_runs_userId_idx" ON public.agent_runs USING btree ("userId");


--
-- Name: agent_runs_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_runs_workspaceId_idx" ON public.agent_runs USING btree ("workspaceId");


--
-- Name: agent_steps_organizationId_status_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_steps_organizationId_status_createdAt_idx" ON public.agent_steps USING btree ("organizationId", status, "createdAt");


--
-- Name: agent_steps_runId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_steps_runId_createdAt_idx" ON public.agent_steps USING btree ("runId", "createdAt");


--
-- Name: agent_steps_runId_stepKey_attempt_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "agent_steps_runId_stepKey_attempt_key" ON public.agent_steps USING btree ("runId", "stepKey", attempt);


--
-- Name: agent_steps_toolCallId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_steps_toolCallId_idx" ON public.agent_steps USING btree ("toolCallId");


--
-- Name: agent_tool_executions_organizationId_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "agent_tool_executions_organizationId_idempotencyKey_key" ON public.agent_tool_executions USING btree ("organizationId", "idempotencyKey");


--
-- Name: agent_tool_executions_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_tool_executions_organizationId_status_idx" ON public.agent_tool_executions USING btree ("organizationId", status);


--
-- Name: agent_tool_executions_planId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_tool_executions_planId_idx" ON public.agent_tool_executions USING btree ("planId");


--
-- Name: agent_transitions_eventKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "agent_transitions_eventKey_key" ON public.agent_transitions USING btree ("eventKey");


--
-- Name: agent_transitions_organizationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_transitions_organizationId_createdAt_idx" ON public.agent_transitions USING btree ("organizationId", "createdAt");


--
-- Name: agent_transitions_runId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_transitions_runId_createdAt_idx" ON public.agent_transitions USING btree ("runId", "createdAt");


--
-- Name: agent_transitions_runId_eventType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_transitions_runId_eventType_idx" ON public.agent_transitions USING btree ("runId", "eventType");


--
-- Name: agent_work_memories_agentRunId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_work_memories_agentRunId_idx" ON public.agent_work_memories USING btree ("agentRunId");


--
-- Name: agent_work_memories_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_work_memories_createdAt_idx" ON public.agent_work_memories USING btree ("createdAt");


--
-- Name: agent_work_memories_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_work_memories_organizationId_idx" ON public.agent_work_memories USING btree ("organizationId");


--
-- Name: agent_work_memories_productId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_work_memories_productId_idx" ON public.agent_work_memories USING btree ("productId");


--
-- Name: agent_work_memories_productName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_work_memories_productName_idx" ON public.agent_work_memories USING btree ("productName");


--
-- Name: agent_work_memories_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_work_memories_status_idx ON public.agent_work_memories USING btree (status);


--
-- Name: agent_work_memories_taskType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_work_memories_taskType_idx" ON public.agent_work_memories USING btree ("taskType");


--
-- Name: agent_work_memories_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_work_memories_workspaceId_idx" ON public.agent_work_memories USING btree ("workspaceId");


--
-- Name: alerts_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "alerts_createdAt_idx" ON public.alerts USING btree ("createdAt");


--
-- Name: alerts_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "alerts_organizationId_idx" ON public.alerts USING btree ("organizationId");


--
-- Name: alerts_severity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alerts_severity_idx ON public.alerts USING btree (severity);


--
-- Name: alerts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alerts_status_idx ON public.alerts USING btree (status);


--
-- Name: alerts_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alerts_type_idx ON public.alerts USING btree (type);


--
-- Name: alerts_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "alerts_workspaceId_idx" ON public.alerts USING btree ("workspaceId");


--
-- Name: approval_decisions_actionProposalId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "approval_decisions_actionProposalId_idx" ON public.approval_decisions USING btree ("actionProposalId");


--
-- Name: approval_decisions_actorId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "approval_decisions_actorId_idx" ON public.approval_decisions USING btree ("actorId");


--
-- Name: approval_decisions_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "approval_decisions_createdAt_idx" ON public.approval_decisions USING btree ("createdAt");


--
-- Name: approval_decisions_decision_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX approval_decisions_decision_idx ON public.approval_decisions USING btree (decision);


--
-- Name: approval_decisions_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "approval_decisions_organizationId_idx" ON public.approval_decisions USING btree ("organizationId");


--
-- Name: assistant_messages_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "assistant_messages_createdAt_idx" ON public.assistant_messages USING btree ("createdAt");


--
-- Name: assistant_messages_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "assistant_messages_sessionId_idx" ON public.assistant_messages USING btree ("sessionId");


--
-- Name: assistant_sessions_contextType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "assistant_sessions_contextType_idx" ON public.assistant_sessions USING btree ("contextType");


--
-- Name: assistant_sessions_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "assistant_sessions_organizationId_idx" ON public.assistant_sessions USING btree ("organizationId");


--
-- Name: assistant_sessions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assistant_sessions_status_idx ON public.assistant_sessions USING btree (status);


--
-- Name: assistant_sessions_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "assistant_sessions_userId_idx" ON public.assistant_sessions USING btree ("userId");


--
-- Name: assistant_sessions_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "assistant_sessions_workspaceId_idx" ON public.assistant_sessions USING btree ("workspaceId");


--
-- Name: audit_archives_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_archives_date_idx ON public.audit_archives USING btree (date);


--
-- Name: audit_archives_objectKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "audit_archives_objectKey_key" ON public.audit_archives USING btree ("objectKey");


--
-- Name: audit_archives_organizationId_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "audit_archives_organizationId_date_key" ON public.audit_archives USING btree ("organizationId", date);


--
-- Name: audit_archives_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_archives_organizationId_idx" ON public.audit_archives USING btree ("organizationId");


--
-- Name: audit_archives_retainUntil_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_archives_retainUntil_idx" ON public.audit_archives USING btree ("retainUntil");


--
-- Name: audit_logs_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action);


--
-- Name: audit_logs_actorId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_logs_actorId_idx" ON public.audit_logs USING btree ("actorId");


--
-- Name: audit_logs_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_logs_createdAt_idx" ON public.audit_logs USING btree ("createdAt");


--
-- Name: audit_logs_entryHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "audit_logs_entryHash_key" ON public.audit_logs USING btree ("entryHash");


--
-- Name: audit_logs_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_logs_organizationId_idx" ON public.audit_logs USING btree ("organizationId");


--
-- Name: audit_logs_organizationId_sequence_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "audit_logs_organizationId_sequence_key" ON public.audit_logs USING btree ("organizationId", sequence);


--
-- Name: audit_logs_resourceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_logs_resourceId_idx" ON public.audit_logs USING btree ("resourceId");


--
-- Name: audit_logs_resourceType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_logs_resourceType_idx" ON public.audit_logs USING btree ("resourceType");


--
-- Name: automation_flows_organizationId_dedupeKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "automation_flows_organizationId_dedupeKey_key" ON public.automation_flows USING btree ("organizationId", "dedupeKey");


--
-- Name: automation_flows_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "automation_flows_organizationId_idx" ON public.automation_flows USING btree ("organizationId");


--
-- Name: automation_flows_organizationId_status_nextRunAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "automation_flows_organizationId_status_nextRunAt_idx" ON public.automation_flows USING btree ("organizationId", status, "nextRunAt");


--
-- Name: automation_flows_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_flows_status_idx ON public.automation_flows USING btree (status);


--
-- Name: automation_flows_triggerType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "automation_flows_triggerType_idx" ON public.automation_flows USING btree ("triggerType");


--
-- Name: automation_flows_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "automation_flows_workspaceId_idx" ON public.automation_flows USING btree ("workspaceId");


--
-- Name: automation_runs_flowId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "automation_runs_flowId_idx" ON public.automation_runs USING btree ("flowId");


--
-- Name: automation_runs_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "automation_runs_startedAt_idx" ON public.automation_runs USING btree ("startedAt");


--
-- Name: automation_runs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_runs_status_idx ON public.automation_runs USING btree (status);


--
-- Name: automation_runs_traceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "automation_runs_traceId_idx" ON public.automation_runs USING btree ("traceId");


--
-- Name: automation_step_executions_automationRunId_stepIndex_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "automation_step_executions_automationRunId_stepIndex_idx" ON public.automation_step_executions USING btree ("automationRunId", "stepIndex");


--
-- Name: automation_step_executions_automationRunId_stepKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "automation_step_executions_automationRunId_stepKey_key" ON public.automation_step_executions USING btree ("automationRunId", "stepKey");


--
-- Name: automation_step_executions_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "automation_step_executions_organizationId_status_idx" ON public.automation_step_executions USING btree ("organizationId", status);


--
-- Name: business_outcomes_agentRunId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "business_outcomes_agentRunId_idx" ON public.business_outcomes USING btree ("agentRunId");


--
-- Name: business_outcomes_opportunityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "business_outcomes_opportunityId_idx" ON public.business_outcomes USING btree ("opportunityId");


--
-- Name: business_outcomes_organizationId_periodEnd_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "business_outcomes_organizationId_periodEnd_idx" ON public.business_outcomes USING btree ("organizationId", "periodEnd");


--
-- Name: business_outcomes_organizationId_productId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "business_outcomes_organizationId_productId_idx" ON public.business_outcomes USING btree ("organizationId", "productId");


--
-- Name: business_outcomes_organizationId_source_externalReference_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "business_outcomes_organizationId_source_externalReference_key" ON public.business_outcomes USING btree ("organizationId", source, "externalReference");


--
-- Name: channel_connections_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX channel_connections_provider_idx ON public.channel_connections USING btree (provider);


--
-- Name: channel_connections_syncStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "channel_connections_syncStatus_idx" ON public.channel_connections USING btree ("syncStatus");


--
-- Name: channel_connections_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "channel_connections_workspaceId_idx" ON public.channel_connections USING btree ("workspaceId");


--
-- Name: channel_connections_workspaceId_provider_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "channel_connections_workspaceId_provider_key" ON public.channel_connections USING btree ("workspaceId", provider);


--
-- Name: dead_letter_jobs_failedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "dead_letter_jobs_failedAt_idx" ON public.dead_letter_jobs USING btree ("failedAt");


--
-- Name: dead_letter_jobs_inspectedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "dead_letter_jobs_inspectedAt_idx" ON public.dead_letter_jobs USING btree ("inspectedAt");


--
-- Name: dead_letter_jobs_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "dead_letter_jobs_organizationId_idx" ON public.dead_letter_jobs USING btree ("organizationId");


--
-- Name: dead_letter_jobs_organizationId_resolutionStatus_classification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "dead_letter_jobs_organizationId_resolutionStatus_classification" ON public.dead_letter_jobs USING btree ("organizationId", "resolutionStatus", classification);


--
-- Name: dead_letter_jobs_organizationId_resolutionStatus_replayClaimedA; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "dead_letter_jobs_organizationId_resolutionStatus_replayClaimedA" ON public.dead_letter_jobs USING btree ("organizationId", "resolutionStatus", "replayClaimedAt");


--
-- Name: dead_letter_jobs_queueName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "dead_letter_jobs_queueName_idx" ON public.dead_letter_jobs USING btree ("queueName");


--
-- Name: email_verification_tokens_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "email_verification_tokens_expiresAt_idx" ON public.email_verification_tokens USING btree ("expiresAt");


--
-- Name: email_verification_tokens_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key" ON public.email_verification_tokens USING btree ("tokenHash");


--
-- Name: email_verification_tokens_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "email_verification_tokens_userId_idx" ON public.email_verification_tokens USING btree ("userId");


--
-- Name: enterprise_slo_daily_snapshots_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enterprise_slo_daily_snapshots_date_idx ON public.enterprise_slo_daily_snapshots USING btree (date);


--
-- Name: enterprise_slo_daily_snapshots_organizationId_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "enterprise_slo_daily_snapshots_organizationId_date_key" ON public.enterprise_slo_daily_snapshots USING btree ("organizationId", date);


--
-- Name: enterprise_slo_daily_snapshots_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "enterprise_slo_daily_snapshots_organizationId_idx" ON public.enterprise_slo_daily_snapshots USING btree ("organizationId");


--
-- Name: enterprise_slo_daily_snapshots_passed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enterprise_slo_daily_snapshots_passed_idx ON public.enterprise_slo_daily_snapshots USING btree (passed);


--
-- Name: external_submissions_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "external_submissions_createdAt_idx" ON public.external_submissions USING btree ("createdAt");


--
-- Name: external_submissions_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "external_submissions_organizationId_idx" ON public.external_submissions USING btree ("organizationId");


--
-- Name: external_submissions_organizationId_provider_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "external_submissions_organizationId_provider_idempotencyKey_key" ON public.external_submissions USING btree ("organizationId", provider, "idempotencyKey");


--
-- Name: external_submissions_productLaunchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "external_submissions_productLaunchId_idx" ON public.external_submissions USING btree ("productLaunchId");


--
-- Name: external_submissions_publishSnapshotId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "external_submissions_publishSnapshotId_key" ON public.external_submissions USING btree ("publishSnapshotId");


--
-- Name: external_submissions_status_claimedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "external_submissions_status_claimedAt_idx" ON public.external_submissions USING btree (status, "claimedAt");


--
-- Name: external_submissions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_submissions_status_idx ON public.external_submissions USING btree (status);


--
-- Name: feature_flags_enabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feature_flags_enabled_idx ON public.feature_flags USING btree (enabled);


--
-- Name: feature_flags_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feature_flags_name_idx ON public.feature_flags USING btree (name);


--
-- Name: feature_flags_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX feature_flags_name_key ON public.feature_flags USING btree (name);


--
-- Name: feedback_signals_approval_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_signals_approval_idx ON public.feedback_signals USING btree ("approvalId");


--
-- Name: feedback_signals_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_signals_listing_idx ON public.feedback_signals USING btree ("listingId");


--
-- Name: feedback_signals_org_source_reference_type_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX feedback_signals_org_source_reference_type_key ON public.feedback_signals USING btree ("organizationId", source, "externalReference", "signalType");


--
-- Name: feedback_signals_org_type_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_signals_org_type_created_idx ON public.feedback_signals USING btree ("organizationId", "signalType", "createdAt");


--
-- Name: feedback_signals_run_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_signals_run_created_idx ON public.feedback_signals USING btree ("runId", "createdAt");


--
-- Name: feedback_signals_snapshot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_signals_snapshot_idx ON public.feedback_signals USING btree ("snapshotId");


--
-- Name: file_assets_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "file_assets_organizationId_idx" ON public.file_assets USING btree ("organizationId");


--
-- Name: file_assets_ownerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "file_assets_ownerId_idx" ON public.file_assets USING btree ("ownerId");


--
-- Name: file_assets_purpose_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_assets_purpose_idx ON public.file_assets USING btree (purpose);


--
-- Name: file_assets_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "file_assets_workspaceId_idx" ON public.file_assets USING btree ("workspaceId");


--
-- Name: idx_agent_runs_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_org_created ON public.agent_runs USING btree ("organizationId", "createdAt" DESC);


--
-- Name: idx_agent_runs_org_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_org_type_created ON public.agent_runs USING btree ("organizationId", "agentType", "createdAt" DESC);


--
-- Name: idx_alerts_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_open ON public.alerts USING btree ("organizationId") WHERE (status = 'OPEN'::public."AlertStatus");


--
-- Name: idx_alerts_org_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_org_status_created ON public.alerts USING btree ("organizationId", status, "createdAt" DESC);


--
-- Name: idx_audit_logs_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_org_created ON public.audit_logs USING btree ("organizationId", "createdAt" DESC);


--
-- Name: idx_audit_logs_org_resource_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_org_resource_created ON public.audit_logs USING btree ("organizationId", "resourceType", "createdAt" DESC);


--
-- Name: idx_channel_connections_ws_provider_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_connections_ws_provider_status ON public.channel_connections USING btree ("workspaceId", provider, "syncStatus");


--
-- Name: idx_keyword_reports_org_ws_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_keyword_reports_org_ws_created ON public.keyword_reports USING btree ("organizationId", "workspaceId", "createdAt" DESC);


--
-- Name: idx_keyword_reports_query_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_keyword_reports_query_fts ON public.keyword_reports USING gin (to_tsvector('simple'::regconfig, COALESCE(query, ''::text)));


--
-- Name: idx_knowledge_docs_content_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_docs_content_fts ON public.knowledge_documents USING gin (to_tsvector('simple'::regconfig, ((COALESCE(title, ' '::text) || ' '::text) || COALESCE(content, ''::text))));


--
-- Name: idx_knowledge_docs_org_vis_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_docs_org_vis_creator ON public.knowledge_documents USING btree ("organizationId", visibility, "createdBy", "createdAt" DESC);


--
-- Name: idx_listing_drafts_org_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listing_drafts_org_status_created ON public.listing_drafts USING btree ("organizationId", status, "createdAt" DESC);


--
-- Name: idx_listing_drafts_title_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listing_drafts_title_fts ON public.listing_drafts USING gin (to_tsvector('simple'::regconfig, COALESCE(title, ''::text)));


--
-- Name: idx_notifications_org_user_read_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_org_user_read_created ON public.notifications USING btree ("organizationId", "userId", "readAt", "createdAt" DESC);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_unread ON public.notifications USING btree ("organizationId", "userId") WHERE ("readAt" IS NULL);


--
-- Name: idx_products_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_active ON public.products USING btree ("workspaceId") WHERE (status <> ALL (ARRAY['ARCHIVED'::public."ProductStatus", 'DELETED'::public."ProductStatus"]));


--
-- Name: idx_products_title_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_title_fts ON public.products USING gin (to_tsvector('simple'::regconfig, COALESCE(title, ''::text)));


--
-- Name: idx_products_ws_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_ws_status_created ON public.products USING btree ("workspaceId", status, "createdAt" DESC);


--
-- Name: idx_review_tasks_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_tasks_assigned_to ON public.review_tasks USING btree ("assignedTo");


--
-- Name: idx_review_tasks_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_tasks_created_at ON public.review_tasks USING btree ("createdAt");


--
-- Name: idx_review_tasks_entity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_tasks_entity_id ON public.review_tasks USING btree ("entityId");


--
-- Name: idx_review_tasks_entity_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_tasks_entity_type ON public.review_tasks USING btree ("entityType");


--
-- Name: idx_review_tasks_org_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_tasks_org_status_created ON public.review_tasks USING btree ("organizationId", status, "createdAt" DESC);


--
-- Name: idx_review_tasks_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_tasks_organization_id ON public.review_tasks USING btree ("organizationId");


--
-- Name: idx_review_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_tasks_status ON public.review_tasks USING btree (status);


--
-- Name: idx_tasks_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_active ON public.team_tasks USING btree ("organizationId") WHERE (status = ANY (ARRAY['TODO'::public."TaskStatus", 'IN_PROGRESS'::public."TaskStatus", 'REVIEW'::public."TaskStatus"]));


--
-- Name: idx_team_tasks_org_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_tasks_org_status_created ON public.team_tasks USING btree ("organizationId", status, "createdAt" DESC);


--
-- Name: idx_trend_insights_keyword_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trend_insights_keyword_fts ON public.trend_insights USING gin (to_tsvector('simple'::regconfig, COALESCE(keyword, ''::text)));


--
-- Name: idx_trend_insights_org_keyword_observed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trend_insights_org_keyword_observed ON public.trend_insights USING btree ("organizationId", keyword, "observedAt" DESC);


--
-- Name: idx_trend_insights_org_observed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trend_insights_org_observed ON public.trend_insights USING btree ("organizationId", "observedAt" DESC);


--
-- Name: image_prompt_projects_createdBy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "image_prompt_projects_createdBy_idx" ON public.image_prompt_projects USING btree ("createdBy");


--
-- Name: image_prompt_projects_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "image_prompt_projects_organizationId_idx" ON public.image_prompt_projects USING btree ("organizationId");


--
-- Name: image_prompt_projects_productId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "image_prompt_projects_productId_idx" ON public.image_prompt_projects USING btree ("productId");


--
-- Name: image_prompt_projects_qaStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "image_prompt_projects_qaStatus_idx" ON public.image_prompt_projects USING btree ("qaStatus");


--
-- Name: image_prompt_projects_referenceAssetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "image_prompt_projects_referenceAssetId_idx" ON public.image_prompt_projects USING btree ("referenceAssetId");


--
-- Name: image_prompt_projects_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX image_prompt_projects_status_idx ON public.image_prompt_projects USING btree (status);


--
-- Name: image_prompt_projects_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "image_prompt_projects_workspaceId_idx" ON public.image_prompt_projects USING btree ("workspaceId");


--
-- Name: invoices_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invoices_createdAt_idx" ON public.invoices USING btree ("createdAt");


--
-- Name: invoices_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invoices_organizationId_idx" ON public.invoices USING btree ("organizationId");


--
-- Name: invoices_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_status_idx ON public.invoices USING btree (status);


--
-- Name: invoices_stripeInvoiceId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "invoices_stripeInvoiceId_key" ON public.invoices USING btree ("stripeInvoiceId");


--
-- Name: keyword_reports_country_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX keyword_reports_country_idx ON public.keyword_reports USING btree (country);


--
-- Name: keyword_reports_createdBy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "keyword_reports_createdBy_idx" ON public.keyword_reports USING btree ("createdBy");


--
-- Name: keyword_reports_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "keyword_reports_organizationId_idx" ON public.keyword_reports USING btree ("organizationId");


--
-- Name: keyword_reports_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "keyword_reports_workspaceId_idx" ON public.keyword_reports USING btree ("workspaceId");


--
-- Name: knowledge_documents_createdBy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "knowledge_documents_createdBy_idx" ON public.knowledge_documents USING btree ("createdBy");


--
-- Name: knowledge_documents_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "knowledge_documents_organizationId_idx" ON public.knowledge_documents USING btree ("organizationId");


--
-- Name: knowledge_documents_title_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_documents_title_idx ON public.knowledge_documents USING btree (title);


--
-- Name: knowledge_documents_visibility_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_documents_visibility_idx ON public.knowledge_documents USING btree (visibility);


--
-- Name: knowledge_documents_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "knowledge_documents_workspaceId_idx" ON public.knowledge_documents USING btree ("workspaceId");


--
-- Name: listing_drafts_createdBy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "listing_drafts_createdBy_idx" ON public.listing_drafts USING btree ("createdBy");


--
-- Name: listing_drafts_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "listing_drafts_organizationId_idx" ON public.listing_drafts USING btree ("organizationId");


--
-- Name: listing_drafts_productId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "listing_drafts_productId_idx" ON public.listing_drafts USING btree ("productId");


--
-- Name: listing_drafts_productLaunchId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "listing_drafts_productLaunchId_key" ON public.listing_drafts USING btree ("productLaunchId");


--
-- Name: listing_drafts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_drafts_status_idx ON public.listing_drafts USING btree (status);


--
-- Name: listing_drafts_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "listing_drafts_workspaceId_idx" ON public.listing_drafts USING btree ("workspaceId");


--
-- Name: listing_publish_snapshots_channelId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "listing_publish_snapshots_channelId_idx" ON public.listing_publish_snapshots USING btree ("channelId");


--
-- Name: listing_publish_snapshots_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "listing_publish_snapshots_createdAt_idx" ON public.listing_publish_snapshots USING btree ("createdAt");


--
-- Name: listing_publish_snapshots_listingDraftId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "listing_publish_snapshots_listingDraftId_idx" ON public.listing_publish_snapshots USING btree ("listingDraftId");


--
-- Name: listing_publish_snapshots_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "listing_publish_snapshots_organizationId_idx" ON public.listing_publish_snapshots USING btree ("organizationId");


--
-- Name: listing_publish_snapshots_productId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "listing_publish_snapshots_productId_idx" ON public.listing_publish_snapshots USING btree ("productId");


--
-- Name: listing_publish_snapshots_productLaunchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "listing_publish_snapshots_productLaunchId_idx" ON public.listing_publish_snapshots USING btree ("productLaunchId");


--
-- Name: listing_publish_snapshots_productLaunchId_snapshotHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "listing_publish_snapshots_productLaunchId_snapshotHash_key" ON public.listing_publish_snapshots USING btree ("productLaunchId", "snapshotHash");


--
-- Name: listing_publish_snapshots_reviewTaskId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "listing_publish_snapshots_reviewTaskId_idx" ON public.listing_publish_snapshots USING btree ("reviewTaskId");


--
-- Name: listing_publish_snapshots_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_publish_snapshots_status_idx ON public.listing_publish_snapshots USING btree (status);


--
-- Name: listing_sandbox_reports_evaluatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "listing_sandbox_reports_evaluatedAt_idx" ON public.listing_sandbox_reports USING btree ("evaluatedAt");


--
-- Name: listing_sandbox_reports_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "listing_sandbox_reports_organizationId_idx" ON public.listing_sandbox_reports USING btree ("organizationId");


--
-- Name: listing_sandbox_reports_publishSnapshotId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "listing_sandbox_reports_publishSnapshotId_key" ON public.listing_sandbox_reports USING btree ("publishSnapshotId");


--
-- Name: listing_sandbox_reports_riskLevel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "listing_sandbox_reports_riskLevel_idx" ON public.listing_sandbox_reports USING btree ("riskLevel");


--
-- Name: listing_sandbox_reports_snapshotHash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "listing_sandbox_reports_snapshotHash_idx" ON public.listing_sandbox_reports USING btree ("snapshotHash");


--
-- Name: listing_sandbox_reports_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_sandbox_reports_status_idx ON public.listing_sandbox_reports USING btree (status);


--
-- Name: market_observation_batches_org_fingerprint_captured_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX market_observation_batches_org_fingerprint_captured_key ON public.market_observation_batches USING btree ("organizationId", "pageFingerprint", "capturedAt");


--
-- Name: market_observation_batches_organizationId_capturedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_observation_batches_organizationId_capturedAt_idx" ON public.market_observation_batches USING btree ("organizationId", "capturedAt");


--
-- Name: market_observation_batches_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_observation_batches_workspaceId_idx" ON public.market_observation_batches USING btree ("workspaceId");


--
-- Name: market_observation_items_batchId_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_observation_items_batchId_position_idx" ON public.market_observation_items USING btree ("batchId", "position");


--
-- Name: market_observation_items_organizationId_externalId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_observation_items_organizationId_externalId_idx" ON public.market_observation_items USING btree ("organizationId", "externalId");


--
-- Name: market_observation_items_organizationId_url_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_observation_items_organizationId_url_idx" ON public.market_observation_items USING btree ("organizationId", url);


--
-- Name: marketplace_orders_channelId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "marketplace_orders_channelId_idx" ON public.marketplace_orders USING btree ("channelId");


--
-- Name: marketplace_orders_orderedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "marketplace_orders_orderedAt_idx" ON public.marketplace_orders USING btree ("orderedAt");


--
-- Name: marketplace_orders_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "marketplace_orders_organizationId_idx" ON public.marketplace_orders USING btree ("organizationId");


--
-- Name: marketplace_orders_organizationId_provider_externalPostingNumbe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "marketplace_orders_organizationId_provider_externalPostingNumbe" ON public.marketplace_orders USING btree ("organizationId", provider, "externalPostingNumber");


--
-- Name: marketplace_orders_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_orders_provider_idx ON public.marketplace_orders USING btree (provider);


--
-- Name: marketplace_orders_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_orders_status_idx ON public.marketplace_orders USING btree (status);


--
-- Name: marketplace_orders_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "marketplace_orders_workspaceId_idx" ON public.marketplace_orders USING btree ("workspaceId");


--
-- Name: mcp_tool_invocations_organizationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mcp_tool_invocations_organizationId_createdAt_idx" ON public.mcp_tool_invocations USING btree ("organizationId", "createdAt");


--
-- Name: mcp_tool_invocations_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mcp_tool_invocations_status_idx ON public.mcp_tool_invocations USING btree (status);


--
-- Name: mcp_tool_invocations_toolName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mcp_tool_invocations_toolName_idx" ON public.mcp_tool_invocations USING btree ("toolName");


--
-- Name: mcp_tool_invocations_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mcp_tool_invocations_workspaceId_idx" ON public.mcp_tool_invocations USING btree ("workspaceId");


--
-- Name: memberships_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "memberships_organizationId_idx" ON public.memberships USING btree ("organizationId");


--
-- Name: memberships_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memberships_role_idx ON public.memberships USING btree (role);


--
-- Name: memberships_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memberships_status_idx ON public.memberships USING btree (status);


--
-- Name: memberships_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "memberships_userId_idx" ON public.memberships USING btree ("userId");


--
-- Name: memberships_userId_organizationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "memberships_userId_organizationId_key" ON public.memberships USING btree ("userId", "organizationId");


--
-- Name: notifications_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_createdAt_idx" ON public.notifications USING btree ("createdAt");


--
-- Name: notifications_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_organizationId_idx" ON public.notifications USING btree ("organizationId");


--
-- Name: notifications_readAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_readAt_idx" ON public.notifications USING btree ("readAt");


--
-- Name: notifications_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_type_idx ON public.notifications USING btree (type);


--
-- Name: notifications_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_userId_idx" ON public.notifications USING btree ("userId");


--
-- Name: organizations_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_plan_idx ON public.organizations USING btree (plan);


--
-- Name: organizations_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_slug_idx ON public.organizations USING btree (slug);


--
-- Name: organizations_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_slug_key ON public.organizations USING btree (slug);


--
-- Name: organizations_stripeCustomerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "organizations_stripeCustomerId_key" ON public.organizations USING btree ("stripeCustomerId");


--
-- Name: outbox_events_aggregateType_aggregateId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "outbox_events_aggregateType_aggregateId_idx" ON public.outbox_events USING btree ("aggregateType", "aggregateId");


--
-- Name: outbox_events_dedupeKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "outbox_events_dedupeKey_key" ON public.outbox_events USING btree ("dedupeKey");


--
-- Name: outbox_events_organizationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "outbox_events_organizationId_createdAt_idx" ON public.outbox_events USING btree ("organizationId", "createdAt");


--
-- Name: outbox_events_status_nextRetryAt_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "outbox_events_status_nextRetryAt_createdAt_idx" ON public.outbox_events USING btree (status, "nextRetryAt", "createdAt");


--
-- Name: password_reset_tokens_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "password_reset_tokens_expiresAt_idx" ON public.password_reset_tokens USING btree ("expiresAt");


--
-- Name: password_reset_tokens_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON public.password_reset_tokens USING btree ("tokenHash");


--
-- Name: password_reset_tokens_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "password_reset_tokens_userId_idx" ON public.password_reset_tokens USING btree ("userId");


--
-- Name: policy_rule_hits_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "policy_rule_hits_createdAt_idx" ON public.policy_rule_hits USING btree ("createdAt");


--
-- Name: policy_rule_hits_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "policy_rule_hits_organizationId_idx" ON public.policy_rule_hits USING btree ("organizationId");


--
-- Name: policy_rule_hits_ruleCode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "policy_rule_hits_ruleCode_idx" ON public.policy_rule_hits USING btree ("ruleCode");


--
-- Name: policy_rule_hits_sandboxReportId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "policy_rule_hits_sandboxReportId_idx" ON public.policy_rule_hits USING btree ("sandboxReportId");


--
-- Name: policy_rule_hits_severity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX policy_rule_hits_severity_idx ON public.policy_rule_hits USING btree (severity);


--
-- Name: product_candidates_organizationId_fingerprint_lastSeenAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_candidates_organizationId_fingerprint_lastSeenAt_idx" ON public.product_candidates USING btree ("organizationId", fingerprint, "lastSeenAt");


--
-- Name: product_candidates_researchRunId_fingerprint_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "product_candidates_researchRunId_fingerprint_key" ON public.product_candidates USING btree ("researchRunId", fingerprint);


--
-- Name: product_candidates_researchRunId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_candidates_researchRunId_status_idx" ON public.product_candidates USING btree ("researchRunId", status);


--
-- Name: product_candidates_workspaceId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_candidates_workspaceId_status_idx" ON public.product_candidates USING btree ("workspaceId", status);


--
-- Name: product_feedback_candidateId_eventAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_feedback_candidateId_eventAt_idx" ON public.product_feedback USING btree ("candidateId", "eventAt");


--
-- Name: product_feedback_organizationId_source_externalReference_ev_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "product_feedback_organizationId_source_externalReference_ev_key" ON public.product_feedback USING btree ("organizationId", source, "externalReference", "eventType");


--
-- Name: product_feedback_workspaceId_eventType_eventAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_feedback_workspaceId_eventType_eventAt_idx" ON public.product_feedback USING btree ("workspaceId", "eventType", "eventAt");


--
-- Name: product_launches_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_launches_createdAt_idx" ON public.product_launches USING btree ("createdAt");


--
-- Name: product_launches_imageProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_launches_imageProjectId_idx" ON public.product_launches USING btree ("imageProjectId");


--
-- Name: product_launches_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_launches_organizationId_idx" ON public.product_launches USING btree ("organizationId");


--
-- Name: product_launches_productId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_launches_productId_idx" ON public.product_launches USING btree ("productId");


--
-- Name: product_launches_publishExecutionGrantExpiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_launches_publishExecutionGrantExpiresAt_idx" ON public.product_launches USING btree ("publishExecutionGrantExpiresAt");


--
-- Name: product_launches_publishExecutionGrantHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "product_launches_publishExecutionGrantHash_key" ON public.product_launches USING btree ("publishExecutionGrantHash");


--
-- Name: product_launches_referenceAssetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_launches_referenceAssetId_idx" ON public.product_launches USING btree ("referenceAssetId");


--
-- Name: product_launches_reviewTaskId_candidateId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "product_launches_reviewTaskId_candidateId_key" ON public.product_launches USING btree ("reviewTaskId", "candidateId");


--
-- Name: product_launches_reviewTaskId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_launches_reviewTaskId_idx" ON public.product_launches USING btree ("reviewTaskId");


--
-- Name: product_launches_selectedPublishSnapshotId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "product_launches_selectedPublishSnapshotId_key" ON public.product_launches USING btree ("selectedPublishSnapshotId");


--
-- Name: product_launches_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_launches_status_idx ON public.product_launches USING btree (status);


--
-- Name: product_opportunities_observationItemId_scoringVersion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_opportunities_observationItemId_scoringVersion_idx" ON public.product_opportunities USING btree ("observationItemId", "scoringVersion");


--
-- Name: product_opportunities_organizationId_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_opportunities_organizationId_score_idx" ON public.product_opportunities USING btree ("organizationId", score);


--
-- Name: product_opportunities_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_opportunities_organizationId_status_idx" ON public.product_opportunities USING btree ("organizationId", status);


--
-- Name: product_research_candidate_decisions_candidateId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_research_candidate_decisions_candidateId_idx" ON public.product_research_candidate_decisions USING btree ("candidateId");


--
-- Name: product_research_candidate_decisions_organizationId_candida_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "product_research_candidate_decisions_organizationId_candida_key" ON public.product_research_candidate_decisions USING btree ("organizationId", "candidateId");


--
-- Name: product_research_candidate_decisions_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_research_candidate_decisions_organizationId_idx" ON public.product_research_candidate_decisions USING btree ("organizationId");


--
-- Name: product_research_candidate_decisions_organizationId_reportId_ca; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "product_research_candidate_decisions_organizationId_reportId_ca" ON public.product_research_candidate_decisions USING btree ("organizationId", "reportId", "candidateIndex");


--
-- Name: product_research_candidate_decisions_reportId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_research_candidate_decisions_reportId_idx" ON public.product_research_candidate_decisions USING btree ("reportId");


--
-- Name: product_research_candidate_decisions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_research_candidate_decisions_status_idx ON public.product_research_candidate_decisions USING btree (status);


--
-- Name: product_research_candidate_decisions_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_research_candidate_decisions_workspaceId_idx" ON public.product_research_candidate_decisions USING btree ("workspaceId");


--
-- Name: product_research_reports_createdBy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_research_reports_createdBy_idx" ON public.product_research_reports USING btree ("createdBy");


--
-- Name: product_research_reports_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_research_reports_organizationId_idx" ON public.product_research_reports USING btree ("organizationId");


--
-- Name: product_research_reports_researchRunId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "product_research_reports_researchRunId_key" ON public.product_research_reports USING btree ("researchRunId");


--
-- Name: product_research_reports_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_research_reports_status_idx ON public.product_research_reports USING btree (status);


--
-- Name: product_research_reports_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_research_reports_workspaceId_idx" ON public.product_research_reports USING btree ("workspaceId");


--
-- Name: product_research_runs_automationRunId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_research_runs_automationRunId_idx" ON public.product_research_runs USING btree ("automationRunId");


--
-- Name: product_research_runs_organizationId_businessDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_research_runs_organizationId_businessDate_idx" ON public.product_research_runs USING btree ("organizationId", "businessDate");


--
-- Name: product_research_runs_organizationId_workspaceScopeKey_busi_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "product_research_runs_organizationId_workspaceScopeKey_busi_key" ON public.product_research_runs USING btree ("organizationId", "workspaceScopeKey", "businessDate", "configVersion", attempt);


--
-- Name: product_research_runs_status_businessDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_research_runs_status_businessDate_idx" ON public.product_research_runs USING btree (status, "businessDate");


--
-- Name: product_research_runs_workspaceId_businessDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_research_runs_workspaceId_businessDate_idx" ON public.product_research_runs USING btree ("workspaceId", "businessDate");


--
-- Name: product_research_source_health_organizationId_source_update_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_research_source_health_organizationId_source_update_idx" ON public.product_research_source_health USING btree ("organizationId", source, "updatedAt");


--
-- Name: product_research_source_health_researchRunId_source_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "product_research_source_health_researchRunId_source_key" ON public.product_research_source_health USING btree ("researchRunId", source);


--
-- Name: product_research_source_health_workspaceId_source_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_research_source_health_workspaceId_source_updatedAt_idx" ON public.product_research_source_health USING btree ("workspaceId", source, "updatedAt");


--
-- Name: product_research_stage_runs_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_research_stage_runs_organizationId_status_idx" ON public.product_research_stage_runs USING btree ("organizationId", status);


--
-- Name: product_research_stage_runs_researchRunId_stage_attempt_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "product_research_stage_runs_researchRunId_stage_attempt_key" ON public.product_research_stage_runs USING btree ("researchRunId", stage, attempt);


--
-- Name: product_research_stage_runs_researchRunId_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_research_stage_runs_researchRunId_stage_idx" ON public.product_research_stage_runs USING btree ("researchRunId", stage);


--
-- Name: product_risk_records_candidateId_reviewStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_risk_records_candidateId_reviewStatus_idx" ON public.product_risk_records USING btree ("candidateId", "reviewStatus");


--
-- Name: product_risk_records_organizationId_severity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_risk_records_organizationId_severity_idx" ON public.product_risk_records USING btree ("organizationId", severity);


--
-- Name: product_risk_records_researchRunId_severity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_risk_records_researchRunId_severity_idx" ON public.product_risk_records USING btree ("researchRunId", severity);


--
-- Name: product_scores_candidateId_scoringVersionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "product_scores_candidateId_scoringVersionId_key" ON public.product_scores USING btree ("candidateId", "scoringVersionId");


--
-- Name: product_scores_organizationId_decision_finalScore_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_scores_organizationId_decision_finalScore_idx" ON public.product_scores USING btree ("organizationId", decision, "finalScore");


--
-- Name: product_scores_researchRunId_decision_rank_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_scores_researchRunId_decision_rank_idx" ON public.product_scores USING btree ("researchRunId", decision, rank);


--
-- Name: product_signals_candidateId_metricName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_signals_candidateId_metricName_idx" ON public.product_signals USING btree ("candidateId", "metricName");


--
-- Name: product_signals_candidateId_source_metricName_sourceHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "product_signals_candidateId_source_metricName_sourceHash_key" ON public.product_signals USING btree ("candidateId", source, "metricName", "sourceHash");


--
-- Name: product_signals_organizationId_source_fetchedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_signals_organizationId_source_fetchedAt_idx" ON public.product_signals USING btree ("organizationId", source, "fetchedAt");


--
-- Name: product_signals_researchRunId_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_signals_researchRunId_source_idx" ON public.product_signals USING btree ("researchRunId", source);


--
-- Name: products_asinOrExternalId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "products_asinOrExternalId_idx" ON public.products USING btree ("asinOrExternalId");


--
-- Name: products_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "products_createdAt_idx" ON public.products USING btree ("createdAt");


--
-- Name: products_sku_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_sku_idx ON public.products USING btree (sku);


--
-- Name: products_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_status_idx ON public.products USING btree (status);


--
-- Name: products_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "products_workspaceId_idx" ON public.products USING btree ("workspaceId");


--
-- Name: profit_calculations_createdBy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "profit_calculations_createdBy_idx" ON public.profit_calculations USING btree ("createdBy");


--
-- Name: profit_calculations_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "profit_calculations_organizationId_idx" ON public.profit_calculations USING btree ("organizationId");


--
-- Name: profit_calculations_productId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "profit_calculations_productId_idx" ON public.profit_calculations USING btree ("productId");


--
-- Name: profit_calculations_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "profit_calculations_workspaceId_idx" ON public.profit_calculations USING btree ("workspaceId");


--
-- Name: prompt_templates_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prompt_templates_category_idx ON public.prompt_templates USING btree (category);


--
-- Name: prompt_templates_createdBy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prompt_templates_createdBy_idx" ON public.prompt_templates USING btree ("createdBy");


--
-- Name: prompt_templates_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prompt_templates_organizationId_idx" ON public.prompt_templates USING btree ("organizationId");


--
-- Name: prompt_versions_contentHash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prompt_versions_contentHash_idx" ON public.prompt_versions USING btree ("contentHash");


--
-- Name: prompt_versions_org_agent_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prompt_versions_org_agent_status_idx ON public.prompt_versions USING btree ("organizationId", "agentType", status);


--
-- Name: prompt_versions_org_agent_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prompt_versions_org_agent_version_key ON public.prompt_versions USING btree ("organizationId", "agentType", version);


--
-- Name: refresh_tokens_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "refresh_tokens_expiresAt_idx" ON public.refresh_tokens USING btree ("expiresAt");


--
-- Name: refresh_tokens_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON public.refresh_tokens USING btree ("tokenHash");


--
-- Name: refresh_tokens_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "refresh_tokens_userId_idx" ON public.refresh_tokens USING btree ("userId");


--
-- Name: replenishment_plans_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "replenishment_plans_organizationId_idx" ON public.replenishment_plans USING btree ("organizationId");


--
-- Name: replenishment_plans_reviewTaskId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "replenishment_plans_reviewTaskId_key" ON public.replenishment_plans USING btree ("reviewTaskId");


--
-- Name: replenishment_plans_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX replenishment_plans_status_idx ON public.replenishment_plans USING btree (status);


--
-- Name: replenishment_plans_supplySkuId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "replenishment_plans_supplySkuId_idx" ON public.replenishment_plans USING btree ("supplySkuId");


--
-- Name: replenishment_plans_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "replenishment_plans_workspaceId_idx" ON public.replenishment_plans USING btree ("workspaceId");


--
-- Name: research_report_artifacts_organizationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "research_report_artifacts_organizationId_createdAt_idx" ON public.research_report_artifacts USING btree ("organizationId", "createdAt");


--
-- Name: research_report_artifacts_researchRunId_artifactType_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "research_report_artifacts_researchRunId_artifactType_key" ON public.research_report_artifacts USING btree ("researchRunId", "artifactType");


--
-- Name: research_report_artifacts_workspaceId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "research_report_artifacts_workspaceId_createdAt_idx" ON public.research_report_artifacts USING btree ("workspaceId", "createdAt");


--
-- Name: router_decision_logs_org_agent_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX router_decision_logs_org_agent_created_idx ON public.router_decision_logs USING btree ("organizationId", "agentType", "createdAt");


--
-- Name: router_decision_logs_org_decisionKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "router_decision_logs_org_decisionKey_key" ON public.router_decision_logs USING btree ("organizationId", "decisionKey");


--
-- Name: router_decision_logs_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX router_decision_logs_run_idx ON public.router_decision_logs USING btree ("runId");


--
-- Name: scoring_versions_one_active_per_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX scoring_versions_one_active_per_scope ON public.scoring_versions USING btree ("organizationId", "workspaceScopeKey") WHERE (status = 'ACTIVE'::public."ScoringVersionStatus");


--
-- Name: scoring_versions_organizationId_workspaceScopeKey_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "scoring_versions_organizationId_workspaceScopeKey_status_idx" ON public.scoring_versions USING btree ("organizationId", "workspaceScopeKey", status);


--
-- Name: scoring_versions_organizationId_workspaceScopeKey_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "scoring_versions_organizationId_workspaceScopeKey_version_key" ON public.scoring_versions USING btree ("organizationId", "workspaceScopeKey", version);


--
-- Name: sops_createdBy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sops_createdBy_idx" ON public.sops USING btree ("createdBy");


--
-- Name: sops_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sops_organizationId_idx" ON public.sops USING btree ("organizationId");


--
-- Name: sops_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sops_status_idx ON public.sops USING btree (status);


--
-- Name: store_agent_profiles_workspaceId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "store_agent_profiles_workspaceId_key" ON public.store_agent_profiles USING btree ("workspaceId");


--
-- Name: store_metric_snapshots_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX store_metric_snapshots_date_idx ON public.store_metric_snapshots USING btree (date);


--
-- Name: store_metric_snapshots_workspaceId_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "store_metric_snapshots_workspaceId_date_key" ON public.store_metric_snapshots USING btree ("workspaceId", date);


--
-- Name: store_metric_snapshots_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "store_metric_snapshots_workspaceId_idx" ON public.store_metric_snapshots USING btree ("workspaceId");


--
-- Name: stripe_webhook_events_eventType_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "stripe_webhook_events_eventType_createdAt_idx" ON public.stripe_webhook_events USING btree ("eventType", "createdAt");


--
-- Name: stripe_webhook_events_processedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "stripe_webhook_events_processedAt_idx" ON public.stripe_webhook_events USING btree ("processedAt");


--
-- Name: stripe_webhook_events_provider_livemode_providerEventId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "stripe_webhook_events_provider_livemode_providerEventId_key" ON public.stripe_webhook_events USING btree (provider, livemode, "providerEventId");


--
-- Name: stripe_webhook_events_resolvedOrganizationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "stripe_webhook_events_resolvedOrganizationId_createdAt_idx" ON public.stripe_webhook_events USING btree ("resolvedOrganizationId", "createdAt");


--
-- Name: suppliers_organizationId_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "suppliers_organizationId_code_key" ON public.suppliers USING btree ("organizationId", code);


--
-- Name: suppliers_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "suppliers_organizationId_idx" ON public.suppliers USING btree ("organizationId");


--
-- Name: suppliers_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX suppliers_status_idx ON public.suppliers USING btree (status);


--
-- Name: suppliers_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "suppliers_workspaceId_idx" ON public.suppliers USING btree ("workspaceId");


--
-- Name: supply_skus_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supply_skus_organizationId_idx" ON public.supply_skus USING btree ("organizationId");


--
-- Name: supply_skus_organizationId_workspaceId_supplierId_sku_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "supply_skus_organizationId_workspaceId_supplierId_sku_key" ON public.supply_skus USING btree ("organizationId", "workspaceId", "supplierId", sku);


--
-- Name: supply_skus_productId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supply_skus_productId_idx" ON public.supply_skus USING btree ("productId");


--
-- Name: supply_skus_supplierId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supply_skus_supplierId_idx" ON public.supply_skus USING btree ("supplierId");


--
-- Name: supply_skus_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supply_skus_workspaceId_idx" ON public.supply_skus USING btree ("workspaceId");


--
-- Name: team_tasks_assigneeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "team_tasks_assigneeId_idx" ON public.team_tasks USING btree ("assigneeId");


--
-- Name: team_tasks_createdBy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "team_tasks_createdBy_idx" ON public.team_tasks USING btree ("createdBy");


--
-- Name: team_tasks_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "team_tasks_organizationId_idx" ON public.team_tasks USING btree ("organizationId");


--
-- Name: team_tasks_priority_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_tasks_priority_idx ON public.team_tasks USING btree (priority);


--
-- Name: team_tasks_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_tasks_status_idx ON public.team_tasks USING btree (status);


--
-- Name: team_tasks_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "team_tasks_workspaceId_idx" ON public.team_tasks USING btree ("workspaceId");


--
-- Name: training_jobs_inputHash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "training_jobs_inputHash_idx" ON public.training_jobs USING btree ("inputHash");


--
-- Name: training_jobs_org_agent_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX training_jobs_org_agent_status_idx ON public.training_jobs USING btree ("organizationId", "agentType", status);


--
-- Name: trend_insights_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trend_insights_category_idx ON public.trend_insights USING btree (category);


--
-- Name: trend_insights_keyword_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trend_insights_keyword_idx ON public.trend_insights USING btree (keyword);


--
-- Name: trend_insights_observedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "trend_insights_observedAt_idx" ON public.trend_insights USING btree ("observedAt");


--
-- Name: trend_insights_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "trend_insights_organizationId_idx" ON public.trend_insights USING btree ("organizationId");


--
-- Name: trend_insights_workspaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "trend_insights_workspaceId_idx" ON public.trend_insights USING btree ("workspaceId");


--
-- Name: user_consents_type_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_consents_type_version_idx ON public.user_consents USING btree (type, version);


--
-- Name: user_consents_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_consents_userId_idx" ON public.user_consents USING btree ("userId");


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: users_lockedUntil_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "users_lockedUntil_idx" ON public.users USING btree ("lockedUntil");


--
-- Name: workspaces_channelType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "workspaces_channelType_idx" ON public.workspaces USING btree ("channelType");


--
-- Name: workspaces_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "workspaces_organizationId_idx" ON public.workspaces USING btree ("organizationId");


--
-- Name: workspaces_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspaces_status_idx ON public.workspaces USING btree (status);


--
-- Name: action_proposals action_proposals_immutable_payload; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER action_proposals_immutable_payload BEFORE UPDATE ON public.action_proposals FOR EACH ROW EXECUTE FUNCTION public.prevent_action_proposal_payload_mutation();


--
-- Name: external_submissions external_submissions_immutable_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER external_submissions_immutable_identity BEFORE UPDATE ON public.external_submissions FOR EACH ROW EXECUTE FUNCTION public.prevent_external_submission_identity_mutation();


--
-- Name: listing_publish_snapshots listing_publish_snapshots_immutable_payload; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listing_publish_snapshots_immutable_payload BEFORE UPDATE ON public.listing_publish_snapshots FOR EACH ROW EXECUTE FUNCTION public.prevent_listing_publish_snapshot_payload_mutation();


--
-- Name: action_proposals action_proposals_notificationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_proposals
    ADD CONSTRAINT "action_proposals_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES public.notifications(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: action_proposals action_proposals_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_proposals
    ADD CONSTRAINT "action_proposals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_autonomy_daily_metrics agent_autonomy_daily_metrics_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_autonomy_daily_metrics
    ADD CONSTRAINT "agent_autonomy_daily_metrics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_autonomy_policies agent_autonomy_policies_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_autonomy_policies
    ADD CONSTRAINT "agent_autonomy_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_autonomy_policies agent_autonomy_policies_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_autonomy_policies
    ADD CONSTRAINT "agent_autonomy_policies_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_capability_tokens agent_capability_tokens_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_capability_tokens
    ADD CONSTRAINT "agent_capability_tokens_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_capability_tokens agent_capability_tokens_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_capability_tokens
    ADD CONSTRAINT "agent_capability_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_capability_tokens agent_capability_tokens_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_capability_tokens
    ADD CONSTRAINT "agent_capability_tokens_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_eval_snapshots agent_eval_snapshots_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_eval_snapshots
    ADD CONSTRAINT "agent_eval_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_experience_cards agent_experience_cards_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_experience_cards
    ADD CONSTRAINT "agent_experience_cards_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_experience_cards agent_experience_cards_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_experience_cards
    ADD CONSTRAINT "agent_experience_cards_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: agent_plans agent_plans_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_plans
    ADD CONSTRAINT "agent_plans_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public.assistant_sessions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_plans agent_plans_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_plans
    ADD CONSTRAINT "agent_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_run_leases agent_run_leases_runId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_run_leases
    ADD CONSTRAINT "agent_run_leases_runId_fkey" FOREIGN KEY ("runId") REFERENCES public.agent_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_runs agent_runs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT "agent_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_runs agent_runs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT "agent_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: agent_runs agent_runs_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT "agent_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: agent_steps agent_steps_runId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_steps
    ADD CONSTRAINT "agent_steps_runId_fkey" FOREIGN KEY ("runId") REFERENCES public.agent_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_tool_executions agent_tool_executions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tool_executions
    ADD CONSTRAINT "agent_tool_executions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_tool_executions agent_tool_executions_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tool_executions
    ADD CONSTRAINT "agent_tool_executions_planId_fkey" FOREIGN KEY ("planId") REFERENCES public.agent_plans(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_transitions agent_transitions_runId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_transitions
    ADD CONSTRAINT "agent_transitions_runId_fkey" FOREIGN KEY ("runId") REFERENCES public.agent_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_work_memories agent_work_memories_agentRunId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_work_memories
    ADD CONSTRAINT "agent_work_memories_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES public.agent_runs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: agent_work_memories agent_work_memories_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_work_memories
    ADD CONSTRAINT "agent_work_memories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agent_work_memories agent_work_memories_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_work_memories
    ADD CONSTRAINT "agent_work_memories_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: alerts alerts_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT "alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: alerts alerts_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT "alerts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: approval_decisions approval_decisions_actionProposalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_decisions
    ADD CONSTRAINT "approval_decisions_actionProposalId_fkey" FOREIGN KEY ("actionProposalId") REFERENCES public.action_proposals(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: approval_decisions approval_decisions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_decisions
    ADD CONSTRAINT "approval_decisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: approval_decisions approval_decisions_sandboxReportId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_decisions
    ADD CONSTRAINT "approval_decisions_sandboxReportId_fkey" FOREIGN KEY ("sandboxReportId") REFERENCES public.listing_sandbox_reports(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: assistant_messages assistant_messages_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_messages
    ADD CONSTRAINT "assistant_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public.assistant_sessions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: assistant_sessions assistant_sessions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_sessions
    ADD CONSTRAINT "assistant_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: assistant_sessions assistant_sessions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_sessions
    ADD CONSTRAINT "assistant_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: assistant_sessions assistant_sessions_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_sessions
    ADD CONSTRAINT "assistant_sessions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: audit_archives audit_archives_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_archives
    ADD CONSTRAINT "audit_archives_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: audit_chain_heads audit_chain_heads_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_chain_heads
    ADD CONSTRAINT "audit_chain_heads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: audit_logs audit_logs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: automation_flows automation_flows_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_flows
    ADD CONSTRAINT "automation_flows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: automation_flows automation_flows_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_flows
    ADD CONSTRAINT "automation_flows_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: automation_runs automation_runs_flowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT "automation_runs_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES public.automation_flows(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: automation_step_executions automation_step_executions_automationRunId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_step_executions
    ADD CONSTRAINT "automation_step_executions_automationRunId_fkey" FOREIGN KEY ("automationRunId") REFERENCES public.automation_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: automation_step_executions automation_step_executions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_step_executions
    ADD CONSTRAINT "automation_step_executions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: business_outcomes business_outcomes_opportunityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_outcomes
    ADD CONSTRAINT "business_outcomes_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES public.product_opportunities(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: business_outcomes business_outcomes_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_outcomes
    ADD CONSTRAINT "business_outcomes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: business_outcomes business_outcomes_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_outcomes
    ADD CONSTRAINT "business_outcomes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: channel_connections channel_connections_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_connections
    ADD CONSTRAINT "channel_connections_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: email_verification_tokens email_verification_tokens_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: enterprise_slo_daily_snapshots enterprise_slo_daily_snapshots_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enterprise_slo_daily_snapshots
    ADD CONSTRAINT "enterprise_slo_daily_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: external_submissions external_submissions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_submissions
    ADD CONSTRAINT "external_submissions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: external_submissions external_submissions_productLaunchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_submissions
    ADD CONSTRAINT "external_submissions_productLaunchId_fkey" FOREIGN KEY ("productLaunchId") REFERENCES public.product_launches(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: external_submissions external_submissions_publishSnapshotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_submissions
    ADD CONSTRAINT "external_submissions_publishSnapshotId_fkey" FOREIGN KEY ("publishSnapshotId") REFERENCES public.listing_publish_snapshots(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: feedback_signals feedback_signals_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_signals
    ADD CONSTRAINT "feedback_signals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: feedback_signals feedback_signals_runId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_signals
    ADD CONSTRAINT "feedback_signals_runId_fkey" FOREIGN KEY ("runId") REFERENCES public.agent_runs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: file_assets file_assets_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_assets
    ADD CONSTRAINT "file_assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: file_assets file_assets_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_assets
    ADD CONSTRAINT "file_assets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: image_prompt_projects image_prompt_projects_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_prompt_projects
    ADD CONSTRAINT "image_prompt_projects_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: image_prompt_projects image_prompt_projects_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_prompt_projects
    ADD CONSTRAINT "image_prompt_projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: image_prompt_projects image_prompt_projects_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_prompt_projects
    ADD CONSTRAINT "image_prompt_projects_productId_fkey" FOREIGN KEY ("productId") REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: image_prompt_projects image_prompt_projects_referenceAssetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_prompt_projects
    ADD CONSTRAINT "image_prompt_projects_referenceAssetId_fkey" FOREIGN KEY ("referenceAssetId") REFERENCES public.file_assets(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: image_prompt_projects image_prompt_projects_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_prompt_projects
    ADD CONSTRAINT "image_prompt_projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: invoices invoices_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: keyword_reports keyword_reports_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_reports
    ADD CONSTRAINT "keyword_reports_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: keyword_reports keyword_reports_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_reports
    ADD CONSTRAINT "keyword_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: keyword_reports keyword_reports_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_reports
    ADD CONSTRAINT "keyword_reports_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: knowledge_documents knowledge_documents_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT "knowledge_documents_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: knowledge_documents knowledge_documents_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT "knowledge_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: knowledge_documents knowledge_documents_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT "knowledge_documents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: listing_drafts listing_drafts_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_drafts
    ADD CONSTRAINT "listing_drafts_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: listing_drafts listing_drafts_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_drafts
    ADD CONSTRAINT "listing_drafts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: listing_drafts listing_drafts_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_drafts
    ADD CONSTRAINT "listing_drafts_productId_fkey" FOREIGN KEY ("productId") REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: listing_drafts listing_drafts_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_drafts
    ADD CONSTRAINT "listing_drafts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: listing_publish_snapshots listing_publish_snapshots_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_publish_snapshots
    ADD CONSTRAINT "listing_publish_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: listing_publish_snapshots listing_publish_snapshots_productLaunchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_publish_snapshots
    ADD CONSTRAINT "listing_publish_snapshots_productLaunchId_fkey" FOREIGN KEY ("productLaunchId") REFERENCES public.product_launches(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: listing_sandbox_reports listing_sandbox_reports_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_sandbox_reports
    ADD CONSTRAINT "listing_sandbox_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: listing_sandbox_reports listing_sandbox_reports_publishSnapshotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_sandbox_reports
    ADD CONSTRAINT "listing_sandbox_reports_publishSnapshotId_fkey" FOREIGN KEY ("publishSnapshotId") REFERENCES public.listing_publish_snapshots(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: market_observation_batches market_observation_batches_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_observation_batches
    ADD CONSTRAINT "market_observation_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: market_observation_batches market_observation_batches_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_observation_batches
    ADD CONSTRAINT "market_observation_batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: market_observation_batches market_observation_batches_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_observation_batches
    ADD CONSTRAINT "market_observation_batches_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: market_observation_items market_observation_items_batchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_observation_items
    ADD CONSTRAINT "market_observation_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES public.market_observation_batches(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: market_observation_items market_observation_items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_observation_items
    ADD CONSTRAINT "market_observation_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: marketplace_orders marketplace_orders_channelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_orders
    ADD CONSTRAINT "marketplace_orders_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES public.channel_connections(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: marketplace_orders marketplace_orders_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_orders
    ADD CONSTRAINT "marketplace_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: marketplace_orders marketplace_orders_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_orders
    ADD CONSTRAINT "marketplace_orders_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: mcp_tool_invocations mcp_tool_invocations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tool_invocations
    ADD CONSTRAINT "mcp_tool_invocations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: mcp_tool_invocations mcp_tool_invocations_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tool_invocations
    ADD CONSTRAINT "mcp_tool_invocations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: memberships memberships_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: memberships memberships_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notifications notifications_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notifications notifications_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: policy_rule_hits policy_rule_hits_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_rule_hits
    ADD CONSTRAINT "policy_rule_hits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: policy_rule_hits policy_rule_hits_sandboxReportId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_rule_hits
    ADD CONSTRAINT "policy_rule_hits_sandboxReportId_fkey" FOREIGN KEY ("sandboxReportId") REFERENCES public.listing_sandbox_reports(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_candidates product_candidates_legacyReportId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_candidates
    ADD CONSTRAINT "product_candidates_legacyReportId_fkey" FOREIGN KEY ("legacyReportId") REFERENCES public.product_research_reports(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_candidates product_candidates_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_candidates
    ADD CONSTRAINT "product_candidates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_candidates product_candidates_researchRunId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_candidates
    ADD CONSTRAINT "product_candidates_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES public.product_research_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_candidates product_candidates_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_candidates
    ADD CONSTRAINT "product_candidates_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_feedback product_feedback_candidateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_feedback
    ADD CONSTRAINT "product_feedback_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES public.product_candidates(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_feedback product_feedback_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_feedback
    ADD CONSTRAINT "product_feedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_feedback product_feedback_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_feedback
    ADD CONSTRAINT "product_feedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_launches product_launches_imageProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_launches
    ADD CONSTRAINT "product_launches_imageProjectId_fkey" FOREIGN KEY ("imageProjectId") REFERENCES public.image_prompt_projects(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_launches product_launches_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_launches
    ADD CONSTRAINT "product_launches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_launches product_launches_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_launches
    ADD CONSTRAINT "product_launches_productId_fkey" FOREIGN KEY ("productId") REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_launches product_launches_referenceAssetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_launches
    ADD CONSTRAINT "product_launches_referenceAssetId_fkey" FOREIGN KEY ("referenceAssetId") REFERENCES public.file_assets(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_launches product_launches_reviewTaskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_launches
    ADD CONSTRAINT "product_launches_reviewTaskId_fkey" FOREIGN KEY ("reviewTaskId") REFERENCES public.review_tasks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_launches product_launches_selectedPublishSnapshotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_launches
    ADD CONSTRAINT "product_launches_selectedPublishSnapshotId_fkey" FOREIGN KEY ("selectedPublishSnapshotId") REFERENCES public.listing_publish_snapshots(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_opportunities product_opportunities_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_opportunities
    ADD CONSTRAINT "product_opportunities_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: product_opportunities product_opportunities_observationItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_opportunities
    ADD CONSTRAINT "product_opportunities_observationItemId_fkey" FOREIGN KEY ("observationItemId") REFERENCES public.market_observation_items(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_opportunities product_opportunities_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_opportunities
    ADD CONSTRAINT "product_opportunities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_opportunities product_opportunities_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_opportunities
    ADD CONSTRAINT "product_opportunities_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_research_candidate_decisions product_research_candidate_decisions_candidateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_candidate_decisions
    ADD CONSTRAINT "product_research_candidate_decisions_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES public.product_candidates(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_research_candidate_decisions product_research_candidate_decisions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_candidate_decisions
    ADD CONSTRAINT "product_research_candidate_decisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_research_candidate_decisions product_research_candidate_decisions_reportId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_candidate_decisions
    ADD CONSTRAINT "product_research_candidate_decisions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES public.product_research_reports(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_research_candidate_decisions product_research_candidate_decisions_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_candidate_decisions
    ADD CONSTRAINT "product_research_candidate_decisions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_research_reports product_research_reports_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_reports
    ADD CONSTRAINT "product_research_reports_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: product_research_reports product_research_reports_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_reports
    ADD CONSTRAINT "product_research_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_research_reports product_research_reports_researchRunId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_reports
    ADD CONSTRAINT "product_research_reports_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES public.product_research_runs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_research_reports product_research_reports_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_reports
    ADD CONSTRAINT "product_research_reports_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_research_runs product_research_runs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_runs
    ADD CONSTRAINT "product_research_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_research_runs product_research_runs_parentRunId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_runs
    ADD CONSTRAINT "product_research_runs_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES public.product_research_runs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_research_runs product_research_runs_scoringVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_runs
    ADD CONSTRAINT "product_research_runs_scoringVersionId_fkey" FOREIGN KEY ("scoringVersionId") REFERENCES public.scoring_versions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_research_runs product_research_runs_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_runs
    ADD CONSTRAINT "product_research_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_research_source_health product_research_source_health_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_source_health
    ADD CONSTRAINT "product_research_source_health_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_research_source_health product_research_source_health_researchRunId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_source_health
    ADD CONSTRAINT "product_research_source_health_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES public.product_research_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_research_source_health product_research_source_health_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_source_health
    ADD CONSTRAINT "product_research_source_health_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_research_stage_runs product_research_stage_runs_researchRunId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_research_stage_runs
    ADD CONSTRAINT "product_research_stage_runs_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES public.product_research_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_risk_records product_risk_records_candidateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_risk_records
    ADD CONSTRAINT "product_risk_records_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES public.product_candidates(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_risk_records product_risk_records_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_risk_records
    ADD CONSTRAINT "product_risk_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_risk_records product_risk_records_researchRunId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_risk_records
    ADD CONSTRAINT "product_risk_records_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES public.product_research_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_risk_records product_risk_records_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_risk_records
    ADD CONSTRAINT "product_risk_records_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_scores product_scores_candidateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_scores
    ADD CONSTRAINT "product_scores_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES public.product_candidates(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_scores product_scores_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_scores
    ADD CONSTRAINT "product_scores_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_scores product_scores_researchRunId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_scores
    ADD CONSTRAINT "product_scores_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES public.product_research_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_scores product_scores_scoringVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_scores
    ADD CONSTRAINT "product_scores_scoringVersionId_fkey" FOREIGN KEY ("scoringVersionId") REFERENCES public.scoring_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: product_scores product_scores_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_scores
    ADD CONSTRAINT "product_scores_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_signals product_signals_candidateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_signals
    ADD CONSTRAINT "product_signals_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES public.product_candidates(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_signals product_signals_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_signals
    ADD CONSTRAINT "product_signals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_signals product_signals_researchRunId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_signals
    ADD CONSTRAINT "product_signals_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES public.product_research_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_signals product_signals_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_signals
    ADD CONSTRAINT "product_signals_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: products products_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT "products_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: profit_calculations profit_calculations_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profit_calculations
    ADD CONSTRAINT "profit_calculations_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: profit_calculations profit_calculations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profit_calculations
    ADD CONSTRAINT "profit_calculations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: profit_calculations profit_calculations_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profit_calculations
    ADD CONSTRAINT "profit_calculations_productId_fkey" FOREIGN KEY ("productId") REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: profit_calculations profit_calculations_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profit_calculations
    ADD CONSTRAINT "profit_calculations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: prompt_templates prompt_templates_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_templates
    ADD CONSTRAINT "prompt_templates_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: prompt_templates prompt_templates_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_templates
    ADD CONSTRAINT "prompt_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: prompt_versions prompt_versions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_versions
    ADD CONSTRAINT "prompt_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: replenishment_plans replenishment_plans_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replenishment_plans
    ADD CONSTRAINT "replenishment_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: replenishment_plans replenishment_plans_supplySkuId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replenishment_plans
    ADD CONSTRAINT "replenishment_plans_supplySkuId_fkey" FOREIGN KEY ("supplySkuId") REFERENCES public.supply_skus(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: replenishment_plans replenishment_plans_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replenishment_plans
    ADD CONSTRAINT "replenishment_plans_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: research_report_artifacts research_report_artifacts_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_report_artifacts
    ADD CONSTRAINT "research_report_artifacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: research_report_artifacts research_report_artifacts_researchRunId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_report_artifacts
    ADD CONSTRAINT "research_report_artifacts_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES public.product_research_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: research_report_artifacts research_report_artifacts_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_report_artifacts
    ADD CONSTRAINT "research_report_artifacts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: review_tasks review_tasks_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_tasks
    ADD CONSTRAINT "review_tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: router_decision_logs router_decision_logs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.router_decision_logs
    ADD CONSTRAINT "router_decision_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: router_decision_logs router_decision_logs_runId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.router_decision_logs
    ADD CONSTRAINT "router_decision_logs_runId_fkey" FOREIGN KEY ("runId") REFERENCES public.agent_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: scoring_versions scoring_versions_basedOnVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoring_versions
    ADD CONSTRAINT "scoring_versions_basedOnVersionId_fkey" FOREIGN KEY ("basedOnVersionId") REFERENCES public.scoring_versions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: scoring_versions scoring_versions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoring_versions
    ADD CONSTRAINT "scoring_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: scoring_versions scoring_versions_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoring_versions
    ADD CONSTRAINT "scoring_versions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: sops sops_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sops
    ADD CONSTRAINT "sops_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sops sops_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sops
    ADD CONSTRAINT "sops_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: store_agent_profiles store_agent_profiles_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_agent_profiles
    ADD CONSTRAINT "store_agent_profiles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: store_metric_snapshots store_metric_snapshots_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_metric_snapshots
    ADD CONSTRAINT "store_metric_snapshots_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: suppliers suppliers_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT "suppliers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: suppliers suppliers_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT "suppliers_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: supply_skus supply_skus_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_skus
    ADD CONSTRAINT "supply_skus_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: supply_skus supply_skus_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_skus
    ADD CONSTRAINT "supply_skus_productId_fkey" FOREIGN KEY ("productId") REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: supply_skus supply_skus_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_skus
    ADD CONSTRAINT "supply_skus_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public.suppliers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: supply_skus supply_skus_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_skus
    ADD CONSTRAINT "supply_skus_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: team_tasks team_tasks_assigneeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_tasks
    ADD CONSTRAINT "team_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: team_tasks team_tasks_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_tasks
    ADD CONSTRAINT "team_tasks_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: team_tasks team_tasks_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_tasks
    ADD CONSTRAINT "team_tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: team_tasks team_tasks_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_tasks
    ADD CONSTRAINT "team_tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: training_jobs training_jobs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_jobs
    ADD CONSTRAINT "training_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trend_insights trend_insights_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trend_insights
    ADD CONSTRAINT "trend_insights_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trend_insights trend_insights_workspaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trend_insights
    ADD CONSTRAINT "trend_insights_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: workspaces workspaces_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT "workspaces_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: action_proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.action_proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: action_proposals action_proposals_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY action_proposals_organization_isolation ON public.action_proposals USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: agent_autonomy_daily_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_autonomy_daily_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_autonomy_daily_metrics agent_autonomy_daily_metrics_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_autonomy_daily_metrics_organization_isolation ON public.agent_autonomy_daily_metrics USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: agent_autonomy_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_autonomy_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_autonomy_policies agent_autonomy_policies_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_autonomy_policies_organization_isolation ON public.agent_autonomy_policies USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: agent_capability_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_capability_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_capability_tokens agent_capability_tokens_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_capability_tokens_organization_isolation ON public.agent_capability_tokens USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: agent_eval_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_eval_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_eval_snapshots agent_eval_snapshots_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_eval_snapshots_organization_isolation ON public.agent_eval_snapshots USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: agent_experience_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_experience_cards ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_experience_cards agent_experience_cards_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_experience_cards_organization_isolation ON public.agent_experience_cards USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: agent_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_plans agent_plans_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_plans_organization_isolation ON public.agent_plans USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: agent_run_leases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_run_leases ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_run_leases agent_run_leases_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_run_leases_organization_isolation ON public.agent_run_leases USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: agent_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_runs agent_runs_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_runs_organization_isolation ON public.agent_runs USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: agent_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_steps agent_steps_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_steps_organization_isolation ON public.agent_steps USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: agent_tool_executions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_tool_executions ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_tool_executions agent_tool_executions_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_tool_executions_organization_isolation ON public.agent_tool_executions USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: agent_transitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_transitions ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_transitions agent_transitions_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_transitions_organization_isolation ON public.agent_transitions USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: agent_work_memories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_work_memories ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_work_memories agent_work_memories_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_work_memories_organization_isolation ON public.agent_work_memories USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: alerts alerts_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alerts_organization_isolation ON public.alerts USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: approval_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_decisions ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_decisions approval_decisions_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_decisions_organization_isolation ON public.approval_decisions USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: assistant_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_messages assistant_messages_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assistant_messages_organization_isolation ON public.assistant_messages USING ((EXISTS ( SELECT 1
   FROM public.assistant_sessions parent
  WHERE ((parent.id = assistant_messages."sessionId") AND (parent."organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.assistant_sessions parent
  WHERE ((parent.id = assistant_messages."sessionId") AND (parent."organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))))));


--
-- Name: assistant_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistant_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_sessions assistant_sessions_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assistant_sessions_organization_isolation ON public.assistant_sessions USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: audit_archives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_archives ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_archives audit_archives_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_archives_organization_isolation ON public.audit_archives USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: audit_chain_heads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_chain_heads ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_chain_heads audit_chain_heads_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_chain_heads_organization_isolation ON public.audit_chain_heads USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_organization_isolation ON public.audit_logs USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: automation_flows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automation_flows ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_flows automation_flows_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY automation_flows_organization_isolation ON public.automation_flows USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: automation_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_runs automation_runs_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY automation_runs_organization_isolation ON public.automation_runs USING ((EXISTS ( SELECT 1
   FROM public.automation_flows parent
  WHERE ((parent.id = automation_runs."flowId") AND (parent."organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.automation_flows parent
  WHERE ((parent.id = automation_runs."flowId") AND (parent."organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))))));


--
-- Name: automation_step_executions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automation_step_executions ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_step_executions automation_step_executions_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY automation_step_executions_organization_isolation ON public.automation_step_executions USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: business_outcomes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_outcomes ENABLE ROW LEVEL SECURITY;

--
-- Name: business_outcomes business_outcomes_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY business_outcomes_organization_isolation ON public.business_outcomes USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: channel_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_connections channel_connections_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY channel_connections_organization_isolation ON public.channel_connections USING ((EXISTS ( SELECT 1
   FROM public.workspaces
  WHERE ((workspaces.id = channel_connections."workspaceId") AND (workspaces."organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspaces
  WHERE ((workspaces.id = channel_connections."workspaceId") AND (workspaces."organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))))));


--
-- Name: dead_letter_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dead_letter_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: dead_letter_jobs dead_letter_jobs_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dead_letter_jobs_organization_isolation ON public.dead_letter_jobs USING ((("organizationId" IS NOT NULL) AND ("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)))) WITH CHECK ((("organizationId" IS NOT NULL) AND ("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))));


--
-- Name: enterprise_slo_daily_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enterprise_slo_daily_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: enterprise_slo_daily_snapshots enterprise_slo_daily_snapshots_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY enterprise_slo_daily_snapshots_organization_isolation ON public.enterprise_slo_daily_snapshots USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: external_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.external_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: external_submissions external_submissions_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY external_submissions_organization_isolation ON public.external_submissions USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: feedback_signals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback_signals ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback_signals feedback_signals_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY feedback_signals_organization_isolation ON public.feedback_signals USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: file_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.file_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: file_assets file_assets_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY file_assets_organization_isolation ON public.file_assets USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: image_prompt_projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.image_prompt_projects ENABLE ROW LEVEL SECURITY;

--
-- Name: image_prompt_projects image_prompt_projects_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY image_prompt_projects_organization_isolation ON public.image_prompt_projects USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_organization_isolation ON public.invoices USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: keyword_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.keyword_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: keyword_reports keyword_reports_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY keyword_reports_organization_isolation ON public.keyword_reports USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: knowledge_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_documents knowledge_documents_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY knowledge_documents_organization_isolation ON public.knowledge_documents USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: listing_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_drafts listing_drafts_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_drafts_organization_isolation ON public.listing_drafts USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: listing_publish_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_publish_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_publish_snapshots listing_publish_snapshots_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_publish_snapshots_organization_isolation ON public.listing_publish_snapshots USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: listing_sandbox_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_sandbox_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_sandbox_reports listing_sandbox_reports_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_sandbox_reports_organization_isolation ON public.listing_sandbox_reports USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: market_observation_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.market_observation_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: market_observation_batches market_observation_batches_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY market_observation_batches_organization_isolation ON public.market_observation_batches USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: market_observation_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.market_observation_items ENABLE ROW LEVEL SECURITY;

--
-- Name: market_observation_items market_observation_items_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY market_observation_items_organization_isolation ON public.market_observation_items USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: marketplace_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_orders marketplace_orders_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketplace_orders_organization_isolation ON public.marketplace_orders USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: mcp_tool_invocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mcp_tool_invocations ENABLE ROW LEVEL SECURITY;

--
-- Name: mcp_tool_invocations mcp_tool_invocations_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mcp_tool_invocations_organization_isolation ON public.mcp_tool_invocations USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: memberships memberships_login_bootstrap; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_login_bootstrap ON public.memberships FOR SELECT USING (("userId" = NULLIF(current_setting('app.current_user_id'::text, true), ''::text)));


--
-- Name: memberships memberships_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_organization_isolation ON public.memberships USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_organization_isolation ON public.notifications USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: outbox_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

--
-- Name: outbox_events outbox_events_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY outbox_events_organization_isolation ON public.outbox_events USING ((("organizationId" IS NOT NULL) AND ("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)))) WITH CHECK ((("organizationId" IS NOT NULL) AND ("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))));


--
-- Name: policy_rule_hits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.policy_rule_hits ENABLE ROW LEVEL SECURITY;

--
-- Name: policy_rule_hits policy_rule_hits_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY policy_rule_hits_organization_isolation ON public.policy_rule_hits USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: product_candidates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: product_candidates product_candidates_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_candidates_organization_isolation ON public.product_candidates USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: product_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: product_feedback product_feedback_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_feedback_organization_isolation ON public.product_feedback USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: product_launches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_launches ENABLE ROW LEVEL SECURITY;

--
-- Name: product_launches product_launches_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_launches_organization_isolation ON public.product_launches USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: product_opportunities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_opportunities ENABLE ROW LEVEL SECURITY;

--
-- Name: product_opportunities product_opportunities_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_opportunities_organization_isolation ON public.product_opportunities USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: product_research_candidate_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_research_candidate_decisions ENABLE ROW LEVEL SECURITY;

--
-- Name: product_research_candidate_decisions product_research_candidate_decisions_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_research_candidate_decisions_organization_isolation ON public.product_research_candidate_decisions USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: product_research_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_research_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: product_research_reports product_research_reports_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_research_reports_organization_isolation ON public.product_research_reports USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: product_research_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_research_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: product_research_runs product_research_runs_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_research_runs_organization_isolation ON public.product_research_runs USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: product_research_source_health; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_research_source_health ENABLE ROW LEVEL SECURITY;

--
-- Name: product_research_source_health product_research_source_health_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_research_source_health_organization_isolation ON public.product_research_source_health USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: product_research_stage_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_research_stage_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: product_research_stage_runs product_research_stage_runs_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_research_stage_runs_organization_isolation ON public.product_research_stage_runs USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: product_risk_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_risk_records ENABLE ROW LEVEL SECURITY;

--
-- Name: product_risk_records product_risk_records_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_risk_records_organization_isolation ON public.product_risk_records USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: product_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: product_scores product_scores_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_scores_organization_isolation ON public.product_scores USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: product_signals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_signals ENABLE ROW LEVEL SECURITY;

--
-- Name: product_signals product_signals_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_signals_organization_isolation ON public.product_signals USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products products_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_organization_isolation ON public.products USING ((EXISTS ( SELECT 1
   FROM public.workspaces
  WHERE ((workspaces.id = products."workspaceId") AND (workspaces."organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspaces
  WHERE ((workspaces.id = products."workspaceId") AND (workspaces."organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))))));


--
-- Name: profit_calculations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profit_calculations ENABLE ROW LEVEL SECURITY;

--
-- Name: profit_calculations profit_calculations_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profit_calculations_organization_isolation ON public.profit_calculations USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: prompt_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: prompt_templates prompt_templates_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prompt_templates_organization_isolation ON public.prompt_templates USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: prompt_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: prompt_versions prompt_versions_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prompt_versions_organization_isolation ON public.prompt_versions USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: replenishment_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.replenishment_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: replenishment_plans replenishment_plans_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY replenishment_plans_organization_isolation ON public.replenishment_plans USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: research_report_artifacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.research_report_artifacts ENABLE ROW LEVEL SECURITY;

--
-- Name: research_report_artifacts research_report_artifacts_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY research_report_artifacts_organization_isolation ON public.research_report_artifacts USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: review_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.review_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: review_tasks review_tasks_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY review_tasks_organization_isolation ON public.review_tasks USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: router_decision_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.router_decision_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: router_decision_logs router_decision_logs_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY router_decision_logs_organization_isolation ON public.router_decision_logs USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: scoring_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scoring_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: scoring_versions scoring_versions_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scoring_versions_organization_isolation ON public.scoring_versions USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: sops; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sops ENABLE ROW LEVEL SECURITY;

--
-- Name: sops sops_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sops_organization_isolation ON public.sops USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: store_agent_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_agent_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: store_agent_profiles store_agent_profiles_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY store_agent_profiles_organization_isolation ON public.store_agent_profiles USING ((EXISTS ( SELECT 1
   FROM public.workspaces parent
  WHERE ((parent.id = store_agent_profiles."workspaceId") AND (parent."organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspaces parent
  WHERE ((parent.id = store_agent_profiles."workspaceId") AND (parent."organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))))));


--
-- Name: store_metric_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_metric_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: store_metric_snapshots store_metric_snapshots_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY store_metric_snapshots_organization_isolation ON public.store_metric_snapshots USING ((EXISTS ( SELECT 1
   FROM public.workspaces parent
  WHERE ((parent.id = store_metric_snapshots."workspaceId") AND (parent."organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspaces parent
  WHERE ((parent.id = store_metric_snapshots."workspaceId") AND (parent."organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))))));


--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers suppliers_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_organization_isolation ON public.suppliers USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: supply_skus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supply_skus ENABLE ROW LEVEL SECURITY;

--
-- Name: supply_skus supply_skus_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supply_skus_organization_isolation ON public.supply_skus USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: team_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: team_tasks team_tasks_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_tasks_organization_isolation ON public.team_tasks USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: training_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: training_jobs training_jobs_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY training_jobs_organization_isolation ON public.training_jobs USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: trend_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trend_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: trend_insights trend_insights_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trend_insights_organization_isolation ON public.trend_insights USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- Name: workspaces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

--
-- Name: workspaces workspaces_organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspaces_organization_isolation ON public.workspaces USING (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))) WITH CHECK (("organizationId" = NULLIF(current_setting('app.current_organization_id'::text, true), ''::text)));


--
-- PostgreSQL database dump complete
--


