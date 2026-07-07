import { Controller, Get, Post, Body, Param, Patch, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ImagePromptService } from './image-prompt.service.js';
import { CreateImagePromptDto, UpdateImagePromptDto } from './image-prompt.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('ImagePrompt')
@Controller('image-prompt')
export class ImagePromptController {
  constructor(private readonly imagepromptService: ImagePromptService) {}

  @Post()
  @ApiOperation({ summary: 'Create image prompt project' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateImagePromptDto) {
    return this.imagepromptService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List image prompt projects' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.imagepromptService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get image prompt project by id' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.imagepromptService.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update image prompt project' })
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateImagePromptDto) {
    return this.imagepromptService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete image prompt project' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.imagepromptService.remove(user, id);
  }
}
