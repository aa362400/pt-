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
import { NotificationsService } from './notifications.service.js';
import {
  CreateNotificationDto,
  ListNotificationsQueryDto,
  MarkReadDto,
  UpdateNotificationDto,
} from './notifications.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a notification for the current user' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List notifications (filter by type/read status)' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.findAll(user, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  unreadCount(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.unreadCount(user);
  }

  @Post('mark-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notifications as read' })
  markAsRead(@CurrentUser() user: JwtPayload, @Body() dto: MarkReadDto) {
    return this.notificationsService.markAsRead(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a notification by ID' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notificationsService.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a notification' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateNotificationDto,
  ) {
    return this.notificationsService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notificationsService.remove(user, id);
  }
}
