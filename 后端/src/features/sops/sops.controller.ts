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
import { SopsService } from './sops.service.js';
import { CreateSopDto, ListSopsQueryDto, UpdateSopDto } from './sops.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('SOPs')
@ApiBearerAuth()
@Controller('sops')
export class SopsController {
  constructor(private readonly sopsService: SopsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a SOP draft' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateSopDto) {
    return this.sopsService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List SOPs (status/search filters)' })
  findAll(@CurrentUser() user: JwtPayload, @Query() query: ListSopsQueryDto) {
    return this.sopsService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a SOP' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.sopsService.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a SOP (drafts only for steps)' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSopDto,
  ) {
    return this.sopsService.update(user, id, dto);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a SOP' })
  publish(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.sopsService.publish(user, id);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a SOP' })
  archive(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.sopsService.archive(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a SOP' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.sopsService.remove(user, id);
  }
}
