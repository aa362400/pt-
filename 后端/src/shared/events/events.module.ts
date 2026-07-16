import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EventBusService } from './event-bus.service.js';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: 'platform-events' })],
  providers: [EventBusService],
  exports: [EventBusService],
})
export class EventsModule {}
