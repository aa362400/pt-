import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller.js';
import { AuditLogsService } from './audit-logs.service.js';
import { AuditArchiveService } from '../../shared/audit/audit-archive.service.js';
import { S3AuditArchiveStore } from '../../shared/audit/s3-audit-archive.store.js';

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService, AuditArchiveService, S3AuditArchiveStore],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
