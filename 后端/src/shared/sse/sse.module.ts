import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SseService } from './sse.service.js';
import { SseController } from './sse.controller.js';

@Global()
@Module({
  imports: [EventEmitterModule.forRoot()],
  controllers: [SseController],
  providers: [SseService],
  exports: [SseService],
})
export class SseModule {}
