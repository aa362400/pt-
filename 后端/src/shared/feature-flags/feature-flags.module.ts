import { Global, Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service.js';
import { FeatureFlagsController } from './feature-flags.controller.js';

@Global()
@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
