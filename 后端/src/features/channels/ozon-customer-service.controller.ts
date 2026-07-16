import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  OzonCustomerHistoryQueryDto,
  OzonCustomerOverviewQueryDto,
  RequestOzonCustomerActionDto,
} from './channels.dto.js';
import { OzonCustomerServiceService } from './ozon-customer-service.service.js';

@ApiTags('Ozon Customer Service')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('channels/ozon/customer-service')
export class OzonCustomerServiceController {
  constructor(private readonly service: OzonCustomerServiceService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Read live Ozon chats, questions and reviews' })
  overview(
    @CurrentUser() user: JwtPayload,
    @Query() query: OzonCustomerOverviewQueryDto,
  ) {
    return this.service.overview(user, query);
  }

  @Get('chats/:chatId/history')
  @ApiOperation({ summary: 'Read live Ozon chat message history' })
  history(
    @CurrentUser() user: JwtPayload,
    @Param('chatId') chatId: string,
    @Query() query: OzonCustomerHistoryQueryDto,
  ) {
    return this.service.history(user, { chatId, ...query });
  }

  @Post('targets/:targetId/action-request')
  @ApiOperation({
    summary: 'Create a human-confirmed Ozon customer-service write request',
  })
  requestAction(
    @CurrentUser() user: JwtPayload,
    @Param('targetId') targetId: string,
    @Body() dto: RequestOzonCustomerActionDto,
  ) {
    return this.service.requestAction(user, targetId, dto);
  }
}
