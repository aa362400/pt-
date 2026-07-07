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
import { CreateAuditLogDto, ListAuditLogsQueryDto } from './audit-logs.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

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

  @Get(':id')
  @ApiOperation({ summary: 'Get an audit log entry by ID' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.auditlogsService.findOne(user, id);
  }
}
