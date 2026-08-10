import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  AgentRoadmapService,
  type AgentRoadmapAcceptanceRunResponse,
  type AgentRoadmapResponse,
} from './agent-roadmap.service.js';

@ApiTags('Agent Roadmap')
@ApiBearerAuth()
@Controller('agent-roadmap')
export class AgentRoadmapController {
  constructor(private readonly roadmap: AgentRoadmapService) {}

  @Get()
  @ApiOperation({
    summary:
      'Return strict backend-backed 1-20 agent roadmap acceptance status',
  })
  getRoadmap(@CurrentUser() user: JwtPayload): Promise<AgentRoadmapResponse> {
    return this.roadmap.getRoadmap(user);
  }

  @Post('acceptance-run')
  @ApiOperation({
    summary:
      'Run real local acceptance evidence writes for the 1-20 agent roadmap',
  })
  runAcceptanceEvidence(
    @CurrentUser() user: JwtPayload,
  ): Promise<AgentRoadmapAcceptanceRunResponse> {
    return this.roadmap.runAcceptanceEvidence(user);
  }
}
