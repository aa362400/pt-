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
import { AutomationService } from './automation.service.js';
import {
  CreateFlowDto,
  ListFlowsQueryDto,
  UpdateFlowDto,
} from './automation.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('Automation')
@ApiBearerAuth()
@Controller('automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Post('flows')
  @ApiOperation({ summary: 'Create an automation flow' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateFlowDto) {
    return this.automationService.create(user, dto);
  }

  @Get('flows')
  @ApiOperation({ summary: 'List automation flows' })
  findAll(@CurrentUser() user: JwtPayload, @Query() query: ListFlowsQueryDto) {
    return this.automationService.findAll(user, query);
  }

  @Get('flows/:id')
  @ApiOperation({ summary: 'Get an automation flow' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.automationService.findOne(user, id);
  }

  @Patch('flows/:id')
  @ApiOperation({ summary: 'Update an automation flow' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateFlowDto,
  ) {
    return this.automationService.update(user, id, dto);
  }

  @Post('flows/:id/trigger')
  @ApiOperation({ summary: 'Trigger a flow now (enqueues a run)' })
  trigger(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.automationService.trigger(user, id);
  }

  @Get('flows/:id/runs')
  @ApiOperation({ summary: 'List runs of a flow' })
  listRuns(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query() query: ListFlowsQueryDto,
  ) {
    return this.automationService.listRuns(user, id, query);
  }

  @Delete('flows/:id')
  @ApiOperation({ summary: 'Delete an automation flow' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.automationService.remove(user, id);
  }
}
