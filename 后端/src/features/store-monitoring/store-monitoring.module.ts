import { Module } from '@nestjs/common';
import { StoreMonitoringController } from './store-monitoring.controller.js';
import { StoreMonitoringService } from './store-monitoring.service.js';

@Module({
  controllers: [StoreMonitoringController],
  providers: [StoreMonitoringService],
  exports: [StoreMonitoringService],
})
export class StoreMonitoringModule {}
