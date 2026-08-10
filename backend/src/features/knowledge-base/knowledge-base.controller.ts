import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { KnowledgeBaseService } from './knowledge-base.service.js';
import {
  CreateKnowledgeDocDto,
  ListKnowledgeDocsQueryDto,
  UpdateKnowledgeDocDto,
} from './knowledge-base.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('KnowledgeBase')
@ApiBearerAuth()
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Post()
  @ApiOperation({ summary: 'Create a knowledge document' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateKnowledgeDocDto) {
    return this.knowledgeBaseService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List knowledge documents (search/tag filters)' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListKnowledgeDocsQueryDto,
  ) {
    return this.knowledgeBaseService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a knowledge document' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.knowledgeBaseService.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a knowledge document' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeDocDto,
  ) {
    return this.knowledgeBaseService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a knowledge document' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.knowledgeBaseService.remove(user, id);
  }
}
