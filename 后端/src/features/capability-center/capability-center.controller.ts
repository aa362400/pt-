import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { CapabilityCenterService } from './capability-center.service.js';

@ApiTags('Capability Center')
@ApiBearerAuth()
@Controller('capability-center')
export class CapabilityCenterController {
  constructor(private readonly capabilities: CapabilityCenterService) {}

  @Get()
  @ApiOperation({
    summary:
      'Return frontend/backend/agent integration status for all user-facing capabilities',
  })
  list(@CurrentUser() user: JwtPayload) {
    return this.capabilities.list(user);
  }
}
