import {
  Controller,
  Get,
  Query,
  Headers,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { Public } from '../../shared/auth/public.decorator.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  @Public()
  @Get('pending')
  @ApiOperation({
    summary: 'Get pending events for agent polling (HMAC-authenticated)',
  })
  async getPending(
    @Query('orgId') orgId: string,
    @Query('limit') limit = 20,
    @Headers('x-api-key') apiKey: string,
  ) {
    const expected = this.configService.get<string>('AGENT_API_KEY');
    if (!expected || apiKey !== expected) {
      throw new UnauthorizedException('Invalid API key');
    }
    if (!orgId) {
      throw new BadRequestException('orgId required');
    }

    // Return recent events for this org (from the last hour)
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const events = await this.tenantDatabase.run(orgId, (tx) =>
      tx.auditLog.findMany({
        where: {
          organizationId: orgId,
          createdAt: { gte: since },
          action: { in: ['product.create', 'product.update', 'alert.create'] },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 50),
        select: {
          id: true,
          action: true,
          resourceType: true,
          resourceId: true,
          createdAt: true,
        },
      }),
    );

    return { events };
  }
}
