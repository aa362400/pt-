import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  STORAGE_PROVIDER_TOKEN,
  type StorageProvider,
} from '../shared/storage/storage.service.js';

@Processor('exports', { concurrency: 1 })
export class ExportWorker extends WorkerHost {
  private readonly logger = new Logger(ExportWorker.name);

  constructor(
    @Inject(STORAGE_PROVIDER_TOKEN)
    private readonly storage: StorageProvider,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    const jobId = job.id ?? 'unknown';
    this.logger.log(`Processing export job ${jobId}`);

    const { format, data } = job.data as {
      format: 'csv' | 'json';
      data: Record<string, unknown>[];
    };

    let output: string;
    let mimeType: string;

    switch (format) {
      case 'csv':
        output = this.generateCsv(data);
        mimeType = 'text/csv';
        break;
      case 'json':
      default:
        output = JSON.stringify(data, null, 2);
        mimeType = 'application/json';
        break;
    }

    // Persist so callers can actually download the result afterwards.
    const key = `exports/export_${jobId}.${format}`;
    await this.storage.upload(Buffer.from(output, 'utf-8'), key, mimeType);

    await job.updateProgress(100);

    return {
      status: 'completed',
      format,
      size: output.length,
      storageKey: key,
      filename: `export_${jobId}.${format}`,
    };
  }

  private generateCsv(data: Record<string, unknown>[]): string {
    if (data.length === 0) return '';

    const firstRow = data[0];
    if (!firstRow) return '';

    const headers = Object.keys(firstRow);
    const lines = data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = typeof val === 'string' ? val : JSON.stringify(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(','),
    );

    return [headers.join(','), ...lines].join('\n');
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(`Export job ${job.id ?? 'unknown'} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    this.logger.error(`Export job ${job.id} failed`, {
      error: error.message,
    });
  }
}
