import { Global, Module } from '@nestjs/common';
import { HousekeepingService } from './housekeeping.service.js';
import { HousekeepingController } from './housekeeping.controller.js';

@Global()
@Module({
  controllers: [HousekeepingController],
  providers: [HousekeepingService],
  exports: [HousekeepingService],
})
export class HousekeepingModule {}
