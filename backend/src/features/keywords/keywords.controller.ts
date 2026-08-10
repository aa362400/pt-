import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { KeywordsService } from './keywords.service.js';
import {
  CreateKeywordReportDto,
  ListKeywordReportsQueryDto,
} from './keywords.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('Keywords')
@ApiBearerAuth()
@Controller('keywords')
export class KeywordsController {
  constructor(private readonly keywordsService: KeywordsService) {}

  @Post()
  @ApiOperation({ summary: 'Run keyword analysis and persist the report' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateKeywordReportDto) {
    return this.keywordsService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List keyword reports' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListKeywordReportsQueryDto,
  ) {
    return this.keywordsService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a keyword report' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.keywordsService.findOne(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a keyword report' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.keywordsService.remove(user, id);
  }
}
