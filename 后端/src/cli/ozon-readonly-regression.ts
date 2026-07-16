import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../shared/database/prisma.service.js';
import { AuditService } from '../shared/audit/audit.service.js';
import { ChannelsService } from '../features/channels/channels.service.js';
import { TenantDatabaseContextService } from '../shared/database/tenant-database-context.service.js';

interface ProbeEvidence {
  key: string;
  status: string;
  message: string;
  fetched?: number;
  total?: number;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const channels = app.get(ChannelsService);
    const tenantDatabase = app.get(TenantDatabaseContextService);
    const audit = app.get(AuditService);
    const requestedChannelId = process.env.OZON_E2E_CHANNEL_ID?.trim();
    const syncLocal = process.env.OZON_E2E_SYNC_LOCAL === 'true';
    const organizations = await prisma.organization.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    let channel = null;
    for (const organization of organizations) {
      channel = await tenantDatabase.run(organization.id, (tx) =>
        tx.channelConnection.findFirst({
          where: {
            provider: 'OZON',
            syncStatus: 'SUCCESS',
            workspace: { organizationId: organization.id },
            ...(requestedChannelId ? { id: requestedChannelId } : {}),
          },
          orderBy: { lastSyncedAt: 'desc' },
          select: {
            id: true,
            workspaceId: true,
            workspace: { select: { organizationId: true } },
          },
        }),
      );
      if (channel) break;
    }
    if (!channel) throw new Error('No connected Ozon channel is available');
    const member = await tenantDatabase.run(
      channel.workspace.organizationId,
      (tx) =>
        tx.membership.findFirst({
          where: {
            organizationId: channel.workspace.organizationId,
            status: 'ACTIVE',
          },
          select: {
            user: { select: { id: true, email: true } },
            role: true,
          },
        }),
    );
    if (!member) throw new Error('Ozon organization has no active member');
    const user = {
      sub: member.user.id,
      email: member.user.email,
      orgId: channel.workspace.organizationId,
      role: member.role,
    };
    const startedAt = new Date();
    const diagnostic = await channels.diagnoseOzon(user, channel.id);
    const probes = diagnostic.probes as ProbeEvidence[];
    const failedProbes = probes.filter((probe) => probe.status !== 'ok');
    let localSync:
      | {
          products: { fetched: number; synced: number };
          orders: { fetched: number; synced: number; changed: number };
        }
      | undefined;
    if (syncLocal && failedProbes.length === 0) {
      const products = await channels.syncProducts(user, channel.id, {
        limit: 5,
      });
      const orders = await channels.syncOrders(user, channel.id, { limit: 5 });
      localSync = {
        products: { fetched: products.fetched, synced: products.synced },
        orders: {
          fetched: orders.fetched,
          synced: orders.synced,
          changed: orders.changed,
        },
      };
    }
    const integrity = await audit.verifyIntegrity(
      channel.workspace.organizationId,
    );
    const finishedAt = new Date();
    const evidence = {
      status:
        failedProbes.length === 0 && integrity.valid ? 'passed' : 'failed',
      mode: syncLocal ? 'external-read-local-sync' : 'external-read-only',
      externalMutation: false,
      channelId: channel.id,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      overallStatus: diagnostic.overallStatus,
      probes: probes.map((probe) => ({
        key: probe.key,
        status: probe.status,
        message: probe.message,
        fetched: probe.fetched ?? null,
        total: probe.total ?? null,
      })),
      localSync,
      auditIntegrity: {
        valid: integrity.valid,
        chainedEntries: integrity.chainedEntries,
        unchainedEntries: integrity.unchainedEntries,
        breaks: integrity.breaks.length,
      },
    };
    const evidencePath = resolve(
      process.env.OZON_E2E_EVIDENCE_PATH?.trim() ||
        '.agent-runtime/ozon-readonly-regression.json',
    );
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(
      evidencePath,
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8',
    );
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    if (evidence.status !== 'passed') process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`,
  );
  process.exitCode = 1;
});
