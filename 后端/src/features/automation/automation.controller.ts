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
  RecoverFlowDto,
  TriggerFlowDto,
  UpdateFlowDto,
} from './automation.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';

@ApiTags('Automation')
@ApiBearerAuth()
@Controller('automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Post('flows')
  @Roles('OWNER', 'ADMIN')
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
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Update an automation flow' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateFlowDto,
  ) {
    return this.automationService.update(user, id, dto);
  }

  @Post('flows/:id/trigger')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Trigger a flow now (enqueues a run)' })
  trigger(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: TriggerFlowDto,
  ) {
    return this.automationService.trigger(user, id, dto);
  }

  @Post('flows/:id/recover')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({
    summary: 'Recover a failed flow by creating a new queued run',
  })
  recover(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RecoverFlowDto,
  ) {
    return this.automationService.recover(user, id, dto);
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
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Delete an automation flow' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.automationService.remove(user, id);
  }
}
