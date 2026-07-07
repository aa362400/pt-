import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AgentRunsService } from './agent-runs.service.js';
import { CreateAgentRunDto, ListAgentRunsQueryDto } from './agent-runs.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { QuotaResource } from '../../shared/decorators/quota.decorator.js';
import { QuotaGuard } from '../../shared/guards/quota.guard.js';

@ApiTags('AgentRuns')
@ApiBearerAuth()
@UseGuards(QuotaGuard)
@Controller('agent-runs')
export class AgentRunsController {
  constructor(private readonly agentRunsService: AgentRunsService) {}

  @Post()
  @QuotaResource('agentRuns')
  @ApiOperation({
    summary: 'Create an agent run and enqueue it for processing',
  })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAgentRunDto) {
    return this.agentRunsService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List agent runs of the current organization' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListAgentRunsQueryDto,
  ) {
    return this.agentRunsService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one agent run (org-scoped)' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.agentRunsService.findOne(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an agent run (org-scoped)' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.agentRunsService.remove(user, id);
  }
}
