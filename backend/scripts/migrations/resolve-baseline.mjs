import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  backendRootFromArgs,
  readJson,
  resolveManifestPath,
  resolveStoredPath,
} from './governance-lib.mjs';

const argv = process.argv.slice(2);
const root = backendRootFromArgs(argv);
const apply = argv.includes('--apply');
const baselineIndex = argv.indexOf('--baseline');
const requestedBaseline = baselineIndex >= 0 ? argv[baselineIndex + 1] : null;
const manifest = await readJson(resolveManifestPath(root));
const require = createRequire(import.meta.url);
const prismaCli = require.resolve('prisma/build/index.js');

function runPrisma(args, stdio = 'inherit') {
  return spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: root,
    env: process.env,
    stdio,
  });
}

if (!apply) {
  console.log(
    JSON.stringify(
      {
        status: 'dry-run',
        baseline: manifest.baseline.id,
        frozenMigrations: manifest.frozenMigrations.length,
        instruction:
          'Use --apply --baseline <id> with MIGRATION_BASELINE_APPLY=1 only for an existing schema-equivalent database with an empty Prisma migration history.',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (process.env.MIGRATION_BASELINE_APPLY !== '1') {
  throw new Error('MIGRATION_BASELINE_APPLY=1 is required');
}
if (requestedBaseline !== manifest.baseline.id) {
  throw new Error(`--baseline must equal ${manifest.baseline.id}`);
}
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sourceSchema = path.join(root, 'prisma', 'schema.prisma');
const baselineSchema = resolveStoredPath(
  root,
  manifest.baseline.schemaSnapshot,
);
const diff = runPrisma([
  'migrate',
  'diff',
  '--from-schema-datasource',
  sourceSchema,
  '--to-schema-datamodel',
  baselineSchema,
  '--exit-code',
]);
if (diff.status === 2) {
  throw new Error('Target database does not exactly match the frozen baseline');
}
if (diff.status !== 0) {
  throw new Error('Unable to verify target database against the baseline');
}

const prisma = new PrismaClient();
try {
  const tableRows = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public._prisma_migrations')::text AS table_name`,
  );
  const tableExists = Boolean(tableRows[0]?.table_name);
  const countRows = tableExists
    ? await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS count FROM public._prisma_migrations`,
      )
    : [{ count: 0 }];
  const count = Number(countRows[0]?.count ?? 0);
  if (count !== 0) {
    throw new Error(
      `Baseline resolve requires an empty migration history; found ${count} records`,
    );
  }
} finally {
  await prisma.$disconnect();
}

for (const migration of manifest.frozenMigrations) {
  const result = runPrisma(['migrate', 'resolve', '--applied', migration.name]);
  if (result.status !== 0) {
    throw new Error(`Failed to resolve ${migration.name} as applied`);
  }
}

const deploy = runPrisma(['migrate', 'deploy']);
if (deploy.status !== 0) {
  throw new Error('Current release migrations failed after baseline resolve');
}

const status = runPrisma(['migrate', 'status']);
if (status.status !== 0) {
  throw new Error('Migration status is not clean after baseline resolve');
}
console.log(
  JSON.stringify(
    {
      status: 'applied',
      baseline: manifest.baseline.id,
      resolvedMigrations: manifest.frozenMigrations.length,
      deployedRelease: manifest.activeRelease,
    },
    null,
    2,
  ),
);
