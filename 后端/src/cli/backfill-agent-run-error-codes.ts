import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { normalizeAgentRunErrorCode } from '../shared/errors/agent-run-error-code.js';

function loadEnv(): Record<string, string> {
  const source = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith('#'))
      .map((line): [string, string] => {
        const index = line.indexOf('=');
        return index < 0
          ? ['', '']
          : [line.slice(0, index), line.slice(index + 1)];
      })
      .filter(([key]) => key),
  );
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = loadEnv();
  const databaseUrl = env.DATABASE_ADMIN_URL || env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_ADMIN_URL or DATABASE_URL is required');

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const summary: Record<string, number> = {};
  let scanned = 0;
  let eligible = 0;
  let updated = 0;
  let cursor: string | undefined;
  try {
    while (true) {
      const rows = await prisma.agentRun.findMany({
        where: {
          errorMessage: { not: null },
          OR: [{ errorCode: null }, { errorCode: 'AGENT_ERROR' }],
        },
        select: { id: true, errorCode: true, errorMessage: true },
        orderBy: { id: 'asc' },
        take: 200,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (rows.length === 0) break;
      for (const row of rows) {
        scanned += 1;
        const nextCode = normalizeAgentRunErrorCode(new Error(row.errorMessage ?? ''));
        if (nextCode === 'AGENT_ERROR') continue;
        eligible += 1;
        summary[nextCode] = (summary[nextCode] ?? 0) + 1;
        if (apply) {
          const result = await prisma.agentRun.updateMany({
            where: { id: row.id, errorCode: row.errorCode },
            data: { errorCode: nextCode },
          });
          updated += result.count;
        }
      }
      cursor = rows.at(-1)?.id;
    }
    process.stdout.write(`${JSON.stringify({
      status: apply ? 'applied' : 'dry-run',
      scanned,
      eligible,
      updated,
      byErrorCode: summary,
      note: apply
        ? '仅更新原 errorCode 为空或 AGENT_ERROR 且可确定归一代码的记录。'
        : '未修改数据库；传入 --apply 后执行幂等回填。',
    }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
