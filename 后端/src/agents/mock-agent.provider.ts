import { Injectable } from '@nestjs/common';
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

@Injectable()
export class MockAgentProvider implements AgentProviderInterface {
  async runAssistant(options: AgentRunOptions): Promise<string> {
    return `Mock response for: "${options.prompt}" (assistant: ${options.assistantId})`;
  }

  async runListingGeneration(input: ListingGenerationInput): Promise<{
    title: string;
    description: string;
    bulletPoints: string[];
    keywords: string[];
    price?: number;
  }> {
    return {
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
    };
  }

  async runKeywordAnalysis(input: KeywordAnalysisInput): Promise<{
    keywords: Array<{ keyword: string; volume: number; difficulty: number }>;
  }> {
    return {
      keywords: input.seedKeywords.map((kw) => ({
        keyword: kw,
        volume: Math.floor(Math.random() * 10000) + 100,
        difficulty: Math.random() * 100,
      })),
    };
  }

  async runProductResearch(input: ProductResearchInput): Promise<{
    summary: string;
    competitors: string[];
    priceRange: { min: number; max: number };
    rating: number;
  }> {
    return {
      summary: `${input.productName} has strong market potential in ${input.marketplace}. Demand is growing steadily with moderate competition.`,
      competitors: ['Competitor A', 'Competitor B', 'Competitor C'],
      priceRange: { min: 19.99, max: 49.99 },
      rating: 4.2,
    };
  }

  async runTrendAnalysis(input: TrendAnalysisInput): Promise<{
    trends: Array<{ name: string; growth: number; seasonality: string }>;
  }> {
    return {
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
    };
  }

  async runImagePrompt(input: ImagePromptInput): Promise<{
    prompt: string;
    negativePrompt?: string;
  }> {
    return {
      prompt: `Professional product photography of ${input.productName}, ${input.style ?? 'clean white background'}, studio lighting, high resolution`,
      negativePrompt: 'blurry, low quality, watermarks, text, logos',
    };
  }

  async runImageGeneration(
    input: ImageGenerationInput,
  ): Promise<ImageGenerationResult> {
    const count = input.sceneCount ?? 3;
    return {
      sessionId: `mock-${Date.now()}`,
      mockMode: true,
      images: Array.from({ length: count }, (_, i) => ({
        sceneId: `scene_${String(i + 1).padStart(2, '0')}`,
        filename: `mock_${i + 1}.jpg`,
        url: `https://placehold.co/800x800?text=${encodeURIComponent(
          `${input.productName} ${i + 1}`,
        )}`,
      })),
      consistencyScore: 92,
    };
  }

  async runAutomationStep(input: AutomationStepInput): Promise<unknown> {
    return {
      stepType: input.stepType,
      status: 'completed',
      result: `Mock automation result for step: ${input.stepType}`,
    };
  }
}
