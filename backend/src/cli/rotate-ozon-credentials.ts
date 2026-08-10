import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { ChannelsService } from '../features/channels/channels.service.js';
import { PrismaService } from '../shared/database/prisma.service.js';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const channels = app.get(ChannelsService);
    const organizations = await prisma.organization.findMany({
      where: {
        workspaces: {
          some: { channelConns: { some: { provider: 'OZON' } } },
        },
      },
      select: {
        id: true,
        memberships: {
          where: { status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { role: true, user: { select: { id: true, email: true } } },
        },
      },
    });

    const results = [];
    for (const organization of organizations) {
      const membership = organization.memberships[0];
      if (!membership) {
        results.push({
          organizationId: organization.id,
          status: 'skipped_no_active_admin',
        });
        continue;
      }
      const result = await channels.rotateOzonCredentials({
        sub: membership.user.id,
        email: membership.user.email,
        orgId: organization.id,
        role: membership.role,
      });
      results.push({
        organizationId: organization.id,
        status: 'completed',
        ...result,
      });
    }
    process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
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
