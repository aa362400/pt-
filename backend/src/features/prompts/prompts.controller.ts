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
import { PromptsService } from './prompts.service.js';
import {
  CreatePromptDto,
  ListPromptsQueryDto,
  UpdatePromptDto,
} from './prompts.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('Prompts')
@ApiBearerAuth()
@Controller('prompts')
export class PromptsController {
  constructor(private readonly promptsService: PromptsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a prompt template' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePromptDto) {
    return this.promptsService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List prompt templates (category/search filters)' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListPromptsQueryDto,
  ) {
    return this.promptsService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a prompt template' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.promptsService.findOne(user, id);
  }

  @Post(':id/use')
  @ApiOperation({ summary: 'Consume a template (increments usage count)' })
  use(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.promptsService.use(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a prompt template' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePromptDto,
  ) {
    return this.promptsService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a prompt template' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.promptsService.remove(user, id);
  }
}
