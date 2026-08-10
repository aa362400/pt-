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
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { AgentRunsService } from './agent-runs.service.js';
import { AgentRunConsistencyService } from './agent-run-consistency.service.js';
import {
  AgentRunEventDto,
  AgentLifecycleEventDto,
  CancelAgentRunDto,
  CreateAgentRunDto,
  ListAgentRunsQueryDto,
  RetryAgentRunDto,
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
    private readonly consistencyService: AgentRunConsistencyService,
  ) {}

  /**
   * agent → platformtexttaskenglish_text（text/completed/failed）。
   * text：X-Agent-Signature = HMAC-SHA256(rawBody, AGENT_WEBHOOK_SECRET)。
   * textconfigurationsecretenglish_text（frontendenglish_text）。
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

  @Post(':id/lifecycle-events')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply a signed, idempotent lifecycle event' })
  async receiveLifecycleEvent(
    @Param('id') id: string,
    @Req() req: { rawBody?: Buffer },
    @Headers('x-agent-signature') signature: string,
    @Body() dto: AgentLifecycleEventDto,
  ) {
    this.verifyAgentSignature(req.rawBody, signature);
    return this.agentRunsService.recordLifecycleEvent(id, dto);
  }

  @Post()
  @Throttle({ default: { ttl: 60000, limit: 10 } }) // 10 requests per minute per IP
  @QuotaResource('agentRuns')
  @ApiOperation({
    summary: 'Create an agent run and enqueue it for processing',
  })
  create(
    @CurrentUser() user: JwtPayload,
    @Req() req: { locale?: string },
    @Body() dto: CreateAgentRunDto,
  ) {
    return this.agentRunsService.create(user, dto, req.locale);
  }

  @Get()
  @ApiOperation({ summary: 'List agent runs of the current organization' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListAgentRunsQueryDto,
  ) {
    return this.agentRunsService.findAll(user, query);
  }

  @Get('consistency')
  @ApiOperation({
    summary: 'Compare lifecycle, legacy database, and queue state evidence',
  })
  consistency(@CurrentUser() user: JwtPayload) {
    return this.consistencyService.inspect(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one agent run (org-scoped)' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.agentRunsService.findOne(user, id);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get lifecycle transitions and steps for one run' })
  timeline(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.agentRunsService.findTimeline(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Idempotently cancel a non-terminal agent run' })
  cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CancelAgentRunDto,
  ) {
    return this.agentRunsService.cancel(user, id, dto);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Idempotently create a new run from a failed or cancelled run',
  })
  retry(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RetryAgentRunDto,
  ) {
    return this.agentRunsService.retry(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an agent run (org-scoped)' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.agentRunsService.remove(user, id);
  }

  private verifyAgentSignature(rawBody: Buffer | undefined, signature: string) {
    const secret = this.configService.get<string>('AGENT_WEBHOOK_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException(
        'Agent webhook disabled (AGENT_WEBHOOK_SECRET not configured)',
      );
    }
    if (!signature || !rawBody) {
      throw new UnauthorizedException('Missing signature or raw body');
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(signature, 'utf-8');
    const expBuf = Buffer.from(expected, 'utf-8');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException('Invalid signature');
    }
  }
}
