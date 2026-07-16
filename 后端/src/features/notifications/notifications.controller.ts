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
  Logger,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { NotificationsService } from './notifications.service.js';
import { NotificationEventsService } from './notification-events.service.js';
import {
  CreateNotificationDto,
  ListNotificationsQueryDto,
  MarkReadDto,
  NotificationDecisionDto,
  UpdateNotificationDto,
} from './notifications.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationEvents: NotificationEventsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a notification for the current user' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List current-user notifications' })
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

  @Get('stream')
  @ApiOperation({ summary: 'Subscribe to current-user notifications via SSE' })
  stream(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const orgId = requireOrg(user);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.write(
      `event: notification.ready\ndata: ${JSON.stringify({ type: 'notification.ready' })}\n\n`,
    );

    const subscription = this.notificationEvents
      .subscribe(orgId, user.sub)
      .subscribe({
        next: (event) => {
          res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        },
        error: (error: unknown) => {
          this.logger.error('Notification stream failed', error);
          res.end();
        },
      });

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
      this.notificationEvents.release(orgId, user.sub);
    });
  }

  @Post('mark-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notifications as read' })
  markAsRead(@CurrentUser() user: JwtPayload, @Body() dto: MarkReadDto) {
    return this.notificationsService.markAsRead(user, dto);
  }

  @Post(':id/decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute or dismiss an actionable notification' })
  decide(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: NotificationDecisionDto,
  ) {
    return this.notificationsService.decide(user, id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a current-user notification by ID' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notificationsService.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a current-user notification' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateNotificationDto,
  ) {
    return this.notificationsService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a current-user notification' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notificationsService.remove(user, id);
  }
}
