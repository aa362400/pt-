import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgentType } from '@prisma/client';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';
import {
  AgentEvalWindowDto,
  CreateBusinessOutcomeDto,
  CreateFeedbackSignalDto,
  CreatePromptVersionDto,
  ListFeedbackSignalsQueryDto,
  UpdatePromptVersionStatusDto,
} from './agent-evaluation.dto.js';
import { AgentEvaluationService } from './agent-evaluation.service.js';

@ApiTags('Feedback Signals')
@ApiBearerAuth()
@Controller('feedback-signals')
export class FeedbackSignalsController {
  constructor(private readonly service: AgentEvaluationService) {}

  @Post()
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'Record attributable human or system feedback' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateFeedbackSignalDto,
  ) {
    return this.service.createFeedback(user, dto);
  }

  @Get()
  @Roles('OWNER', 'ADMIN')
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListFeedbackSignalsQueryDto,
  ) {
    return this.service.listFeedback(user, query);
  }
}

@ApiTags('Agent Evaluations')
@ApiBearerAuth()
@Controller('agent-evals')
export class AgentEvaluationsController {
  constructor(private readonly service: AgentEvaluationService) {}

  @Post('aggregate')
  @Roles('OWNER', 'ADMIN')
  aggregate(@CurrentUser() user: JwtPayload, @Body() dto: AgentEvalWindowDto) {
    return this.service.aggregate(user, dto);
  }

  @Get('scorecards')
  @Roles('OWNER', 'ADMIN')
  scorecards(
    @CurrentUser() user: JwtPayload,
    @Query('agentType') agentType?: AgentType,
  ) {
    return this.service.listScorecards(user, agentType);
  }

  @Get('router-decisions')
  @Roles('OWNER', 'ADMIN')
  routerDecisions(
    @CurrentUser() user: JwtPayload,
    @Query('agentType') agentType?: AgentType,
  ) {
    return this.service.listRouterDecisions(user, agentType);
  }
}

@ApiTags('Prompt Versions')
@ApiBearerAuth()
@Controller('prompt-versions')
export class PromptVersionsController {
  constructor(private readonly service: AgentEvaluationService) {}

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePromptVersionDto) {
    return this.service.createPromptVersion(user, dto);
  }

  @Get()
  @Roles('OWNER', 'ADMIN')
  list(
    @CurrentUser() user: JwtPayload,
    @Query('agentType') agentType?: AgentType,
  ) {
    return this.service.listPromptVersions(user, agentType);
  }

  @Post(':id/status')
  @Roles('OWNER', 'ADMIN')
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePromptVersionStatusDto,
  ) {
    return this.service.updatePromptStatus(user, id, dto);
  }
}

@ApiTags('Business Outcomes')
@ApiBearerAuth()
@Controller('business-outcomes')
export class BusinessOutcomesController {
  constructor(private readonly service: AgentEvaluationService) {}

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateBusinessOutcomeDto,
  ) {
    return this.service.createBusinessOutcome(user, dto);
  }
}
