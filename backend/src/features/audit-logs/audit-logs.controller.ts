import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditLogsService } from './audit-logs.service.js';
import {
  ArchiveAuditDayDto,
  CreateAuditLogDto,
  IncidentTimelineQueryDto,
  ListAuditLogsQueryDto,
} from './audit-logs.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';

@ApiTags('AuditLogs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditlogsService: AuditLogsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an audit log entry' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAuditLogDto) {
    return this.auditlogsService.create(user, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List audit logs (filter by resource/action/actor/date)',
  })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListAuditLogsQueryDto,
  ) {
    return this.auditlogsService.findAll(user, query);
  }

  @Get('integrity')
  @ApiOperation({ summary: 'Verify the organization audit hash chain' })
  verifyIntegrity(@CurrentUser() user: JwtPayload) {
    return this.auditlogsService.verifyIntegrity(user);
  }

  @Post('archives')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Archive a closed UTC audit day to immutable storage',
  })
  archiveDay(@CurrentUser() user: JwtPayload, @Body() dto: ArchiveAuditDayDto) {
    return this.auditlogsService.archiveDay(user, dto.date);
  }

  @Get('archives')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'List immutable audit archive receipts' })
  listArchives(@CurrentUser() user: JwtPayload) {
    return this.auditlogsService.listArchives(user);
  }

  @Get('incidents/timeline')
  @ApiOperation({
    summary:
      'Build a read-only incident timeline across Agent, automation and external submissions',
  })
  incidentTimeline(
    @CurrentUser() user: JwtPayload,
    @Query() query: IncidentTimelineQueryDto,
  ) {
    return this.auditlogsService.incidentTimeline(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an audit log entry by ID' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.auditlogsService.findOne(user, id);
  }
}
