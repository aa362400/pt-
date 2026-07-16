import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { TenantDatabaseContextService } from '../database/tenant-database-context.service.js';

const GENESIS_HASH = '0'.repeat(64);

export interface AuditEntry {
  organizationId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

/**
 * Writes immutable audit trail records. Failures are logged but never
 * propagated — auditing must not break the business operation itself.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.appendStrict(entry);
    } catch (error) {
      this.logger.error(
        `Failed to write audit log (${entry.action} ${entry.resourceType}/${entry.resourceId})`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async appendStrict(entry: AuditEntry) {
    await this.ensureChainInitialized(entry.organizationId);
    return this.withSerializableRetry(entry.organizationId, async (tx) => {
      const head = await tx.auditChainHead.findUniqueOrThrow({
        where: { organizationId: entry.organizationId },
      });
      const sequence = head.lastSequence + 1n;
      const createdAt = new Date();
      const payload = this.hashPayload(
        entry,
        sequence,
        head.lastHash,
        createdAt,
      );
      const entryHash = this.hash(payload, head.lastHash);
      const log = await tx.auditLog.create({
        data: {
          organizationId: entry.organizationId,
          actorId: entry.actorId,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          before: (entry.before ?? undefined) as Prisma.InputJsonValue,
          after: (entry.after ?? undefined) as Prisma.InputJsonValue,
          ip: entry.ip,
          userAgent: entry.userAgent,
          sequence,
          previousHash: head.lastHash,
          entryHash,
          hashAlgorithm: 'SHA-256',
          createdAt,
        },
      });
      await tx.auditChainHead.update({
        where: { organizationId: entry.organizationId },
        data: { lastSequence: sequence, lastHash: entryHash },
      });
      return log;
    });
  }

  async verifyIntegrity(organizationId: string) {
    await this.ensureChainInitialized(organizationId);
    const [logs, unchainedCount, head] = await this.tenantDatabase.run(
      organizationId,
      (tx) =>
        Promise.all([
          tx.auditLog.findMany({
            where: { organizationId, sequence: { not: null } },
            orderBy: { sequence: 'asc' },
          }),
          tx.auditLog.count({
            where: {
              organizationId,
              OR: [
                { sequence: null },
                { previousHash: null },
                { entryHash: null },
              ],
            },
          }),
          tx.auditChainHead.findUnique({ where: { organizationId } }),
        ]),
    );
    const breaks: Array<{ id: string; sequence: string; reason: string }> = [];
    let expectedPreviousHash = GENESIS_HASH;
    let expectedSequence = 1n;
    for (const log of logs) {
      const sequence = log.sequence ?? 0n;
      if (sequence !== expectedSequence) {
        breaks.push({
          id: log.id,
          sequence: sequence.toString(),
          reason: `expected sequence ${expectedSequence.toString()}`,
        });
      }
      if (log.previousHash !== expectedPreviousHash) {
        breaks.push({
          id: log.id,
          sequence: sequence.toString(),
          reason: 'previous hash mismatch',
        });
      }
      const payload = this.hashPayload(
        log,
        sequence,
        log.previousHash ?? '',
        log.createdAt,
      );
      const calculated = this.hash(payload, log.previousHash ?? '');
      if (calculated !== log.entryHash) {
        breaks.push({
          id: log.id,
          sequence: sequence.toString(),
          reason: 'entry hash mismatch',
        });
      }
      expectedPreviousHash = log.entryHash ?? '';
      expectedSequence = sequence + 1n;
    }
    const headMatches = Boolean(
      head &&
      head.lastSequence === BigInt(logs.length) &&
      head.lastHash === (logs.at(-1)?.entryHash ?? GENESIS_HASH),
    );
    return {
      valid: unchainedCount === 0 && breaks.length === 0 && headMatches,
      algorithm: 'SHA-256',
      totalEntries: logs.length + unchainedCount,
      chainedEntries: logs.length,
      unchainedEntries: unchainedCount,
      headMatches,
      lastSequence: head?.lastSequence.toString() ?? '0',
      lastHash: head?.lastHash ?? GENESIS_HASH,
      breaks: breaks.slice(0, 20),
      verifiedAt: new Date().toISOString(),
    };
  }

  private async ensureChainInitialized(organizationId: string): Promise<void> {
    const existing = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.auditChainHead.findUnique({
        where: { organizationId },
        select: { organizationId: true },
      }),
    );
    if (existing) return;
    await this.withSerializableRetry(organizationId, async (tx) => {
      const concurrent = await tx.auditChainHead.findUnique({
        where: { organizationId },
        select: { organizationId: true },
      });
      if (concurrent) return;
      const historical = await tx.auditLog.findMany({
        where: { organizationId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      let previousHash = GENESIS_HASH;
      let sequence = 0n;
      for (const log of historical) {
        sequence += 1n;
        const payload = this.hashPayload(
          log,
          sequence,
          previousHash,
          log.createdAt,
        );
        const entryHash = this.hash(payload, previousHash);
        await tx.auditLog.update({
          where: { id: log.id },
          data: {
            sequence,
            previousHash,
            entryHash,
            hashAlgorithm: 'SHA-256',
          },
        });
        previousHash = entryHash;
      }
      await tx.auditChainHead.create({
        data: {
          organizationId,
          lastSequence: sequence,
          lastHash: previousHash,
        },
      });
    });
  }

  private hashPayload(
    entry: AuditEntry | Record<string, unknown>,
    sequence: bigint,
    previousHash: string,
    createdAt: Date,
  ) {
    return {
      organizationId: entry.organizationId,
      sequence: sequence.toString(),
      previousHash,
      actorId: entry.actorId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      createdAt: createdAt.toISOString(),
    };
  }

  private hash(payload: unknown, previousHash: string): string {
    return createHash('sha256')
      .update(`${previousHash}\n${this.canonicalJson(payload)}`, 'utf8')
      .digest('hex');
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

  private async withSerializableRetry<T>(
    organizationId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 8;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.tenantDatabase.run(organizationId, operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code);
        if (!retryable || attempt === maxAttempts) throw error;
        const delayMs = Math.min(500, 20 * 2 ** (attempt - 1));
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error('Audit chain transaction retry exhausted');
  }
}
