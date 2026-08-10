import {
  Controller,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response, Request } from 'express';
import { map } from 'rxjs/operators';
import { SseService, SseEvent } from './sse.service.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';

@ApiTags('SSE')
@Controller('sse')
export class SseController {
  private readonly logger = new Logger(SseController.name);

  constructor(
    private readonly sseService: SseService,
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  @Get('agent-runs/:id')
  @ApiOperation({ summary: 'Subscribe to agent run progress via SSE' })
  async subscribe(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!user.orgId) {
      throw new ForbiddenException('User does not belong to an organization');
    }
    const run = await this.tenantDatabase.run(user.orgId, (tx) =>
      tx.agentRun.findFirst({
        where: { id, organizationId: user.orgId },
        select: { id: true },
      }),
    );
    if (!run) {
      throw new NotFoundException('Agent run not found');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const observable = this.sseService.subscribe(id);

    const subscription = observable
      .pipe(
        map((event: SseEvent) => {
          const payload = JSON.stringify({
            type: event.type,
            runId: event.runId,
            data: event.data,
          });
          return `event: ${event.type}\ndata: ${payload}\n\n`;
        }),
      )
      .subscribe({
        next: (chunk) => {
          res.write(chunk);
        },
        error: (err: unknown) => {
          this.logger.error(`SSE error for run ${id}:`, err);
          res.end();
        },
        complete: () => {
          res.end();
        },
      });

    req.on('close', () => {
      subscription.unsubscribe();
      this.sseService.unsubscribe(id);
    });
  }
}
