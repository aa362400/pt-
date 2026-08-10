import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';
import {
  ClassifyDeadLetterDto,
  ListDeadLettersQueryDto,
  ReplayDeadLetterDto,
  ResolveDeadLetterDto,
} from './dead-letter.dto.js';
import { DeadLetterService } from './dead-letter.service.js';

@ApiTags('DeadLetter')
@ApiBearerAuth()
@Roles('OWNER', 'ADMIN')
@Controller('admin/dead-letters')
export class DeadLetterController {
  constructor(private readonly deadLetters: DeadLetterService) {}

  @Get()
  @ApiOperation({ summary: 'List tenant-scoped dead letter jobs' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListDeadLettersQueryDto,
  ) {
    return this.deadLetters.list(user, query);
  }

  @Post('triage')
  @ApiOperation({ summary: 'Classify unresolved dead letters from evidence' })
  triage(@CurrentUser() user: JwtPayload) {
    return this.deadLetters.triageOpen(user);
  }

  @Post('replay-all')
  @ApiOperation({ summary: 'Disabled unsafe bulk replay endpoint' })
  replayAll() {
    throw new BadRequestException(
      'Unsafe bulk replay is disabled. Classify and replay one dead letter at a time.',
    );
  }

  @Patch(':id/classification')
  @ApiOperation({ summary: 'Apply an explicit operator classification' })
  classify(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ClassifyDeadLetterDto,
  ) {
    return this.deadLetters.classify(user, id, dto);
  }

  @Post(':id/replay')
  @ApiOperation({ summary: 'Create an idempotent recovery run' })
  replay(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReplayDeadLetterDto,
  ) {
    return this.deadLetters.replay(user, id, dto);
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Resolve a non-replayable dead letter with a note' })
  resolve(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ResolveDeadLetterDto,
  ) {
    return this.deadLetters.resolve(user, id, dto);
  }
}
