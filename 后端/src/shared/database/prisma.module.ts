import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { TenantDatabaseContextService } from './tenant-database-context.service.js';

@Global()
@Module({
  providers: [PrismaService, TenantDatabaseContextService],
  exports: [PrismaService, TenantDatabaseContextService],
})
export class PrismaModule {}
