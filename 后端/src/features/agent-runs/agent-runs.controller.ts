import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Req,
  Headers,
  UseGuards,
  UnauthorizedException,
  ServiceUnavailableException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { AgentRunsService } from './agent-runs.service.js';
import {
  AgentRunEventDto,
  CreateAgentRunDto,
  ListAgentRunsQueryDto,
} from './agent-runs.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { Public } from '../../shared/auth/public.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { QuotaResource } from '../../shared/decorators/quota.decorator.js';
import { QuotaGuard } from '../../shared/guards/quota.guard.js';

@ApiTags('AgentRuns')
@ApiBearerAuth()
@UseGuards(QuotaGuard)
@Controller('agent-runs')
export class AgentRunsController {
  constructor(
    private readonly agentRunsService: AgentRunsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 智能体 → 平台的任务事件回调（进度/完成/失败）。
   * 鉴权：X-Agent-Signature = HMAC-SHA256(rawBody, AGENT_WEBHOOK_SECRET)。
   * 未配置密钥时整体禁用（前端轮询兜底）。
   */
  @Post(':id/events')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Agent progress event webhook (HMAC-signed)' })
  async receiveEvent(
    @Param('id') id: string,
    @Req() req: { rawBody?: Buffer },
    @Headers('x-agent-signature') signature: string,
    @Body() dto: AgentRunEventDto,
  ) {
    const secret = this.configService.get<string>('AGENT_WEBHOOK_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException(
        'Agent webhook disabled (AGENT_WEBHOOK_SECRET not configured)',
      );
    }
    if (!signature || !req.rawBody) {
      throw new UnauthorizedException('Missing signature or raw body');
    }
    const expected = createHmac('sha256', secret)
      .update(req.rawBody)
      .digest('hex');
    const sigBuf = Buffer.from(signature, 'utf-8');
    const expBuf = Buffer.from(expected, 'utf-8');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException('Invalid signature');
    }
    return this.agentRunsService.recordEvent(id, dto);
  }

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
