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
import { ProductResearchService } from './product-research.service.js';
import {
  CreateResearchReportDto,
  ListResearchReportsQueryDto,
} from './product-research.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('ProductResearch')
@ApiBearerAuth()
@Controller('product-research')
export class ProductResearchController {
  constructor(
    private readonly productResearchService: ProductResearchService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Run product research and persist the report' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateResearchReportDto,
  ) {
    return this.productResearchService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List research reports' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListResearchReportsQueryDto,
  ) {
    return this.productResearchService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a research report' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.productResearchService.findOne(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a research report' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.productResearchService.remove(user, id);
  }
}
