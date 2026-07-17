import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import {
  AgentProviderInterface,
  AgentRunOptions,
  ListingGenerationInput,
  ListingGenerationResult,
  KeywordAnalysisInput,
  ProductResearchInput,
  ProductResearchSourceEvidence,
  GlobalProductDiscoveryInput,
  GlobalProductDiscoveryResult,
  SupplierImageSearchInput,
  SupplierImageSearchCallContext,
  SupplierImageSearchResult,
  TrendAnalysisInput,
  TrendAnalysisResult,
  ImagePromptInput,
  ImageGenerationInput,
  ImageGenerationResult,
  AutomationStepInput,
  PlanAndExecuteInput,
  PlanAndExecuteResult,
  AgentCallContext,
  AgentExecutionOptions,
} from './agent-provider.interface.js';
import {
  supplierImageSearchCallContextSchema,
  supplierImageSearchInputSchema,
  supplierImageSearchResultSchema,
} from './contracts/supplier-image-search.contract.js';
import {
  normalizeKeywordAnalysisResult,
  type KeywordAnalysisResult,
} from './contracts/keyword-analysis.contract.js';
import { asString, asOptionalString } from '../shared/utils/coerce.js';
import {
  getCurrentRequestId,
  getCurrentTraceId,
  getCurrentTraceparent,
} from '../shared/middleware/request-id.middleware.js';
import {
  normalizeRequestId,
  normalizeTraceId,
  parseTraceparent,
  traceparentForTraceId,
} from '../shared/observability/trace-context.js';

const remoteSafeIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,256}$/);
const remoteTraceIdSchema = z.string().regex(/^[a-f0-9]{32}$/i);
const remoteRecordSchema = z
  .record(z.string().max(128), z.unknown())
  .refine((value) => Object.keys(value).length <= 128);
const remoteRunStatusValueSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
]);
const remoteRunResponseSchema = z
  .object({
    runId: remoteSafeIdSchema,
    sessionId: remoteSafeIdSchema,
    status: remoteRunStatusValueSchema,
    traceId: remoteTraceIdSchema,
  })
  .strict();
const remoteRunStatusSchema = z
  .object({
    runId: remoteSafeIdSchema,
    taskType: z.string().regex(/^[a-z_]{1,128}$/),
    status: remoteRunStatusValueSchema,
    progress: remoteRecordSchema,
    result: remoteRecordSchema.nullable(),
    error: z.string().max(4096),
    diagnostics: remoteRecordSchema.nullable(),
    context: remoteRecordSchema,
  })
  .strict();
const listingPricingEvidenceSchema = z
  .object({
    id: z.string().trim().min(1).max(256),
    status: z.literal('VERIFIED'),
    decision: z.literal('PASS'),
    salePrice: z.union([z.number().positive(), z.string().trim().min(1)]),
    currency: z.enum(['RUB', 'USD']),
    validFrom: z.string().datetime({ offset: true }),
    validUntil: z.string().datetime({ offset: true }),
    calculatorVersion: z.string().trim().min(1).max(256),
    inputSetHash: z.string().regex(/^[a-f0-9]{64}$/),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

type RemoteRunDiagnostics = z.infer<typeof remoteRecordSchema>;

class RemoteAgentTaskError extends Error {
  constructor(
    message: string,
    readonly diagnostics?: RemoteRunDiagnostics | null,
  ) {
    super(message);
    this.name = 'RemoteAgentTaskError';
  }
}

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 15 * 60_000;
const GLOBAL_PRODUCT_DISCOVERY_POLL_TIMEOUT_MS = 14 * 60_000;
const SUPPLIER_IMAGE_SEARCH_POLL_TIMEOUT_MS = 3 * 60_000;
const AGENT_HTTP_REQUEST_TIMEOUT_MS = 30_000;
const AGENT_HTTP_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

/**
 * Calls the Python consistency agent (电商设计图保持产品一致性智能体)
 * over its platform integration API (/api/v1/agent/*).
 *
 * Enabled when AGENT_BASE_URL + AGENT_API_KEY are configured; see
 * AgentModule for provider selection.
 */
@Injectable()
export class HttpAgentProvider implements AgentProviderInterface {
  private readonly logger = new Logger(HttpAgentProvider.name);
  private readonly baseUrl: string;
  private readonly publicUrl: string;
  private readonly apiKey: string;

  constructor(configService: ConfigService) {
    this.baseUrl = (configService.get<string>('AGENT_BASE_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    // Browser-facing base for image URLs; defaults to the server-side URL.
    this.publicUrl = (
      configService.get<string>('AGENT_PUBLIC_URL') ?? this.baseUrl
    ).replace(/\/+$/, '');
    this.apiKey = configService.get<string>('AGENT_API_KEY') ?? '';
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
    context?: AgentCallContext,
    options?: { deadlineAt?: number; signal?: AbortSignal },
  ): Promise<T> {
    options?.signal?.throwIfAborted();
    const requestId = normalizeRequestId(
      context?.requestId ?? getCurrentRequestId(),
    );
    const parsedTraceparent = parseTraceparent(
      context?.traceparent ?? getCurrentTraceparent(),
    );
    const traceId =
      parsedTraceparent?.traceId ??
      normalizeTraceId(context?.traceId ?? getCurrentTraceId());
    const traceparent =
      parsedTraceparent?.traceparent ??
      (traceId ? traceparentForTraceId(traceId) : undefined);
    const remainingMs = options?.deadlineAt
      ? options.deadlineAt - Date.now()
      : AGENT_HTTP_REQUEST_TIMEOUT_MS;
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      throw new Error('AGENT_API_REQUEST_TIMEOUT');
    }
    const requestTimeoutMs = Math.min(
      AGENT_HTTP_REQUEST_TIMEOUT_MS,
      Math.max(1, Math.floor(remainingMs)),
    );
    const controller = new AbortController();
    const requestSignal = options?.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          'X-Api-Key': this.apiKey,
          ...(init.body !== undefined
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...(requestId ? { 'X-Request-Id': requestId } : {}),
          ...(traceId ? { 'X-Trace-Id': traceId } : {}),
          ...(traceparent ? { traceparent } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: requestSignal,
      });
      requestSignal.throwIfAborted();
      const text = await this.readBoundedResponseText(res);
      requestSignal.throwIfAborted();
      if (!res.ok) {
        throw new Error(`Agent API ${res.status}`);
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error('AGENT_API_RESPONSE_INVALID_JSON');
      }
    } catch (error) {
      if (
        options?.signal?.aborted &&
        requestSignal.reason === options.signal.reason
      ) {
        options.signal.throwIfAborted();
      }
      if (
        controller.signal.aborted &&
        requestSignal.reason === controller.signal.reason
      ) {
        throw new Error('AGENT_API_REQUEST_TIMEOUT');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readBoundedResponseText(response: Response): Promise<string> {
    const declaredLength = response.headers?.get('content-length');
    if (declaredLength !== null && declaredLength !== undefined) {
      const parsedLength = Number(declaredLength);
      if (
        Number.isFinite(parsedLength) &&
        parsedLength > AGENT_HTTP_MAX_RESPONSE_BYTES
      ) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error('AGENT_API_RESPONSE_TOO_LARGE');
      }
    }

    if (!response.body) {
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > AGENT_HTTP_MAX_RESPONSE_BYTES) {
        throw new Error('AGENT_API_RESPONSE_TOO_LARGE');
      }
      return text;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        totalBytes += value.byteLength;
        if (totalBytes > AGENT_HTTP_MAX_RESPONSE_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new Error('AGENT_API_RESPONSE_TOO_LARGE');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('AGENT_API_RESPONSE_INVALID_UTF8');
    }
  }

  /** Creates a remote run and polls until it reaches a terminal state. */
  private async runRemoteTask(
    taskType: string,
    input: Record<string, unknown>,
    context?: AgentCallContext,
    options?: { pollTimeoutMs?: number; signal?: AbortSignal },
  ): Promise<Record<string, unknown>> {
    options?.signal?.throwIfAborted();
    const pollTimeoutMs = options?.pollTimeoutMs ?? POLL_TIMEOUT_MS;
    if (!Number.isSafeInteger(pollTimeoutMs) || pollTimeoutMs < 1) {
      throw new Error('AGENT_TASK_POLL_TIMEOUT_INVALID');
    }
    const deadline = Date.now() + pollTimeoutMs;
    const createdResponse = await this.request<unknown>(
      '/api/v1/agent/runs',
      { method: 'POST', body: { taskType, input, context: context ?? {} } },
      context,
      { deadlineAt: deadline, signal: options?.signal },
    );
    const created = remoteRunResponseSchema.safeParse(createdResponse);
    if (!created.success) throw new Error('AGENT_API_RESPONSE_INVALID');
    this.logger.log(`Remote ${taskType} run created: ${created.data.runId}`);

    while (Date.now() < deadline) {
      options?.signal?.throwIfAborted();
      const remainingBeforePoll = deadline - Date.now();
      await this.waitForPoll(
        Math.min(POLL_INTERVAL_MS, remainingBeforePoll),
        options?.signal,
      );
      options?.signal?.throwIfAborted();
      if (Date.now() >= deadline) break;
      const statusResponse = await this.request<unknown>(
        `/api/v1/agent/runs/${encodeURIComponent(created.data.runId)}`,
        {},
        context,
        { deadlineAt: deadline, signal: options?.signal },
      );
      const parsedStatus = remoteRunStatusSchema.safeParse(statusResponse);
      if (!parsedStatus.success) throw new Error('AGENT_API_RESPONSE_INVALID');
      const status = parsedStatus.data;
      if (status.runId !== created.data.runId || status.taskType !== taskType) {
        throw new Error('AGENT_API_RESPONSE_INVALID');
      }
      for (const field of ['orgId', 'workspaceId', 'requestId'] as const) {
        const expected = context?.[field];
        if (expected !== undefined && status.context[field] !== expected) {
          throw new Error('AGENT_API_RESPONSE_INVALID');
        }
      }
      if (status.status === 'completed') {
        return status.result ?? {};
      }
      if (status.status === 'failed') {
        throw new RemoteAgentTaskError(
          status.error || 'Agent task failed',
          status.diagnostics,
        );
      }
    }
    options?.signal?.throwIfAborted();
    throw new Error(`Agent task timed out after ${pollTimeoutMs / 1000}s`);
  }

  private async waitForPoll(
    delayMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        signal?.removeEventListener('abort', abort);
        resolve();
      };
      const timer = setTimeout(finish, delayMs);
      const abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        reject(signal?.reason as Error);
      };
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  private absolutize(url: string): string {
    if (!url || /^https?:\/\//i.test(url)) return url;
    return `${this.publicUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  async runImageGeneration(
    input: ImageGenerationInput,
    context?: AgentCallContext,
  ): Promise<ImageGenerationResult> {
    const result = await this.runRemoteTask(
      'generate_images',
      {
        productName: input.productName,
        imageBase64: input.imageBase64,
        imageUrl: input.imageUrl,
        sceneCount: input.sceneCount,
        platforms: input.platforms,
        message: input.message,
      },
      context,
    );

    const images = Array.isArray(result.images)
      ? (result.images as Array<Record<string, unknown>>)
      : [];
    const profile =
      result.profile &&
      typeof result.profile === 'object' &&
      !Array.isArray(result.profile)
        ? (result.profile as Record<string, unknown>)
        : null;
    return {
      sessionId: asString(result.sessionId),
      mockMode: Boolean(result.mockMode),
      supervisionApproved: result.supervisionApproved === true,
      publishable:
        result.publishable === true &&
        result.supervisionApproved === true &&
        !result.mockMode,
      images: images.map((img) => ({
        sceneId: asString(img.sceneId),
        filename: asString(img.filename),
        url: this.absolutize(asString(img.url)),
        background: asOptionalString(img.background),
        props: Array.isArray(img.props)
          ? img.props.map((p) => asString(p))
          : [],
        lighting: asOptionalString(img.lighting),
        emotion: asOptionalString(img.emotion),
        composition: asOptionalString(img.composition),
        prompt: asOptionalString(img.prompt),
        width: typeof img.width === 'number' ? img.width : undefined,
        height: typeof img.height === 'number' ? img.height : undefined,
        mimeType: asOptionalString(img.mimeType),
        sha256: asOptionalString(img.sha256),
        byteSize: typeof img.byteSize === 'number' ? img.byteSize : undefined,
      })),
      consistencyScore:
        typeof result.consistencyScore === 'number'
          ? result.consistencyScore
          : null,
      consistencyPassed:
        typeof result.consistencyPassed === 'boolean'
          ? result.consistencyPassed
          : null,
      compliancePassed:
        typeof result.compliancePassed === 'boolean'
          ? result.compliancePassed
          : null,
      externalConsistencyStatus:
        result.externalConsistencyStatus === 'passed' ||
        result.externalConsistencyStatus === 'failed' ||
        result.externalConsistencyStatus === 'skipped' ||
        result.externalConsistencyStatus === 'error'
          ? result.externalConsistencyStatus
          : null,
      externalConsistencyScore:
        typeof result.externalConsistencyScore === 'number'
          ? result.externalConsistencyScore
          : null,
      externalConsistencyIssues: Array.isArray(result.externalConsistencyIssues)
        ? result.externalConsistencyIssues.map((issue) => asString(issue))
        : [],
      profile,
      scenePlan: Array.isArray(result.scenePlan) ? result.scenePlan : undefined,
      downloadUrl: result.downloadUrl
        ? this.absolutize(asString(result.downloadUrl))
        : undefined,
    };
  }

  async runProductResearch(
    input: ProductResearchInput,
    context?: AgentCallContext,
  ): Promise<{
    summary: string;
    competitors: string[];
    priceRange: { min: number; max: number; currency?: string };
    rating: number | null;
    sourceEvidence?: ProductResearchSourceEvidence;
    runtime?: Record<string, unknown>;
  }> {
    this.logger.log(`Running product research for ${input.productName}`);
    const result = await this.runRemoteTask(
      'product_research',
      {
        productName: input.productName,
        marketplace: input.marketplace,
        locale: input.locale,
        storeContext: input.storeContext,
      },
      context,
    );
    const priceRange =
      result.priceRange &&
      typeof result.priceRange === 'object' &&
      !Array.isArray(result.priceRange)
        ? (result.priceRange as Record<string, unknown>)
        : {};
    const sourceEvidence =
      result.sourceEvidence &&
      typeof result.sourceEvidence === 'object' &&
      !Array.isArray(result.sourceEvidence)
        ? (result.sourceEvidence as ProductResearchSourceEvidence)
        : undefined;
    const runtime =
      result._runtime &&
      typeof result._runtime === 'object' &&
      !Array.isArray(result._runtime)
        ? (result._runtime as Record<string, unknown>)
        : undefined;
    return {
      summary: asString(result.summary),
      competitors: Array.isArray(result.competitors)
        ? (result.competitors as string[])
        : [],
      priceRange: {
        min: Number(priceRange.min ?? Number.NaN),
        max: Number(priceRange.max ?? Number.NaN),
        currency: asOptionalString(priceRange.currency),
      },
      rating:
        typeof result.rating === 'number' && Number.isFinite(result.rating)
          ? result.rating
          : null,
      sourceEvidence,
      runtime,
    };
  }

  async runGlobalProductDiscovery(
    input: GlobalProductDiscoveryInput,
    context?: AgentCallContext,
    executionOptions?: AgentExecutionOptions,
  ): Promise<GlobalProductDiscoveryResult> {
    this.logger.log(
      `Running global product discovery for ${input.businessDate}`,
    );
    const result = await this.runRemoteTask(
      'global_product_discovery',
      {
        businessDate: input.businessDate,
        candidateLimit: input.candidateLimit,
        seedQueries: input.seedQueries,
        explorationKey: input.explorationKey,
        excludedConceptKeys: input.excludedConceptKeys,
        excludedSourcingOfferIds: input.excludedSourcingOfferIds,
      },
      context,
      {
        pollTimeoutMs: GLOBAL_PRODUCT_DISCOVERY_POLL_TIMEOUT_MS,
        ...(executionOptions?.signal
          ? { signal: executionOptions.signal }
          : {}),
      },
    );
    return {
      status: result.status === 'PARTIAL' ? 'PARTIAL' : 'COMPLETED',
      errorCode:
        result.errorCode === 'EVIDENCE_INSUFFICIENT'
          ? 'EVIDENCE_INSUFFICIENT'
          : null,
      candidates: Array.isArray(result.candidates) ? result.candidates : [],
      provider: asOptionalString(result.provider),
      fetchedAt: asOptionalString(result.fetchedAt),
      conceptCount:
        typeof result.conceptCount === 'number' ? result.conceptCount : 0,
      requestedConceptCount:
        typeof result.requestedConceptCount === 'number'
          ? result.requestedConceptCount
          : input.candidateLimit,
      acceptedConceptCount:
        typeof result.acceptedConceptCount === 'number'
          ? result.acceptedConceptCount
          : typeof result.conceptCount === 'number'
            ? result.conceptCount
            : 0,
      rawEvidenceCount:
        typeof result.rawEvidenceCount === 'number'
          ? result.rawEvidenceCount
          : 0,
      partialEvidenceCount:
        typeof result.partialEvidenceCount === 'number'
          ? result.partialEvidenceCount
          : 0,
      evidenceGap:
        result.evidenceGap &&
        typeof result.evidenceGap === 'object' &&
        !Array.isArray(result.evidenceGap)
          ? (result.evidenceGap as Record<string, unknown>)
          : {},
      attemptedProviders: Array.isArray(result.attemptedProviders)
        ? result.attemptedProviders
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 8)
        : [],
      discoveryEvidenceCount:
        typeof result.discoveryEvidenceCount === 'number'
          ? result.discoveryEvidenceCount
          : 0,
      sourcingLeadCount:
        typeof result.sourcingLeadCount === 'number'
          ? result.sourcingLeadCount
          : 0,
      excludedByLightSmallScreen:
        typeof result.excludedByLightSmallScreen === 'number'
          ? result.excludedByLightSmallScreen
          : 0,
      duplicateConceptCount:
        typeof result.duplicateConceptCount === 'number'
          ? result.duplicateConceptCount
          : 0,
      excludedByHistoryCount:
        typeof result.excludedByHistoryCount === 'number'
          ? result.excludedByHistoryCount
          : 0,
      duplicateSourcingOfferCount:
        typeof result.duplicateSourcingOfferCount === 'number'
          ? result.duplicateSourcingOfferCount
          : 0,
      sourcingSearchAttemptCount:
        typeof result.sourcingSearchAttemptCount === 'number'
          ? result.sourcingSearchAttemptCount
          : 0,
      sourcingUnmappedConceptCount:
        typeof result.sourcingUnmappedConceptCount === 'number'
          ? result.sourcingUnmappedConceptCount
          : 0,
      sourcingNoResultCount:
        typeof result.sourcingNoResultCount === 'number'
          ? result.sourcingNoResultCount
          : 0,
      sourcingInvalidUrlCount:
        typeof result.sourcingInvalidUrlCount === 'number'
          ? result.sourcingInvalidUrlCount
          : 0,
      sourcingTermMismatchCount:
        typeof result.sourcingTermMismatchCount === 'number'
          ? result.sourcingTermMismatchCount
          : 0,
      expansionRounds:
        typeof result.expansionRounds === 'number' ? result.expansionRounds : 0,
      shortfall: typeof result.shortfall === 'number' ? result.shortfall : 0,
      exhaustedSources: result.exhaustedSources === true,
      budgetExhausted: result.budgetExhausted === true,
      budgetSeconds:
        typeof result.budgetSeconds === 'number' ? result.budgetSeconds : 0,
      budgetElapsedMs:
        typeof result.budgetElapsedMs === 'number' ? result.budgetElapsedMs : 0,
      searchAttempts:
        typeof result.searchAttempts === 'number' ? result.searchAttempts : 0,
      searchSuccesses:
        typeof result.searchSuccesses === 'number' ? result.searchSuccesses : 0,
      searchFailures: Array.isArray(result.searchFailures)
        ? result.searchFailures
        : [],
      methodology:
        result.methodology &&
        typeof result.methodology === 'object' &&
        !Array.isArray(result.methodology)
          ? (result.methodology as Record<string, unknown>)
          : {},
    };
  }

  async runSupplierImageSearch(
    input: SupplierImageSearchInput,
    context: SupplierImageSearchCallContext,
  ): Promise<SupplierImageSearchResult> {
    const parsedInput = supplierImageSearchInputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw new Error('SUPPLIER_IMAGE_SEARCH_INPUT_INVALID');
    }
    const parsedContext =
      supplierImageSearchCallContextSchema.safeParse(context);
    if (!parsedContext.success) {
      throw new Error('SUPPLIER_IMAGE_SEARCH_CONTEXT_INVALID');
    }

    const result = await this.runRemoteTask(
      'supplier_image_search',
      parsedInput.data,
      parsedContext.data,
      { pollTimeoutMs: SUPPLIER_IMAGE_SEARCH_POLL_TIMEOUT_MS },
    );
    const parsedResult = supplierImageSearchResultSchema.safeParse(result);
    if (!parsedResult.success) {
      throw new Error('SUPPLIER_IMAGE_SEARCH_RESULT_INVALID');
    }
    if (
      parsedResult.data.provenance.requestId !== parsedContext.data.requestId
    ) {
      throw new Error('SUPPLIER_IMAGE_SEARCH_REQUEST_ID_MISMATCH');
    }
    const { outcome, providerResultCount, offers, imageEvidence, provenance } =
      parsedResult.data;
    return {
      outcome,
      providerResultCount,
      offers,
      imageEvidence,
      provenance,
    };
  }

  async runAssistant(
    options: AgentRunOptions,
    context?: AgentCallContext,
  ): Promise<string> {
    this.logger.log(`Running assistant for session ${options.assistantId}`);
    const result = await this.runRemoteTask(
      'assistant_chat',
      {
        assistantId: options.assistantId,
        threadId: options.threadId,
        prompt: options.prompt,
        workspaceId: options.workspaceId,
      },
      context,
    );
    return asString(result.response);
  }

  async runListingGeneration(
    input: ListingGenerationInput,
    context?: AgentCallContext,
  ): Promise<ListingGenerationResult> {
    this.logger.log(`Running listing generation for ${input.productName}`);
    const result = await this.runRemoteTask(
      'listing_generation',
      {
        productName: input.productName,
        description: input.description,
        keywords: input.keywords,
        platform: input.platform,
        tone: input.tone,
        pricingEvidence: input.pricingEvidence,
      },
      context,
    );
    const rawPrice = Number(result.price ?? Number.NaN);
    const parsedEvidence = listingPricingEvidenceSchema.safeParse(
      result.pricingEvidence,
    );
    const evidence = parsedEvidence.success ? parsedEvidence.data : null;
    const evidenceSalePrice = Number(evidence?.salePrice ?? Number.NaN);
    const evidenceIsCurrent =
      evidence !== null &&
      Date.parse(evidence.validFrom) <= Date.now() &&
      Date.parse(evidence.validUntil) > Date.now();
    const evidenceBacked =
      result.pricingStatus === 'EVIDENCE_BACKED' &&
      Number.isFinite(rawPrice) &&
      rawPrice > 0 &&
      Number.isFinite(evidenceSalePrice) &&
      evidenceSalePrice === rawPrice &&
      evidence?.currency === result.priceCurrency &&
      evidenceIsCurrent;
    const pricingMissingFields = Array.isArray(result.pricingMissingFields)
      ? result.pricingMissingFields
          .filter((field): field is string => typeof field === 'string')
          .map((field) => field.trim())
          .filter(Boolean)
          .slice(0, 32)
      : [];
    return {
      title: asString(result.title),
      description: asString(result.description),
      bulletPoints: Array.isArray(result.bulletPoints)
        ? (result.bulletPoints as string[])
        : [],
      keywords: Array.isArray(result.keywords)
        ? (result.keywords as string[])
        : [],
      price: evidenceBacked ? rawPrice : null,
      priceCurrency: evidenceBacked ? evidence.currency : null,
      pricingStatus: evidenceBacked ? 'EVIDENCE_BACKED' : 'DATA_INSUFFICIENT',
      pricingEvidence: evidenceBacked ? evidence : null,
      pricingMissingFields: evidenceBacked
        ? []
        : pricingMissingFields.length
          ? pricingMissingFields
          : ['pricingEvidence'],
      publishable: false,
      requiresHumanReview: true,
    };
  }

  async runKeywordAnalysis(
    input: KeywordAnalysisInput,
    context?: AgentCallContext,
  ): Promise<KeywordAnalysisResult> {
    this.logger.log(
      `Running keyword analysis for [${input.seedKeywords.join(', ')}]`,
    );
    const result = await this.runRemoteTask(
      'keyword_analysis',
      {
        seedKeywords: input.seedKeywords,
        marketplace: input.marketplace,
        locale: input.locale,
      },
      context,
    );
    return normalizeKeywordAnalysisResult(result);
  }

  async runTrendAnalysis(
    input: TrendAnalysisInput,
    context?: AgentCallContext,
  ): Promise<TrendAnalysisResult> {
    this.logger.log(`Running trend analysis for category ${input.category}`);
    const result = await this.runRemoteTask(
      'trend_analysis',
      {
        category: input.category,
        marketplace: input.marketplace,
        timeframe: input.timeframe,
      },
      context,
    );
    const trends = Array.isArray(result.trends)
      ? (result.trends as Array<Record<string, unknown>>)
      : [];
    return {
      trends: trends.map((t) => ({
        name: asString(t.name),
        growth:
          typeof t.growth === 'number' && Number.isFinite(t.growth)
            ? t.growth
            : null,
        seasonality: asString(t.seasonality),
        volume: asOptionalString(t.volume),
        source: asOptionalString(t.source),
        evidence: Array.isArray(t.evidence)
          ? (t.evidence as Array<Record<string, unknown>>).map((item) => ({
              title: asOptionalString(item.title),
              url: asOptionalString(item.url),
              snippet: asOptionalString(item.snippet),
              fetchedAt: asOptionalString(item.fetchedAt),
            }))
          : undefined,
        dataPoints: Array.isArray(t.dataPoints)
          ? (t.dataPoints as Array<Record<string, unknown>>)
              .map((point) => ({
                date: asString(point.date),
                value: Number(point.value ?? Number.NaN),
                category: asOptionalString(point.category),
              }))
              .filter((point) => point.date && Number.isFinite(point.value))
          : undefined,
        dataPointMethod: asOptionalString(t.dataPointMethod),
      })),
      source: asOptionalString(result.source),
      sourceEvidence:
        result.sourceEvidence &&
        typeof result.sourceEvidence === 'object' &&
        !Array.isArray(result.sourceEvidence)
          ? result.sourceEvidence
          : undefined,
      webSignals:
        result.webSignals &&
        typeof result.webSignals === 'object' &&
        !Array.isArray(result.webSignals)
          ? (result.webSignals as Record<string, unknown>)
          : undefined,
      llmError: asOptionalString(result.llmError),
    };
  }

  async runImagePrompt(
    input: ImagePromptInput,
    context?: AgentCallContext,
  ): Promise<{
    prompt: string;
    negativePrompt?: string;
  }> {
    this.logger.log(`Running image prompt for ${input.productName}`);
    const result = await this.runRemoteTask(
      'image_prompt',
      {
        productName: input.productName,
        description: input.description,
        style: input.style,
        platform: input.platform,
      },
      context,
    );
    return {
      prompt: asString(result.prompt),
      negativePrompt: asOptionalString(result.negativePrompt),
    };
  }

  async runAutomationStep(
    input: AutomationStepInput,
    context?: AgentCallContext,
  ): Promise<unknown> {
    this.logger.log(`Running automation step ${input.stepType}`);
    const result = await this.runRemoteTask(
      'automation_step',
      {
        stepType: input.stepType,
        params: input.params,
        context: input.context,
      },
      context,
    );
    return result;
  }

  async runPlanAndExecute(
    input: PlanAndExecuteInput,
    context?: AgentCallContext,
  ): Promise<PlanAndExecuteResult> {
    this.logger.log(`Running planner goal: ${input.goal}`);
    const result = await this.runRemoteTask(
      'plan_and_execute',
      {
        goal: input.goal,
        context: input.context ?? {},
      },
      context,
    );
    return {
      status: asString(result.status),
      total_steps:
        result.total_steps !== undefined
          ? Number(result.total_steps)
          : undefined,
      completed_steps:
        result.completed_steps !== undefined
          ? Number(result.completed_steps)
          : undefined,
      failed_steps:
        result.failed_steps !== undefined
          ? Number(result.failed_steps)
          : undefined,
      results: Array.isArray(result.results) ? result.results : [],
      final_context:
        result.final_context &&
        typeof result.final_context === 'object' &&
        !Array.isArray(result.final_context)
          ? (result.final_context as Record<string, unknown>)
          : undefined,
    };
  }
}
