import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { OzonProductPublishService } from '../channels/ozon-product-publish.service.js';
import { ActionProposalsService } from '../notifications/action-proposals.service.js';
import { ExternalSubmissionsService } from './external-submissions.service.js';

const DEFAULT_SCAN_INTERVAL_MS = 60_000;
const DEFAULT_STALE_AFTER_MS = 5 * 60_000;

@Injectable()
export class ProductLaunchRecoveryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ProductLaunchRecoveryService.name);
  private timer?: NodeJS.Timeout;
  private activeScan?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly ozonPublisher: OzonProductPublishService,
    private readonly externalSubmissions: ExternalSubmissionsService,
    private readonly actionProposals: ActionProposalsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV', 'development') === 'test') return;
    const intervalMs = this.positiveNumber(
      this.config.get('PRODUCT_LAUNCH_RECOVERY_INTERVAL_MS'),
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
          'Product launch recovery scan failed',
          this.errorMessage(error),
        );
      })
      .finally(() => {
        if (this.activeScan === scan) this.activeScan = undefined;
      });
    this.activeScan = scan;
    return scan;
  }

  async scan(now = new Date()): Promise<void> {
    const organizations = await this.prisma.organization.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    for (const organization of organizations) {
      await this.recoverOrganization(organization.id, now);
    }
  }

  async recoverOrganization(organizationId: string, now = new Date()) {
    const staleAfterMs = this.positiveNumber(
      this.config.get('PRODUCT_LAUNCH_RECOVERY_STALE_AFTER_MS'),
      DEFAULT_STALE_AFTER_MS,
    );
    const staleBefore = new Date(now.getTime() - staleAfterMs);
    const launches = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productLaunch.findMany({
        where: {
          organizationId,
          status: 'RECOVERING',
          updatedAt: { lte: staleBefore },
        },
        select: {
          id: true,
          organizationId: true,
          productId: true,
          imageProjectId: true,
          channelId: true,
          execution: true,
          selectedPublishSnapshotId: true,
          approvedPublishSnapshotHash: true,
          externalSubmissions: {
            where: {
              status: { in: ['ACKNOWLEDGED', 'RECONCILING', 'SUCCEEDED'] },
            },
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: { id: true, status: true },
          },
        },
        orderBy: { updatedAt: 'asc' },
        take: 50,
      }),
    );

    let recovered = 0;
    for (const launch of launches) {
      if (
        !launch.selectedPublishSnapshotId ||
        !launch.approvedPublishSnapshotHash ||
        launch.externalSubmissions.length === 0
      ) {
        await this.touchRecoveringLaunch(organizationId, launch.id, {
          failureCode: 'OZON_RECOVERY_IDENTITY_INVALID',
          failureMessage:
            'The acknowledged Ozon submission is missing its immutable snapshot identity.',
        });
        continue;
      }

      const claimed = await this.tenantDatabase.run(organizationId, (tx) =>
        tx.productLaunch.updateMany({
          where: {
            id: launch.id,
            organizationId,
            status: 'RECOVERING',
            updatedAt: { lte: staleBefore },
          },
          data: {
            failureCode: 'OZON_READBACK_IN_PROGRESS',
            failureMessage:
              'Checking the acknowledged Ozon submission without issuing another import.',
          },
        }),
      );
      if (claimed.count !== 1) continue;

      try {
        const identity = {
          organizationId,
          productLaunchId: launch.id,
          publishSnapshotId: launch.selectedPublishSnapshotId,
          snapshotHash: launch.approvedPublishSnapshotHash,
        };
        const result = await this.ozonPublisher.preflightSnapshot({
          organizationId,
          snapshotId: launch.selectedPublishSnapshotId,
          expectedSnapshotHash: launch.approvedPublishSnapshotHash,
        });

        if (
          result?.status !== 'ACTIVE_ON_OZON' &&
          result?.status !== 'SUBMITTED_TO_OZON'
        ) {
          await this.touchRecoveringLaunch(organizationId, launch.id, {
            channelId: result?.channelId ?? launch.channelId,
            failureCode:
              result?.code ??
              (result ? 'OZON_READBACK_NOT_READY' : 'OZON_ACTIVATION_PENDING'),
            failureMessage:
              result?.message ??
              'Ozon has not exposed an active offer for the acknowledged submission yet.',
          });
          continue;
        }

        const evidence = {
          ...(result.evidence ?? {}),
          source:
            typeof result.evidence?.source === 'string'
              ? result.evidence.source
              : 'ozon_offer_readback',
          recoveryScan: true,
          checkedAt: now.toISOString(),
        };
        await this.externalSubmissions.recordReconciledResult(
          identity,
          result,
          evidence,
        );

        const active = result.status === 'ACTIVE_ON_OZON';
        const execution = {
          ...this.asRecord(launch.execution),
          ozonSubmission: result.status,
          channelId: result.channelId ?? launch.channelId ?? null,
          taskId: result.taskId ?? null,
          externalProductId: result.externalProductId ?? null,
          externalStatus: result.externalStatus ?? null,
          evidence,
          recoveredAt: now.toISOString(),
        } as Prisma.InputJsonValue;

        if (active) {
          await this.actionProposals.reconcileApprovedProductLaunchOutcome({
            organizationId,
            productLaunchId: launch.id,
            status: 'EXECUTED',
            result,
            now,
          });
        }

        const launchUpdated = await this.tenantDatabase.run(
          organizationId,
          async (tx) => {
            const updated = await tx.productLaunch.updateMany({
              where: {
                id: launch.id,
                organizationId,
                status: 'RECOVERING',
              },
              data: {
                status: active ? 'ACTIVE_ON_OZON' : 'RECOVERING',
                channelId: result.channelId ?? launch.channelId,
                completedAt: active ? now : null,
                failureCode: active ? null : 'OZON_ACTIVATION_PENDING',
                failureMessage: active
                  ? null
                  : (result.message ??
                    'Waiting for Ozon to confirm that the submitted offer is active.'),
                execution,
              },
            });
            if (updated.count !== 1) return false;

            await tx.listingPublishSnapshot.updateMany({
              where: {
                id: launch.selectedPublishSnapshotId!,
                organizationId,
                productLaunchId: launch.id,
                snapshotHash: launch.approvedPublishSnapshotHash!,
              },
              data: {
                status: active ? 'ACTIVE' : 'SUBMITTED',
                result: result as unknown as Prisma.InputJsonValue,
                failureCode: null,
                failureMessage: null,
                submittedAt: now,
              },
            });

            if (active && launch.productId) {
              await tx.product.updateMany({
                where: {
                  id: launch.productId,
                  workspace: { organizationId },
                },
                data: {
                  status: 'ACTIVE',
                  ...(result.externalProductId
                    ? { asinOrExternalId: String(result.externalProductId) }
                    : {}),
                },
              });
            }
            return true;
          },
        );
        if (active && launchUpdated) recovered += 1;
      } catch (error) {
        await this.touchRecoveringLaunch(organizationId, launch.id, {
          failureCode: 'OZON_READBACK_FAILED',
          failureMessage: this.errorMessage(error).slice(0, 2000),
        });
      }
    }

    if (recovered > 0) {
      this.logger.log(
        `Recovered ${recovered} active Ozon product launch(es) for ${organizationId}`,
      );
    }
    return { scanned: launches.length, recovered };
  }

  private touchRecoveringLaunch(
    organizationId: string,
    launchId: string,
    data: {
      channelId?: string | null;
      failureCode: string;
      failureMessage: string;
    },
  ) {
    return this.tenantDatabase.run(organizationId, (tx) =>
      tx.productLaunch.updateMany({
        where: { id: launchId, organizationId, status: 'RECOVERING' },
        data: {
          ...(data.channelId !== undefined
            ? { channelId: data.channelId }
            : {}),
          failureCode: data.failureCode,
          failureMessage: data.failureMessage,
          completedAt: null,
        },
      }),
    );
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private positiveNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
