import { Controller, Get, HttpStatus, Res, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { Public } from './shared/auth/public.decorator.js';
import { PrismaService } from './shared/database/prisma.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

interface CheckResult {
  status: 'up' | 'degraded' | 'down';
  error?: string;
  latencyMs?: number;
  details?: Record<string, number>;
}

@ApiTags('Health')
@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @InjectQueue('agent-runs') private readonly agentRunsQueue: Queue,
  ) {}

  @Public()
  @Get('health')
  @ApiOperation({
    summary: 'Liveness check - returns 200 if process is alive',
  })
  getHealth(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({
    summary:
      'Readiness check - returns 200 if all critical dependencies are up; 503 otherwise',
  })
  async getReady(@Res({ passthrough: true }) res: Response): Promise<{
    status: 'ready' | 'not_ready';
    timestamp: string;
    checks: Record<string, CheckResult>;
  }> {
    const [database, redis, queue, storage, agent] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkQueue(),
      this.checkStorage(),
      this.checkAgent(),
    ]);

    // A shared backlog is observable degradation, not a reason to remove every
    // API pod from service. Connectivity failures remain hard readiness gates.
    const allUp = [database, redis, queue, storage, agent].every(
      (check) => check.status !== 'down',
    );

    if (!allUp) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: allUp ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: { database, redis, queue, storage, agent },
    };
  }

  private async checkDatabase(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { status: 'up', latencyMs: Date.now() - start };
    } catch {
      // Do not leak connection details (hosts, credentials) to callers.
      return { status: 'down', error: 'database unreachable' };
    }
  }

  private async checkRedis(): Promise<CheckResult> {
    const start = Date.now();
    try {
      const client = (await this.agentRunsQueue.client) as unknown as Redis;
      await client.ping();
      return { status: 'up', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down', error: 'redis unreachable' };
    }
  }

  private async checkQueue(): Promise<CheckResult> {
    const start = Date.now();
    try {
      const counts = await this.agentRunsQueue.getJobCounts(
        'waiting',
        'active',
        'failed',
        'delayed',
      );
      const waiting = counts.waiting ?? 0;
      const limit = this.configService.get<number>(
        'QUEUE_READINESS_BACKLOG_LIMIT',
        500,
      );
      if (waiting > limit) {
        return {
          status: 'degraded',
          error: 'agent queue backlog exceeds readiness limit',
          latencyMs: Date.now() - start,
          details: { waiting, limit },
        };
      }
      return {
        status: 'up',
        latencyMs: Date.now() - start,
        details: {
          waiting,
          active: counts.active ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
          limit,
        },
      };
    } catch {
      return { status: 'down', error: 'agent queue status unavailable' };
    }
  }

  private async checkStorage(): Promise<CheckResult> {
    const start = Date.now();
    const provider = this.configService.get<string>(
      'STORAGE_PROVIDER',
      'local',
    );
    try {
      if (provider === 's3') {
        const region = this.configService.get<string>('S3_REGION', 'us-east-1');
        const endpoint = this.configService.get<string>('S3_ENDPOINT', '');
        const accessKeyId = this.configService.get<string>(
          'S3_ACCESS_KEY_ID',
          '',
        );
        const secretAccessKey = this.configService.get<string>(
          'S3_SECRET_ACCESS_KEY',
          '',
        );
        const client = new S3Client({
          region,
          endpoint: endpoint || undefined,
          credentials: { accessKeyId, secretAccessKey },
          forcePathStyle: true,
        });
        await client.send(new ListBucketsCommand({}));
        client.destroy();
      }
      // local provider is always considered up
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      this.logger.error(
        'Storage health check failed',
        error instanceof Error ? error.message : String(error),
      );
      return { status: 'down', error: 'storage unreachable' };
    }
  }

  private async checkAgent(): Promise<CheckResult> {
    const start = Date.now();
    const agentBaseUrl = this.configService.get<string>('AGENT_BASE_URL');
    if (!agentBaseUrl) {
      return { status: 'up', latencyMs: 0 };
    }
    try {
      // Readiness must include the Agent state backend and worker heartbeat.
      const response = await fetch(
        `${agentBaseUrl.replace(/\/+$/, '')}/api/ready`,
        {
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!response.ok) {
        return { status: 'down', error: `agent returned ${response.status}` };
      }
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      this.logger.error(
        'Agent health check failed',
        error instanceof Error ? error.message : String(error),
      );
      return { status: 'down', error: 'agent unreachable' };
    }
  }
}
