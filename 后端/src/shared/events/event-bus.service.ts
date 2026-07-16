import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface PlatformEvent {
  type: string;
  orgId: string;
  actorId?: string;
  resourceType: string;
  resourceId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue('platform-events') private readonly eventQueue: Queue,
  ) {}

  async emit(event: PlatformEvent): Promise<void> {
    // 1. Emit in-process for SSE/local subscribers
    this.eventEmitter.emit(`platform.${event.type}`, event);

    // 2. Enqueue for reliable delivery (Python agent consumes this)
    await this.eventQueue.add('event', event, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    this.logger.log(
      `Event emitted: ${event.type} ${event.resourceType}/${event.resourceId}`,
    );
  }
}
