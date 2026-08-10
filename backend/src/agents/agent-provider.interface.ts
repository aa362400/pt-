/** english_text（stage4）：texttaskenglish_textagent，english_text。 */
export interface AgentCallContext {
  orgId?: string;
  userId?: string;
  workspaceId?: string;
  agentRunId?: string;
  requestId?: string;
  locale?: string;
  traceId?: string;
  traceparent?: string;
}

export interface AgentRunOptions {
  assistantId: string;
  threadId?: string;
  prompt: string;
  workspaceId: string;
  orgId: string;
  userId: string;
}

export interface ListingGenerationInput {
  productName: string;
  description?: string;
  keywords: string[];
  platform: string;
  tone?: string;
}

export interface KeywordAnalysisInput {
  seedKeywords: string[];
  marketplace: string;
  locale?: string;
}

export interface ProductResearchInput {
  productName: string;
  marketplace: string;
  locale?: string;
  storeContext?: Record<string, unknown>;
}

export interface GlobalProductDiscoveryInput {
  businessDate: string;
  candidateLimit: number;
  seedQueries?: string[];
  explorationKey?: string;
}

export interface GlobalProductDiscoveryResult {
  candidates: unknown[];
  provider?: string;
  fetchedAt?: string;
  conceptCount?: number;
  searchAttempts?: number;
  searchSuccesses?: number;
  searchFailures?: unknown[];
  methodology?: Record<string, unknown>;
}

export type SupplierImageSearchInput =
  | {
      imageUrl: string;
      imageBase64?: never;
      imageKeywords?: string;
    }
  | {
      imageUrl?: never;
      imageBase64: string;
      imageKeywords?: string;
    };

export interface SupplierImageSearchCallContext extends AgentCallContext {
  orgId: string;
  requestId: string;
}

export interface SupplierImageSearchDisplayPriceEvidence {
  price: string | null;
  consignPrice: string | null;
  multipleConsignPrice: string | null;
  evidenceUse: 'DISPLAY_ONLY';
  verifiedProcurementCost: false;
}

export interface SupplierImageSearchOffer {
  offerId: string;
  subject: string | null;
  detailUrl: string | null;
  imageUrl: string | null;
  distributionFreePostage: boolean | null;
  displayPriceEvidence: SupplierImageSearchDisplayPriceEvidence;
}

export interface SupplierImageSearchImageEvidence {
  canonicalizationVersion: 'supplier-image-search-payload/v2';
  sourceOriginalSha256: string;
  sourceCanonicalSha256: string;
  decodedSizeBytes: number;
  payloadMimeType: 'image/png';
  width: number;
  height: number;
  retrievalHashAlgorithm: 'DHASH64';
  retrievalHash: string;
  retrievalOnly: true;
}

export interface SupplierImageSearchProvenance {
  adapterVersion: 'supplier-image-search-adapter/v1';
  provider: string;
  requestId: string;
  fetchedAt: string;
  rawSnapshotSha256: string;
}

export interface SupplierImageSearchResult {
  outcome: 'MATCHES' | 'NO_RESULTS';
  providerResultCount: number;
  offers: SupplierImageSearchOffer[];
  imageEvidence: SupplierImageSearchImageEvidence;
  provenance: SupplierImageSearchProvenance;
}

export interface ProductResearchSourceEvidence {
  source: string;
  provider?: string;
  fetchedAt: string;
  items: Array<{
    id?: string;
    title: string;
    url: string;
    imageUrl?: string | null;
    snippet?: string;
    fetchedAt: string;
    priceRub?: number | null;
  }>;
}

export interface TrendAnalysisInput {
  category: string;
  marketplace: string;
  timeframe?: string;
}

export interface TrendDataPoint {
  date: string;
  value: number;
  category?: string;
}

export interface TrendEvidence {
  title?: string;
  url?: string;
  snippet?: string;
  fetchedAt?: string;
}

export interface TrendAnalysisTrend {
  name: string;
  growth: number | null;
  seasonality: string;
  volume?: string;
  source?: string;
  evidence?: TrendEvidence[];
  dataPoints?: TrendDataPoint[];
  dataPointMethod?: string;
}

export interface TrendAnalysisResult {
  trends: TrendAnalysisTrend[];
  source?: string;
  sourceEvidence?: {
    source?: string;
    provider?: string;
    fetchedAt?: string;
    items?: TrendEvidence[];
  };
  webSignals?: Record<string, unknown>;
  llmError?: string;
}

export interface ImagePromptInput {
  productName: string;
  description?: string;
  style?: string;
  platform?: string;
}

export interface ImageGenerationInput {
  productName: string;
  /** Product photo as base64 (raw or data URL). Either this or imageUrl. */
  imageBase64?: string;
  imageUrl?: string;
  sceneCount?: number;
  platforms?: string[];
  /** Optional natural-language instruction, e.g. "generation 5 textlistingtext". */
  message?: string;
}

export interface GeneratedImage {
  sceneId: string;
  filename: string;
  /** Absolute URL the browser can load directly. */
  url: string;
  background?: string;
  props?: string[];
  lighting?: string;
  emotion?: string;
  composition?: string;
  prompt?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  sha256?: string;
  byteSize?: number;
}

export interface ImageGenerationResult {
  sessionId: string;
  mockMode: boolean;
  supervisionApproved: boolean;
  publishable: boolean;
  images: GeneratedImage[];
  consistencyScore?: number | null;
  consistencyPassed?: boolean | null;
  compliancePassed?: boolean | null;
  externalConsistencyStatus?: 'passed' | 'failed' | 'skipped' | 'error' | null;
  externalConsistencyScore?: number | null;
  externalConsistencyIssues?: string[];
  profile?: Record<string, unknown> | null;
  scenePlan?: unknown[];
  downloadUrl?: string;
}

export interface AutomationStepInput {
  stepType: string;
  params: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface PlanAndExecuteInput {
  goal: string;
  context?: Record<string, unknown>;
}

export interface PlanAndExecuteResult {
  status: string;
  total_steps?: number;
  completed_steps?: number;
  failed_steps?: number;
  results: unknown[];
  final_context?: Record<string, unknown>;
}

export interface AgentProviderInterface {
  runAssistant(
    options: AgentRunOptions,
    context?: AgentCallContext,
  ): Promise<string>;
  runListingGeneration(
    input: ListingGenerationInput,
    context?: AgentCallContext,
  ): Promise<{
    title: string;
    description: string;
    bulletPoints: string[];
    keywords: string[];
    price?: number;
  }>;
  runKeywordAnalysis(
    input: KeywordAnalysisInput,
    context?: AgentCallContext,
  ): Promise<{
    keywords: Array<{ keyword: string; volume: number; difficulty: number }>;
  }>;
  runProductResearch(
    input: ProductResearchInput,
    context?: AgentCallContext,
  ): Promise<{
    summary: string;
    competitors: string[];
    priceRange: { min: number; max: number; currency?: string };
    rating: number | null;
    sourceEvidence?: ProductResearchSourceEvidence;
    runtime?: Record<string, unknown>;
  }>;
  runGlobalProductDiscovery(
    input: GlobalProductDiscoveryInput,
    context?: AgentCallContext,
  ): Promise<GlobalProductDiscoveryResult>;
  runSupplierImageSearch(
    input: SupplierImageSearchInput,
    context: SupplierImageSearchCallContext,
  ): Promise<SupplierImageSearchResult>;
  runTrendAnalysis(
    input: TrendAnalysisInput,
    context?: AgentCallContext,
  ): Promise<TrendAnalysisResult>;
  runImagePrompt(
    input: ImagePromptInput,
    context?: AgentCallContext,
  ): Promise<{
    prompt: string;
    negativePrompt?: string;
  }>;
  /** Full listing-image generation via the consistency agent. */
  runImageGeneration(
    input: ImageGenerationInput,
    context?: AgentCallContext,
  ): Promise<ImageGenerationResult>;
  runAutomationStep(
    input: AutomationStepInput,
    context?: AgentCallContext,
  ): Promise<unknown>;
  runPlanAndExecute(
    input: PlanAndExecuteInput,
    context?: AgentCallContext,
  ): Promise<PlanAndExecuteResult>;
}
