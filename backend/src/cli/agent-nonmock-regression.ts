import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { AgentRunsService } from '../features/agent-runs/agent-runs.service.js';
import { TenantDatabaseContextService } from '../shared/database/tenant-database-context.service.js';
import { ConfigService } from '@nestjs/config';
import type { JwtPayload } from '../shared/auth/jwt.strategy.js';
import type { AgentRun } from '@prisma/client';

const POLL_INTERVAL_MS = 3_000;
const TIMEOUT_MS = 15 * 60_000;

function loadPilotOrganizationId(): string {
  const envPath = resolve(process.cwd(), '.env');
  const source = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const fileValue = source
    .split(/\r?\n/)
    .find((candidate) =>
      candidate.startsWith('ENTERPRISE_PILOT_ORGANIZATION_IDS='),
    )
    ?.slice('ENTERPRISE_PILOT_ORGANIZATION_IDS='.length);
  const organizationId = (
    process.env.ENTERPRISE_PILOT_ORGANIZATION_IDS ||
    fileValue ||
    ''
  )
    .split(',')[0]
    ?.trim();
  if (!organizationId || !/^[A-Za-z0-9_-]{1,128}$/.test(organizationId)) {
    throw new Error('A valid enterprise pilot organization is required');
  }
  return organizationId;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const config = app.get(ConfigService);
    if (config.get<boolean>('AGENT_ALLOW_MOCK', false)) {
      throw new Error('AGENT_ALLOW_MOCK must be false for this acceptance');
    }
    const organizationId = loadPilotOrganizationId();
    const tenantDatabase = app.get(TenantDatabaseContextService);
    const agentRuns = app.get(AgentRunsService);
    const source = await tenantDatabase.run(organizationId, async (tx) => {
      const membership = await tx.membership.findFirst({
        where: {
          organizationId,
          status: 'ACTIVE',
          role: { in: ['OWNER', 'ADMIN'] },
        },
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { email: true, locale: true } } },
      });
      const workspace = await tx.workspace.findFirst({
        where: { organizationId, channelType: 'OZON', status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      const product = workspace
        ? await tx.product.findFirst({
            where: { workspaceId: workspace.id, images: { isEmpty: false } },
            orderBy: { createdAt: 'desc' },
            select: { id: true, title: true, images: true },
          })
        : null;
      return { membership, workspace, product };
    });
    if (!source.membership || !source.workspace || !source.product) {
      throw new Error(
        'Pilot organization needs an active operator and an Ozon product image',
      );
    }
    const user: JwtPayload = {
      sub: source.membership.userId,
      email: source.membership.user.email,
      role: source.membership.role,
      orgId: organizationId,
    };
    const startedAt = new Date();
    const run = await agentRuns.create(
      user,
      {
        agentType: 'IMAGE_CREATIVE',
        workspaceId: source.workspace.id,
        clientRequestId: `enterprise-nonmock-${startedAt.toISOString()}`,
        input: {
          productId: source.product.id,
          productName: source.product.title,
          imageUrl: source.product.images[0],
          sceneCount: 1,
          platforms: ['ozon'],
          message:
            'Enterprise non-mock regression only. Generate one truthful local candidate image. Do not publish or mutate any marketplace.',
        },
      },
      source.membership.user.locale,
    );
    const deadline = Date.now() + TIMEOUT_MS;
    let completed: AgentRun | null = null;
    while (Date.now() < deadline) {
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, POLL_INTERVAL_MS),
      );
      completed = await tenantDatabase.run(organizationId, (tx) =>
        tx.agentRun.findFirst({ where: { id: run.id, organizationId } }),
      );
      if (
        completed?.status === 'COMPLETED' ||
        completed?.status === 'FAILED' ||
        completed?.status === 'DEAD_LETTERED' ||
        completed?.status === 'TIMEOUT'
      ) {
        break;
      }
    }
    const output =
      completed?.output &&
      typeof completed.output === 'object' &&
      !Array.isArray(completed.output)
        ? (completed.output as Record<string, unknown>)
        : {};
    const images = Array.isArray(output.images) ? output.images : [];
    const passed =
      completed?.status === 'COMPLETED' &&
      output.mockMode === false &&
      images.length > 0;
    const evidence = {
      status: passed ? 'passed' : 'failed',
      mode: 'real-provider-local-output-only',
      externalMutation: false,
      agentRunId: run.id,
      productId: source.product.id,
      startedAt: startedAt.toISOString(),
      finishedAt: completed?.finishedAt?.toISOString() ?? null,
      runStatus: completed?.status ?? 'missing',
      mockMode: output.mockMode ?? null,
      generatedImageCount: images.length,
      errorCode: completed?.errorCode ?? null,
      errorMessage: completed?.errorMessage ?? null,
    };
    const evidencePath = resolve(
      process.cwd(),
      process.env.AGENT_NONMOCK_EVIDENCE_PATH ||
        '.agent-runtime/agent-nonmock-regression.json',
    );
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
