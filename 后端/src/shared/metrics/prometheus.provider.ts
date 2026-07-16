import {
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';

export const metricProviders = [
  makeCounterProvider({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'path', 'status'],
  }),
  makeHistogramProvider({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'path', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  }),
  makeCounterProvider({
    name: 'agent_runs_total',
    help: 'Total agent run terminal outcomes',
    labelNames: ['agent_type', 'status'],
  }),
  makeCounterProvider({
    name: 'agent_run_quality_total',
    help: 'Total scored agent run quality outcomes',
    labelNames: ['agent_type', 'result'],
  }),
  makeGaugeProvider({
    name: 'bullmq_jobs_waiting',
    help: 'Current BullMQ waiting jobs by queue',
    labelNames: ['queue'],
  }),
  makeGaugeProvider({
    name: 'bullmq_jobs_active',
    help: 'Current BullMQ active jobs by queue',
    labelNames: ['queue'],
  }),
  makeGaugeProvider({
    name: 'bullmq_jobs_failed',
    help: 'Current BullMQ failed jobs by queue',
    labelNames: ['queue'],
  }),
  makeGaugeProvider({
    name: 'bullmq_jobs_delayed',
    help: 'Current BullMQ delayed jobs by queue',
    labelNames: ['queue'],
  }),
  makeGaugeProvider({
    name: 'bullmq_queue_scrape_success',
    help: 'Whether queue metrics were collected successfully',
    labelNames: ['queue'],
  }),
];
