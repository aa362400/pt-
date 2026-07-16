import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const prisma = new PrismaClient();
try {
  const failed = await prisma.$queryRawUnsafe(`
    SELECT
      migration_name AS "migrationName",
      started_at AS "startedAt",
      finished_at AS "finishedAt",
      rolled_back_at AS "rolledBackAt",
      applied_steps_count AS "appliedStepsCount",
      left(COALESCE(logs, ''), 8000) AS logs
    FROM public._prisma_migrations
    WHERE finished_at IS NULL
      AND rolled_back_at IS NULL
    ORDER BY started_at ASC
  `);
  console.log(
    JSON.stringify(
      {
        status: failed.length === 0 ? 'clean' : 'failed-migrations-found',
        count: failed.length,
        migrations: failed,
      },
      null,
      2,
    ),
  );
  process.exitCode = failed.length === 0 ? 0 : 2;
} finally {
  await prisma.$disconnect();
}
