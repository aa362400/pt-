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
import { AssistantService } from './assistant.service.js';
import {
  CreateSessionDto,
  ListSessionsQueryDto,
  PostMessageDto,
} from './assistant.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('Assistant')
@ApiBearerAuth()
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('sessions')
  @ApiOperation({ summary: 'Create an assistant chat session' })
  createSession(@CurrentUser() user: JwtPayload, @Body() dto: CreateSessionDto) {
    return this.assistantService.createSession(user, dto);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List my assistant sessions' })
  listSessions(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListSessionsQueryDto,
  ) {
    return this.assistantService.listSessions(user, query);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get a session with all messages' })
  getSession(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.assistantService.getSession(user, id);
  }

  @Post('sessions/:id/messages')
  @ApiOperation({ summary: 'Send a message and receive the assistant reply' })
  postMessage(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: PostMessageDto,
  ) {
    return this.assistantService.postMessage(user, id, dto);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Delete a session and its messages' })
  removeSession(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.assistantService.removeSession(user, id);
  }
}
