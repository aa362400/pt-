import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

function loadEnv(): Record<string, string> {
  const source = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  const entries = source
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith('#'))
    .map((line): [string, string] => {
      const index = line.indexOf('=');
      return index < 0
        ? ['', '']
        : [line.slice(0, index), line.slice(index + 1)];
    })
    .filter(([key]) => key);

  return Object.fromEntries(entries);
}

async function main() {
  const env = loadEnv();
  if (!env.DATABASE_ADMIN_URL) {
    throw new Error('DATABASE_ADMIN_URL is required');
  }
  const prisma = new PrismaClient({
    datasources: { db: { url: env.DATABASE_ADMIN_URL } },
  });
  const now = new Date().toISOString();
  try {
    const [workMemories, experienceCards] = await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE agent_work_memories
           SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
             'governance', jsonb_build_object(
               'sourceType', 'legacy_unknown',
               'sourceId', NULL,
               'version', 0,
               'contentHash', NULL,
               'trustStatus', 'quarantined',
               'validFrom', ${now},
               'validUntil', NULL,
               'reasons', jsonb_build_array('legacy_unverified'),
               'redactions', 0
             )
           )
         WHERE metadata->'governance' IS NULL
      `,
      prisma.$executeRaw`
        UPDATE agent_experience_cards
           SET evidence = COALESCE(evidence, '{}'::jsonb) || jsonb_build_object(
             'governance', jsonb_build_object(
               'sourceType', 'legacy_unknown',
               'sourceId', NULL,
               'version', 0,
               'contentHash', NULL,
               'trustStatus', 'quarantined',
               'validFrom', ${now},
               'validUntil', NULL,
               'reasons', jsonb_build_array('legacy_unverified'),
               'redactions', 0
             )
           )
         WHERE evidence->'governance' IS NULL
      `,
    ]);
    process.stdout.write(
      `${JSON.stringify(
        {
          status: 'completed',
          policy: 'legacy_records_quarantined_not_trusted',
          workMemories,
          experienceCards,
          updatedAt: now,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
