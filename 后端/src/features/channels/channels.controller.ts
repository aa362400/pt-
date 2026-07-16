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
  ConnectOzonChannelDto,
  CreateChannelConnectionDto,
  ListChannelOrdersQueryDto,
  ListChannelsQueryDto,
  ListOzonRfbsReturnsQueryDto,
  RequestOzonRfbsRefundDto,
  SyncChannelOrdersDto,
  SyncChannelProductsDto,
  UpdateChannelConnectionDto,
  UpdateSyncStatusDto,
} from './channels.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';

@ApiTags('Channels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post()
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a channel connection' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateChannelConnectionDto,
  ) {
    return this.channelsService.create(user, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List channel connections (filter by workspace/provider/status)',
  })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListChannelsQueryDto,
  ) {
    return this.channelsService.findAll(user, query);
  }

  @Post('ozon/connect')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connect and verify an Ozon Seller API channel' })
  connectOzon(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConnectOzonChannelDto,
  ) {
    return this.channelsService.connectOzon(user, dto);
  }

  @Post('ozon/credentials/rotate')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate organization Ozon credentials to the active key',
  })
  rotateOzonCredentials(@CurrentUser() user: JwtPayload) {
    return this.channelsService.rotateOzonCredentials(user);
  }

  @Get('orders')
  @ApiOperation({ summary: 'List synced marketplace orders' })
  listOrders(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListChannelOrdersQueryDto,
  ) {
    return this.channelsService.listOrders(user, query);
  }

  @Get(':id/capabilities')
  @ApiOperation({ summary: 'Get channel feature capabilities' })
  capabilities(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.channelsService.getCapabilities(user, id);
  }

  @Get(':id/diagnostics')
  @ApiOperation({
    summary: 'Diagnose Ozon channel API permissions and sync logs',
  })
  diagnoseOzon(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.channelsService.diagnoseOzon(user, id);
  }

  @Post(':id/sync-products')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync products from a marketplace channel' })
  syncProducts(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SyncChannelProductsDto,
  ) {
    return this.channelsService.syncProducts(user, id, dto);
  }

  @Post(':id/sync-orders')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync orders from a marketplace channel' })
  syncOrders(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SyncChannelOrdersDto,
  ) {
    return this.channelsService.syncOrders(user, id, dto);
  }

  @Get(':id/rfbs-returns')
  @ApiOperation({ summary: 'List Ozon rFBS returns from the live Seller API' })
  listRfbsReturns(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query() query: ListOzonRfbsReturnsQueryDto,
  ) {
    return this.channelsService.listRfbsReturns(user, id, query);
  }

  @Get(':id/rfbs-returns/:returnId')
  @ApiOperation({ summary: 'Get one Ozon rFBS return and its live actions' })
  getRfbsReturn(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('returnId') returnId: string,
  ) {
    return this.channelsService.getRfbsReturn(user, id, returnId);
  }

  @Post(':id/rfbs-returns/:returnId/refund-request')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create a human approval request for an Ozon rFBS full refund',
  })
  requestRfbsRefund(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('returnId') returnId: string,
    @Body() dto: RequestOzonRfbsRefundDto,
  ) {
    return this.channelsService.requestRfbsRefund(user, id, returnId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a channel connection by ID' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.channelsService.findOne(user, id);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Update a channel connection' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateChannelConnectionDto,
  ) {
    return this.channelsService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Delete a channel connection' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.channelsService.remove(user, id);
  }

  @Patch(':id/sync-status')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Update sync status of a channel connection' })
  updateSyncStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSyncStatusDto,
  ) {
    return this.channelsService.updateSyncStatus(user, id, dto);
  }

  @Post(':id/disconnect')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disconnect a channel connection' })
  disconnect(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.channelsService.disconnect(user, id);
  }
}
