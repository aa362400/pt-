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
      backoff: { type: 'exponential' as const, delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
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
  exports: {
    concurrency: 1,
    defaultJobOptions: {
      priority: 3, // low
      attempts: 2,
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
        name: 'automation-runs',
        defaultJobOptions: QUEUE_CONFIG['automation-runs'].defaultJobOptions,
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
        defaultJobOptions: QUEUE_CONFIG['review-notifications'].defaultJobOptions,
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
