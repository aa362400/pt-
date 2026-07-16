import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../shared/auth/public.decorator.js';
import {
  AgentMemoryService,
  type ComputeReadinessInput,
  type LearnFromReviewInput,
  type QueryWorkMemoryInput,
  type RecordWorkMemoryInput,
} from './agent-memory.service.js';

@ApiTags('Agent Memory')
@Controller('agent-memory')
export class AgentMemoryController {
  constructor(
    private readonly configService: ConfigService,
    private readonly agentMemory: AgentMemoryService,
  ) {}

  @Public()
  @Post('records')
  @ApiOperation({ summary: 'Record durable agent work memory' })
  recordWorkMemory(
    @Headers('x-api-key') apiKey: string,
    @Body() body: RecordWorkMemoryInput,
  ) {
    this.assertAgentApiKey(apiKey);
    return this.agentMemory.recordWorkMemory(body);
  }

  @Public()
  @Get('records')
  @ApiOperation({ summary: 'Query durable agent work memory' })
  queryWorkMemory(
    @Headers('x-api-key') apiKey: string,
    @Query('organizationId') organizationId: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('productName') productName?: string,
    @Query('taskType') taskType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertAgentApiKey(apiKey);
    const input: QueryWorkMemoryInput = {
      organizationId,
      workspaceId,
      productName,
      taskType,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    };
    return this.agentMemory.queryWorkMemory(input);
  }

  @Public()
  @Post('experiences')
  @ApiOperation({ summary: 'Learn from a review rejection or low-score case' })
  learnFromReview(
    @Headers('x-api-key') apiKey: string,
    @Body() body: LearnFromReviewInput,
  ) {
    this.assertAgentApiKey(apiKey);
    return this.agentMemory.learnFromReview(body);
  }

  @Public()
  @Get('experiences')
  @ApiOperation({ summary: 'List org-scoped agent experience cards' })
  getExperienceCards(
    @Headers('x-api-key') apiKey: string,
    @Query('organizationId') organizationId: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('taskType') taskType?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertAgentApiKey(apiKey);
    return this.agentMemory.getExperienceCards({
      organizationId,
      workspaceId,
      taskType,
      category,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Public()
  @Post('readiness')
  @ApiOperation({ summary: 'Persist and return stage-20 readiness metrics' })
  computeReadiness(
    @Headers('x-api-key') apiKey: string,
    @Body() body: ComputeReadinessInput,
  ) {
    this.assertAgentApiKey(apiKey);
    return this.agentMemory.computeReadiness(body);
  }

  private assertAgentApiKey(apiKey: string | undefined): void {
    const expected = this.configService.get<string>('AGENT_API_KEY');
    if (!expected || apiKey !== expected) {
      throw new UnauthorizedException('Invalid agent API key');
    }
  }
}
