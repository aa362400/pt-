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
import { TrendsService } from './trends.service.js';
import { AnalyzeTrendsDto, ListTrendsQueryDto } from './trends.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('Trends')
@ApiBearerAuth()
@Controller('trends')
export class TrendsController {
  constructor(private readonly trendsService: TrendsService) {}

  @Post('analyze')
  @ApiOperation({ summary: 'Run a trend analysis and persist insights' })
  analyze(@CurrentUser() user: JwtPayload, @Body() dto: AnalyzeTrendsDto) {
    return this.trendsService.analyze(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List trend insights (keyword/category filters)' })
  findAll(@CurrentUser() user: JwtPayload, @Query() query: ListTrendsQueryDto) {
    return this.trendsService.findAll(user, query);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a trend insight' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.trendsService.remove(user, id);
  }
}
