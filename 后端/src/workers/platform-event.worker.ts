import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AgentAutonomyService } from '../features/agent-autonomy/agent-autonomy.service.js';
import type { PlatformEvent } from '../shared/events/event-bus.service.js';

@Processor('platform-events', { concurrency: 10 })
export class PlatformEventWorker extends WorkerHost {
  private readonly logger = new Logger(PlatformEventWorker.name);

  constructor(private readonly autonomy: AgentAutonomyService) {
    super();
  }

  async process(job: Job<PlatformEvent>): Promise<unknown> {
    const event = job.data;
    if (!this.isPlatformEvent(event)) {
      this.logger.warn(`Skipping malformed platform event job ${job.id}`);
      return { status: 'ignored', reason: 'malformed_event' };
    }

    try {
      switch (event.type) {
        case 'product.created':
          return {
            status: 'processed',
            eventType: event.type,
            result: await this.autonomy.handlePlatformEvent(event),
          };
        case 'product.updated':
          return {
            status: 'processed',
            eventType: event.type,
            result: await this.autonomy.handleProductUpdatedEvent(event),
          };
        default:
          this.logger.debug(
            `No autonomy handler for platform event ${event.type}; acknowledged`,
          );
          return {
            status: 'ignored',
            eventType: event.type,
            reason: 'no_handler',
          };
      }
    } catch (error) {
      if (this.isTerminalAutonomyError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Ignoring terminal platform event ${event.type} for ${event.resourceType}/${event.resourceId}: ${message}`,
        );
        return {
          status: 'ignored',
          eventType: event.type,
          reason: 'terminal_autonomy_error',
          error: message,
        };
      }
      throw error;
    }
  }

  private isPlatformEvent(value: unknown): value is PlatformEvent {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const event = value as Partial<PlatformEvent>;
    return (
      typeof event.type === 'string' &&
      typeof event.orgId === 'string' &&
      typeof event.resourceType === 'string' &&
      typeof event.resourceId === 'string' &&
      typeof event.timestamp === 'string' &&
      !!event.data &&
      typeof event.data === 'object' &&
      !Array.isArray(event.data)
    );
  }

  private isTerminalAutonomyError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes(
      'No active organization user available for agent-owned action',
    );
  }
}
