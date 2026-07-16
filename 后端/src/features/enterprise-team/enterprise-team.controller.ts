import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { LaunchEnterpriseObjectiveDto } from './enterprise-team.dto.js';
import { EnterpriseTeamService } from './enterprise-team.service.js';

@ApiTags('Enterprise Agent Team')
@ApiBearerAuth()
@Controller('enterprise-team')
export class EnterpriseTeamController {
  constructor(private readonly team: EnterpriseTeamService) {}

  @Get()
  @ApiOperation({
    summary:
      'Get CEO and specialist agent readiness from live capability evidence',
  })
  getTeam(@CurrentUser() user: JwtPayload) {
    return this.team.team(user);
  }

  @Post('objectives')
  @ApiOperation({
    summary: 'Launch a real PLANNER run for an enterprise operating objective',
  })
  launch(
    @CurrentUser() user: JwtPayload,
    @Body() dto: LaunchEnterpriseObjectiveDto,
  ) {
    return this.team.launch(user, dto);
  }
}
