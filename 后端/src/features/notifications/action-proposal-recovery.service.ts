import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { ActionProposalsService } from './action-proposals.service.js';

const DEFAULT_SCAN_INTERVAL_MS = 60_000;
const DEFAULT_STALE_AFTER_MS = 5 * 60_000;

@Injectable()
export class ActionProposalRecoveryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ActionProposalRecoveryService.name);
  private timer?: NodeJS.Timeout;
  private activeScan?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly proposals: ActionProposalsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV', 'development') === 'test') return;
    const intervalMs = this.positiveNumber(
      this.config.get('ACTION_PROPOSAL_RECOVERY_INTERVAL_MS'),
      DEFAULT_SCAN_INTERVAL_MS,
    );
    this.timer = setInterval(() => void this.startScan(), intervalMs);
    this.timer.unref?.();
    void this.startScan();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.activeScan;
  }

  startScan(now = new Date()): Promise<void> {
    if (this.activeScan) return this.activeScan;
    const scan = this.scan(now)
      .catch((error) => {
        this.logger.error(
          'ActionProposal recovery scan failed',
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        if (this.activeScan === scan) this.activeScan = undefined;
      });
    this.activeScan = scan;
    return scan;
  }

  async scan(now = new Date()): Promise<void> {
    const staleAfterMs = this.positiveNumber(
      this.config.get('ACTION_PROPOSAL_STALE_AFTER_MS'),
      DEFAULT_STALE_AFTER_MS,
    );
    const staleBefore = new Date(now.getTime() - staleAfterMs);
    const organizations = await this.prisma.organization.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    for (const organization of organizations) {
      const result = await this.proposals.recoverStaleExecutions({
        organizationId: organization.id,
        staleBefore,
        now,
      });
      if (result.recovered > 0) {
        this.logger.warn(
          `Recovered ${result.recovered} stale ActionProposal execution(s) for ${organization.id} as UNKNOWN`,
        );
      }
    }
  }

  private positiveNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
