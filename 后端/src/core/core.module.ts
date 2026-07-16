import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from '../shared/audit/audit.module.js';
import { validateEnvironment } from '../shared/config/env.js';
import { PrismaModule } from '../shared/database/prisma.module.js';
import { EmailModule } from '../shared/email/email.module.js';
import { FeatureFlagsModule } from '../shared/feature-flags/feature-flags.module.js';
import { HousekeepingModule } from '../shared/housekeeping/housekeeping.module.js';
import { LoggerModule } from '../shared/logging/logger.module.js';
import { MetricsModule } from '../shared/metrics/metrics.module.js';
import { StorageModule } from '../shared/storage/storage.module.js';

const CORE_MODULES = [
  PrismaModule,
  LoggerModule,
  StorageModule,
  AuditModule,
  EmailModule,
  MetricsModule,
  FeatureFlagsModule,
  HousekeepingModule,
] as const;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ...CORE_MODULES,
  ],
  exports: [ConfigModule, ...CORE_MODULES],
})
export class CoreModule {}
