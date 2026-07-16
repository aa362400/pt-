import { Injectable } from '@nestjs/common';
import {
  AgentProviderInterface,
  AgentRunOptions,
  ListingGenerationInput,
  KeywordAnalysisInput,
  ProductResearchInput,
  GlobalProductDiscoveryInput,
  GlobalProductDiscoveryResult,
  SupplierImageSearchInput,
  SupplierImageSearchCallContext,
  SupplierImageSearchResult,
  TrendAnalysisInput,
  ImagePromptInput,
  ImageGenerationInput,
  ImageGenerationResult,
  AutomationStepInput,
  PlanAndExecuteInput,
  PlanAndExecuteResult,
  KeywordAnalysisResult,
} from './agent-provider.interface.js';

@Injectable()
export class MockAgentProvider implements AgentProviderInterface {
  runAssistant(options: AgentRunOptions): Promise<string> {
    return Promise.resolve(
      `Mock response for: "${options.prompt}" (assistant: ${options.assistantId})`,
    );
  }

  runListingGeneration(input: ListingGenerationInput): Promise<{
    title: string;
    description: string;
    bulletPoints: string[];
    keywords: string[];
    price?: number;
  }> {
    return Promise.resolve({
      title: `Premium ${input.productName} - High Quality`,
      description: `This premium ${input.productName} is perfect for customers looking for quality and value. Made with top-grade materials.`,
      bulletPoints: [
        'High-quality materials for lasting durability',
        'Designed for maximum comfort and usability',
        'Perfect for everyday use',
        'Backed by our satisfaction guarantee',
      ],
      keywords: [input.productName, ...input.keywords.slice(0, 5)],
      price: 29.99,
    });
  }

  runKeywordAnalysis(
    input: KeywordAnalysisInput,
  ): Promise<KeywordAnalysisResult> {
    return Promise.resolve({
      keywords: input.seedKeywords.map((kw) => ({
        keyword: kw,
        volume: null,
        difficulty: null,
        metricStatus: 'DATA_INSUFFICIENT',
        metricEvidence: null,
      })),
      dataStatus: 'DATA_INSUFFICIENT',
    });
  }

  runProductResearch(input: ProductResearchInput): Promise<{
    summary: string;
    competitors: string[];
    priceRange: { min: number; max: number };
    rating: number;
  }> {
    return Promise.resolve({
      summary: `${input.productName} has strong market potential in ${input.marketplace}. Demand is growing steadily with moderate competition.`,
      competitors: ['Competitor A', 'Competitor B', 'Competitor C'],
      priceRange: { min: 19.99, max: 49.99 },
      rating: 4.2,
    });
  }

  runGlobalProductDiscovery(
    _input: GlobalProductDiscoveryInput,
  ): Promise<GlobalProductDiscoveryResult> {
    return Promise.resolve({
      candidates: [],
      provider: 'mock',
      conceptCount: 0,
      methodology: { mockMode: true, externalStoreMutation: false },
    });
  }

  runSupplierImageSearch(
    _input: SupplierImageSearchInput,
    _context: SupplierImageSearchCallContext,
  ): Promise<SupplierImageSearchResult> {
    return Promise.reject(
      new Error('SUPPLIER_IMAGE_SEARCH_REAL_PROVIDER_REQUIRED'),
    );
  }

  runTrendAnalysis(input: TrendAnalysisInput): Promise<{
    trends: Array<{ name: string; growth: number; seasonality: string }>;
  }> {
    return Promise.resolve({
      trends: [
        {
          name: `${input.category} Premium`,
          growth: 35,
          seasonality: 'year-round',
        },
        {
          name: `${input.category} Eco-Friendly`,
          growth: 50,
          seasonality: 'spring-peak',
        },
        {
          name: `${input.category} Budget`,
          growth: 20,
          seasonality: 'holiday-peak',
        },
      ],
    });
  }

  runImagePrompt(input: ImagePromptInput): Promise<{
    prompt: string;
    negativePrompt?: string;
  }> {
    return Promise.resolve({
      prompt: `Professional product photography of ${input.productName}, ${input.style ?? 'clean white background'}, studio lighting, high resolution`,
      negativePrompt: 'blurry, low quality, watermarks, text, logos',
    });
  }

  runImageGeneration(
    input: ImageGenerationInput,
  ): Promise<ImageGenerationResult> {
    const count = input.sceneCount ?? 3;
    return Promise.resolve({
      sessionId: `mock-${Date.now()}`,
      mockMode: true,
      supervisionApproved: false,
      publishable: false,
      images: Array.from({ length: count }, (_, i) => ({
        sceneId: `scene_${String(i + 1).padStart(2, '0')}`,
        filename: `mock_${i + 1}.jpg`,
        url: `https://placehold.co/800x800?text=${encodeURIComponent(
          `${input.productName} ${i + 1}`,
        )}`,
      })),
      consistencyScore: 92,
    });
  }

  runAutomationStep(input: AutomationStepInput): Promise<unknown> {
    return Promise.resolve({
      stepType: input.stepType,
      status: 'completed',
      result: `Mock automation result for step: ${input.stepType}`,
    });
  }

  runPlanAndExecute(input: PlanAndExecuteInput): Promise<PlanAndExecuteResult> {
    return Promise.resolve({
      status: 'completed',
      total_steps: 5,
      completed_steps: 5,
      failed_steps: 0,
      results: [
        { step: 1, tool: 'product_research', status: 'completed' },
        { step: 2, tool: 'keyword_analysis', status: 'completed' },
        { step: 3, tool: 'listing_generation', status: 'completed' },
        { step: 4, tool: 'generate_images', status: 'completed' },
        { step: 5, tool: 'profit_calculation', status: 'completed' },
      ],
      final_context: { goal: input.goal },
    });
  }
}
