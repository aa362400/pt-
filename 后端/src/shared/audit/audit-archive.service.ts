import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { requireOrg } from '../tenancy/org-scope.js';
import { AuditService } from './audit.service.js';
import { S3AuditArchiveStore } from './s3-audit-archive.store.js';
import { TenantDatabaseContextService } from '../database/tenant-database-context.service.js';

@Injectable()
export class AuditArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly store: S3AuditArchiveStore,
    private readonly config: ConfigService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  async archiveDay(user: JwtPayload, date: string) {
    const organizationId = requireOrg(user);
    const { start, end, day } = this.closedUtcDay(date);
    const existing = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.auditArchive.findUnique({
        where: { organizationId_date: { organizationId, date: start } },
      }),
    );
    if (existing) {
      await this.ensureArchiveAudited(user, existing.id, existing.objectKey);
      return this.serialize(existing);
    }

    const integrity = await this.audit.verifyIntegrity(organizationId);
    if (!integrity.valid) {
      throw new ServiceUnavailableException(
        'Audit hash chain is invalid; immutable archive was blocked',
      );
    }
    const entries = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.auditLog.findMany({
        where: {
          organizationId,
          createdAt: { gte: start, lt: end },
          sequence: { not: null },
        },
        orderBy: { sequence: 'asc' },
      }),
    );
    if (!entries.length) {
      throw new BadRequestException(
        'No chained audit entries exist for this day',
      );
    }
    const first = entries[0];
    const last = entries.at(-1)!;
    const manifest = {
      schemaVersion: 'audit-archive.v1',
      organizationId,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      generatedAt: end.toISOString(),
      hashAlgorithm: 'SHA-256',
      entryCount: entries.length,
      firstSequence: first.sequence!.toString(),
      lastSequence: last.sequence!.toString(),
      firstPreviousHash: first.previousHash,
      finalHash: last.entryHash,
      entries: entries.map((entry) => ({
        ...entry,
        sequence: entry.sequence!.toString(),
        createdAt: entry.createdAt.toISOString(),
      })),
    };
    const body = Buffer.from(this.canonicalJson(manifest), 'utf8');
    const contentHash = createHash('sha256').update(body).digest('hex');
    const objectKey = `audit/${organizationId}/${day}/${manifest.firstSequence}-${manifest.lastSequence}-${contentHash}.json`;
    const retentionDays = this.retentionDays();
    const retainUntil = new Date(end.getTime() + retentionDays * 86_400_000);
    const external = await this.store.putAndVerify({
      key: objectKey,
      body,
      checksumHex: contentHash,
      retainUntil,
    });
    const receipt = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.auditArchive.upsert({
        where: { organizationId_date: { organizationId, date: start } },
        update: {},
        create: {
          organizationId,
          date: start,
          objectKey,
          contentHash,
          entryCount: entries.length,
          firstSequence: first.sequence!,
          lastSequence: last.sequence!,
          firstPreviousHash: first.previousHash!,
          finalHash: last.entryHash!,
          versionId: external.versionId,
          objectLockMode: external.objectLockMode,
          retainUntil: external.retainUntil,
          verifiedAt: external.verifiedAt,
        },
      }),
    );
    await this.audit.appendStrict({
      organizationId,
      actorId: user.sub,
      action: 'audit.archive.created',
      resourceType: 'AuditArchive',
      resourceId: receipt.id,
      after: {
        objectKey,
        contentHash,
        versionId: external.versionId,
        objectLockMode: external.objectLockMode,
        retainUntil: external.retainUntil.toISOString(),
      },
    });
    return this.serialize(receipt);
  }

  async list(user: JwtPayload) {
    const organizationId = requireOrg(user);
    const items = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.auditArchive.findMany({
        where: { organizationId },
        orderBy: { date: 'desc' },
        take: 90,
      }),
    );
    return items.map((item) => this.serialize(item));
  }

  private async ensureArchiveAudited(
    user: JwtPayload,
    archiveId: string,
    objectKey: string,
  ) {
    const organizationId = requireOrg(user);
    const existing = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.auditLog.findFirst({
        where: {
          organizationId,
          action: 'audit.archive.created',
          resourceType: 'AuditArchive',
          resourceId: archiveId,
        },
        select: { id: true },
      }),
    );
    if (!existing) {
      await this.audit.appendStrict({
        organizationId,
        actorId: user.sub,
        action: 'audit.archive.created',
        resourceType: 'AuditArchive',
        resourceId: archiveId,
        after: { objectKey, recoveredAuditReceipt: true },
      });
    }
  }

  private closedUtcDay(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('date must use YYYY-MM-DD');
    }
    const start = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(start.getTime()) ||
      start.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException('date is invalid');
    }
    const today = new Date();
    const todayStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    if (start >= todayStart) {
      throw new BadRequestException('Only a closed UTC day can be archived');
    }
    return {
      start,
      end: new Date(start.getTime() + 86_400_000),
      day: value,
    };
  }

  private retentionDays(): number {
    const configured = Number(
      this.config.get<number | string>('AUDIT_ARCHIVE_RETENTION_DAYS', 2555),
    );
    return Number.isFinite(configured) && configured >= 365
      ? Math.floor(configured)
      : 2555;
  }

  private canonicalJson(value: unknown): string {
    return JSON.stringify(this.normalize(value));
  }

  private normalize(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();
    if (Array.isArray(value)) return value.map((item) => this.normalize(item));
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(record)
          .filter((key) => record[key] !== undefined)
          .sort()
          .map((key) => [key, this.normalize(record[key])]),
      );
    }
    return value;
  }

  private serialize<T extends { firstSequence: bigint; lastSequence: bigint }>(
    item: T,
  ) {
    return {
      ...item,
      firstSequence: item.firstSequence.toString(),
      lastSequence: item.lastSequence.toString(),
    };
  }
}
