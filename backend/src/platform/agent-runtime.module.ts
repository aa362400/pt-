import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AgentModule } from '../agents/agent.module.js';
import { AgentPermissionsModule } from '../shared/agent-permissions/agent-permissions.module.js';
import { EventsModule } from '../shared/events/events.module.js';
import { QueueModule } from '../shared/queue/queue.module.js';
import { SseModule } from '../shared/sse/sse.module.js';
import { WorkersModule } from '../workers/workers.module.js';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    QueueModule,
    SseModule,
    EventsModule,
    AgentPermissionsModule,
    AgentModule,
    WorkersModule,
  ],
  exports: [AgentModule],
})
export class AgentRuntimeModule {}
