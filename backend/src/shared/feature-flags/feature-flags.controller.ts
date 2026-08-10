import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { FeatureFlagsService } from './feature-flags.service.js';

@ApiTags('Feature Flags')
@Controller('api/v1/flags')
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all feature flags with their current status' })
  listFlags() {
    return this.flags.listFlags();
  }

  @Public()
  @Get(':name')
  @ApiOperation({ summary: 'Check a specific feature flag status' })
  getFlag(@Param('name') name: string) {
    const flag = this.flags.getFlag(name);
    if (!flag) {
      throw new NotFoundException(`Feature flag "${name}" not found`);
    }
    return flag;
  }
}
