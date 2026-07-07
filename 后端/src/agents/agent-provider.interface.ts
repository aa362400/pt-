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
  platform: 'amazon' | 'shopify' | 'etsy' | 'ebay';
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
}

export interface TrendAnalysisInput {
  category: string;
  marketplace: string;
  timeframe?: string;
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
  /** Optional natural-language instruction, e.g. "生成 5 张上架套图". */
  message?: string;
}

export interface GeneratedImage {
  sceneId: string;
  filename: string;
  /** Absolute URL the browser can load directly. */
  url: string;
}

export interface ImageGenerationResult {
  sessionId: string;
  mockMode: boolean;
  images: GeneratedImage[];
  consistencyScore?: number | null;
  downloadUrl?: string;
}

export interface AutomationStepInput {
  stepType: string;
  params: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface AgentProviderInterface {
  runAssistant(options: AgentRunOptions): Promise<string>;
  runListingGeneration(input: ListingGenerationInput): Promise<{
    title: string;
    description: string;
    bulletPoints: string[];
    keywords: string[];
    price?: number;
  }>;
  runKeywordAnalysis(input: KeywordAnalysisInput): Promise<{
    keywords: Array<{ keyword: string; volume: number; difficulty: number }>;
  }>;
  runProductResearch(input: ProductResearchInput): Promise<{
    summary: string;
    competitors: string[];
    priceRange: { min: number; max: number };
    rating: number;
  }>;
  runTrendAnalysis(input: TrendAnalysisInput): Promise<{
    trends: Array<{ name: string; growth: number; seasonality: string }>;
  }>;
  runImagePrompt(input: ImagePromptInput): Promise<{
    prompt: string;
    negativePrompt?: string;
  }>;
  /** Full listing-image generation via the consistency agent. */
  runImageGeneration(
    input: ImageGenerationInput,
  ): Promise<ImageGenerationResult>;
  runAutomationStep(input: AutomationStepInput): Promise<unknown>;
}
