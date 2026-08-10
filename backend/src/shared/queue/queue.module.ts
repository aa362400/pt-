import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { DeadLetterWorker } from './dead-letter.worker.js';

const REDIS_DEFAULT_URL = 'redis://localhost:6379';

export const QUEUE_CONFIG = {
  'agent-runs': {
    concurrency: 3,
    defaultJobOptions: {
      priority: 1, // medium-high
      attempts: 3,
      timeout: 900_000, // 15 min — image generation can be slow
      backoff: { type: 'exponential' as const, delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  },
  'agent-plans': {
    concurrency: 2,
    defaultJobOptions: {
      priority: 1,
      attempts: 3,
      timeout: 300_000,
      backoff: { type: 'exponential' as const, delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  },
  'automation-runs': {
    concurrency: 2,
    defaultJobOptions: {
      priority: 2, // medium
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  },
  'daily-product-research': {
    concurrency: 1,
    defaultJobOptions: {
      priority: 2,
      attempts: 3,
      timeout: 1_800_000,
      backoff: { type: 'exponential' as const, delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  },
  exports: {
    concurrency: 1,
    defaultJobOptions: {
      priority: 3, // low
      attempts: 2,
      timeout: 60_000, // 1 min
      backoff: { type: 'exponential' as const, delay: 5000 },
      removeOnComplete: 50,
      removeOnFail: 20,
    },
  },
  notifications: {
    concurrency: 5,
    defaultJobOptions: {
      priority: 0, // highest
      attempts: 5,
      timeout: 30_000, // 30 sec
      backoff: { type: 'exponential' as const, delay: 1000 },
      removeOnComplete: 200,
      removeOnFail: 100,
    },
  },
  'review-notifications': {
    concurrency: 3,
    defaultJobOptions: {
      priority: 0, // highest
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  },
  'platform-events': {
    concurrency: 10, // events are lightweight
    defaultJobOptions: {
      priority: 0, // high priority
      attempts: 5,
      timeout: 10_000, // 10 seconds
      backoff: { type: 'exponential' as const, delay: 1000 },
      removeOnComplete: 500,
      removeOnFail: 100,
    },
  },
  'product-launches': {
    concurrency: 1,
    defaultJobOptions: {
      priority: 0,
      attempts: 3,
      timeout: 900_000,
      backoff: { type: 'exponential' as const, delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  },
  'dead-letter': {
    concurrency: 2,
    defaultJobOptions: {
      priority: 0, // highest — process dead letters quickly
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 500,
    },
  },
} as const;

export type QueueName = keyof typeof QUEUE_CONFIG;

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL', REDIS_DEFAULT_URL),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      {
        name: 'agent-runs',
        defaultJobOptions: QUEUE_CONFIG['agent-runs'].defaultJobOptions,
      },
      {
        name: 'agent-plans',
        defaultJobOptions: QUEUE_CONFIG['agent-plans'].defaultJobOptions,
      },
      {
        name: 'automation-runs',
        defaultJobOptions: QUEUE_CONFIG['automation-runs'].defaultJobOptions,
      },
      {
        name: 'daily-product-research',
        defaultJobOptions:
          QUEUE_CONFIG['daily-product-research'].defaultJobOptions,
      },
      {
        name: 'exports',
        defaultJobOptions: QUEUE_CONFIG.exports.defaultJobOptions,
      },
      {
        name: 'notifications',
        defaultJobOptions: QUEUE_CONFIG.notifications.defaultJobOptions,
      },
      {
        name: 'review-notifications',
        defaultJobOptions:
          QUEUE_CONFIG['review-notifications'].defaultJobOptions,
      },
      {
        name: 'platform-events',
        defaultJobOptions: QUEUE_CONFIG['platform-events'].defaultJobOptions,
      },
      {
        name: 'product-launches',
        defaultJobOptions: QUEUE_CONFIG['product-launches'].defaultJobOptions,
      },
      {
        name: 'dead-letter',
        defaultJobOptions: QUEUE_CONFIG['dead-letter'].defaultJobOptions,
      },
    ),
  ],
  providers: [DeadLetterWorker],
  exports: [BullModule],
})
export class QueueModule {
  static getConcurrency(queueName: QueueName): number {
    return QUEUE_CONFIG[queueName]?.concurrency ?? 1;
  }
}
