import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  AgentConversationMessageDto,
  CreateAgentConversationDto,
  CreateAgentPlanDto,
  ListAgentConversationsQueryDto,
} from './agent-console.dto.js';
import { AgentConsoleService } from './agent-console.service.js';

@ApiTags('Agent Console')
@ApiBearerAuth()
@Controller('agent-conversations')
export class AgentConversationsController {
  constructor(private readonly consoleService: AgentConsoleService) {}

  @Post()
  @ApiOperation({ summary: 'Create a governed Agent conversation' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAgentConversationDto,
  ) {
    return this.consoleService.createConversation(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListAgentConversationsQueryDto,
  ) {
    return this.consoleService.listConversations(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.consoleService.getConversation(user, id);
  }

  @Post(':id/messages')
  message(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AgentConversationMessageDto,
  ) {
    return this.consoleService.postMessage(user, id, dto);
  }

  @Post(':id/plan')
  plan(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateAgentPlanDto,
  ) {
    return this.consoleService.createPlan(user, id, dto);
  }
}

@ApiTags('Agent Console')
@ApiBearerAuth()
@Controller('agent-plans')
export class AgentPlansController {
  constructor(private readonly consoleService: AgentConsoleService) {}

  @Post(':id/execute')
  execute(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.consoleService.executePlan(user, id);
  }

  @Post(':id/pause')
  pause(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.consoleService.setPlanStatus(user, id, 'PAUSED');
  }

  @Post(':id/resume')
  resume(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.consoleService.resumePlan(user, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.consoleService.setPlanStatus(user, id, 'CANCELLED');
  }
}

@ApiTags('Agent Console')
@ApiBearerAuth()
@Controller('agent-tool-executions')
export class AgentToolExecutionsController {
  constructor(private readonly consoleService: AgentConsoleService) {}

  @Post(':id/retry')
  retry(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.consoleService.retryExecution(user, id);
  }
}

@ApiTags('Agent Console')
@ApiBearerAuth()
@Controller('agent-tools')
export class AgentToolsController {
  constructor(private readonly consoleService: AgentConsoleService) {}

  @Get()
  list() {
    return this.consoleService.listTools();
  }
}
