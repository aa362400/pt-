import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChannelsService } from './channels.service.js';
import {
  CreateChannelConnectionDto,
  ListChannelsQueryDto,
  UpdateChannelConnectionDto,
  UpdateSyncStatusDto,
} from './channels.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('Channels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a channel connection' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateChannelConnectionDto) {
    return this.channelsService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List channel connections (filter by workspace/provider/status)' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListChannelsQueryDto,
  ) {
    return this.channelsService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a channel connection by ID' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.channelsService.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a channel connection' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateChannelConnectionDto,
  ) {
    return this.channelsService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a channel connection' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.channelsService.remove(user, id);
  }

  @Patch(':id/sync-status')
  @ApiOperation({ summary: 'Update sync status of a channel connection' })
  updateSyncStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSyncStatusDto,
  ) {
    return this.channelsService.updateSyncStatus(user, id, dto);
  }

  @Post(':id/disconnect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disconnect a channel connection' })
  disconnect(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.channelsService.disconnect(user, id);
  }
}
