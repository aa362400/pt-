import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AgentProviderInterface,
  AgentRunOptions,
  ListingGenerationInput,
  KeywordAnalysisInput,
  ProductResearchInput,
  TrendAnalysisInput,
  ImagePromptInput,
  ImageGenerationInput,
  ImageGenerationResult,
  AutomationStepInput,
} from './agent-provider.interface.js';

interface RemoteRunResponse {
  runId: string;
  sessionId: string;
  status: string;
}

interface RemoteRunStatus {
  runId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress?: { stage?: string; message?: string };
  result?: Record<string, unknown> | null;
  error?: string;
}

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 15 * 60_000;

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
    this.baseUrl = (
      configService.get<string>('AGENT_BASE_URL') ?? ''
    ).replace(/\/+$/, '');
    // Browser-facing base for image URLs; defaults to the server-side URL.
    this.publicUrl = (
      configService.get<string>('AGENT_PUBLIC_URL') ?? this.baseUrl
    ).replace(/\/+$/, '');
    this.apiKey = configService.get<string>('AGENT_API_KEY') ?? '';
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'X-Api-Key': this.apiKey,
        ...(init.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      let message = text;
      try {
        message = (JSON.parse(text) as { error?: string }).error ?? text;
      } catch {
        // keep raw text
      }
      throw new Error(`Agent API ${res.status}: ${message}`);
    }
    return JSON.parse(text) as T;
  }

  /** Creates a remote run and polls until it reaches a terminal state. */
  private async runRemoteTask(
    taskType: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const created = await this.request<RemoteRunResponse>(
      '/api/v1/agent/runs',
      { method: 'POST', body: { taskType, input } },
    );
    this.logger.log(`Remote ${taskType} run created: ${created.runId}`);

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const status = await this.request<RemoteRunStatus>(
        `/api/v1/agent/runs/${created.runId}`,
      );
      if (status.status === 'completed') {
        return status.result ?? {};
      }
      if (status.status === 'failed') {
        throw new Error(status.error || 'Agent task failed');
      }
    }
    throw new Error(`Agent task timed out after ${POLL_TIMEOUT_MS / 1000}s`);
  }

  private absolutize(url: string): string {
    if (!url || /^https?:\/\//i.test(url)) return url;
    return `${this.publicUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  async runImageGeneration(
    input: ImageGenerationInput,
  ): Promise<ImageGenerationResult> {
    const result = await this.runRemoteTask('generate_images', {
      productName: input.productName,
      imageBase64: input.imageBase64,
      imageUrl: input.imageUrl,
      sceneCount: input.sceneCount,
      platforms: input.platforms,
      message: input.message,
    });

    const images = Array.isArray(result.images)
      ? (result.images as Array<Record<string, string>>)
      : [];
    return {
      sessionId: String(result.sessionId ?? ''),
      mockMode: Boolean(result.mockMode),
      images: images.map((img) => ({
        sceneId: img.sceneId ?? '',
        filename: img.filename ?? '',
        url: this.absolutize(img.url ?? ''),
      })),
      consistencyScore:
        typeof result.consistencyScore === 'number'
          ? result.consistencyScore
          : null,
      downloadUrl: result.downloadUrl
        ? this.absolutize(String(result.downloadUrl))
        : undefined,
    };
  }

  async runProductResearch(input: ProductResearchInput): Promise<{
    summary: string;
    competitors: string[];
    priceRange: { min: number; max: number };
    rating: number;
  }> {
    this.logger.log(`Running product research for ${input.productName}`);
    const result = await this.runRemoteTask('product_research', {
      productName: input.productName,
      marketplace: input.marketplace,
      locale: input.locale,
    });
    return {
      summary: String(result.summary ?? ''),
      competitors: Array.isArray(result.competitors)
        ? (result.competitors as string[])
        : [],
      priceRange: {
        min: Number((result.priceRange as Record<string, number>)?.min ?? 0),
        max: Number((result.priceRange as Record<string, number>)?.max ?? 0),
      },
      rating: Number(result.rating ?? 0),
    };
  }

  async runAssistant(options: AgentRunOptions): Promise<string> {
    this.logger.log(`Running assistant for session ${options.assistantId}`);
    const result = await this.runRemoteTask('assistant_chat', {
      assistantId: options.assistantId,
      threadId: options.threadId,
      prompt: options.prompt,
      workspaceId: options.workspaceId,
    });
    return String(result.response ?? '');
  }

  async runListingGeneration(input: ListingGenerationInput): Promise<{
    title: string;
    description: string;
    bulletPoints: string[];
    keywords: string[];
    price?: number;
  }> {
    this.logger.log(`Running listing generation for ${input.productName}`);
    const result = await this.runRemoteTask('listing_generation', {
      productName: input.productName,
      description: input.description,
      keywords: input.keywords,
      platform: input.platform,
      tone: input.tone,
    });
    return {
      title: String(result.title ?? ''),
      description: String(result.description ?? ''),
      bulletPoints: Array.isArray(result.bulletPoints)
        ? (result.bulletPoints as string[])
        : [],
      keywords: Array.isArray(result.keywords)
        ? (result.keywords as string[])
        : [],
      price:
        result.price !== undefined && result.price !== null
          ? Number(result.price)
          : undefined,
    };
  }

  async runKeywordAnalysis(input: KeywordAnalysisInput): Promise<{
    keywords: Array<{ keyword: string; volume: number; difficulty: number }>;
  }> {
    this.logger.log(
      `Running keyword analysis for [${input.seedKeywords.join(', ')}]`,
    );
    const result = await this.runRemoteTask('keyword_analysis', {
      seedKeywords: input.seedKeywords,
      marketplace: input.marketplace,
      locale: input.locale,
    });
    const keywords = Array.isArray(result.keywords)
      ? (result.keywords as Array<Record<string, unknown>>)
      : [];
    return {
      keywords: keywords.map((k) => ({
        keyword: String(k.keyword ?? ''),
        volume: Number(k.volume ?? 0),
        difficulty: Number(k.difficulty ?? 0),
      })),
    };
  }

  async runTrendAnalysis(input: TrendAnalysisInput): Promise<{
    trends: Array<{ name: string; growth: number; seasonality: string }>;
  }> {
    this.logger.log(`Running trend analysis for category ${input.category}`);
    const result = await this.runRemoteTask('trend_analysis', {
      category: input.category,
      marketplace: input.marketplace,
      timeframe: input.timeframe,
    });
    const trends = Array.isArray(result.trends)
      ? (result.trends as Array<Record<string, unknown>>)
      : [];
    return {
      trends: trends.map((t) => ({
        name: String(t.name ?? ''),
        growth: Number(t.growth ?? 0),
        seasonality: String(t.seasonality ?? ''),
      })),
    };
  }

  async runImagePrompt(input: ImagePromptInput): Promise<{
    prompt: string;
    negativePrompt?: string;
  }> {
    this.logger.log(`Running image prompt for ${input.productName}`);
    const result = await this.runRemoteTask('image_prompt', {
      productName: input.productName,
      description: input.description,
      style: input.style,
      platform: input.platform,
    });
    return {
      prompt: String(result.prompt ?? ''),
      negativePrompt: result.negativePrompt
        ? String(result.negativePrompt)
        : undefined,
    };
  }

  async runAutomationStep(input: AutomationStepInput): Promise<unknown> {
    this.logger.log(`Running automation step ${input.stepType}`);
    const result = await this.runRemoteTask('automation_step', {
      stepType: input.stepType,
      params: input.params,
      context: input.context,
    });
    return result;
  }
}
