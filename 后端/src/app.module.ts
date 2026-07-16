import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module.js';
import { FeaturesModule } from './features/features.module.js';
import { HealthModule } from './health.module.js';
import { PlatformModule } from './platform/platform.module.js';

@Module({
  imports: [CoreModule, PlatformModule, FeaturesModule, HealthModule],
})
export class AppModule {}
