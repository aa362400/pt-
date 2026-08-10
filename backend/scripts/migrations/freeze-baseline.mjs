import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  backendRootFromArgs,
  listMigrations,
  pathExists,
  resolveManifestPath,
  sha256File,
} from './governance-lib.mjs';

const root = backendRootFromArgs();
const manifestPath = resolveManifestPath(root);
const baselineId = 'v1-baseline';
const baselineRoot = path.join(root, 'prisma', 'baselines', baselineId);
const schemaSnapshot = path.join(baselineRoot, 'schema.prisma');
const sqlSnapshot = path.join(baselineRoot, 'migration.sql');

if (process.env.MIGRATION_BASELINE_FREEZE !== '1') {
  throw new Error(
    'Refusing to freeze a baseline without MIGRATION_BASELINE_FREEZE=1',
  );
}
if (await pathExists(manifestPath)) {
  throw new Error(
    'migration-governance.json already exists; baselines are immutable and cannot be overwritten',
  );
}
for (const target of [schemaSnapshot, sqlSnapshot]) {
  if (!(await pathExists(target))) {
    throw new Error(`Baseline artifact missing: ${target}`);
  }
}

const migrations = await listMigrations(root);
if (migrations.length === 0 || migrations.some((item) => !item.sha256)) {
  throw new Error('Every migration must contain migration.sql before freezing');
}

const manifest = {
  schemaVersion: 1,
  baseline: {
    id: baselineId,
    createdAt: new Date().toISOString(),
    frozenThrough: migrations.at(-1).name,
    migrationCount: migrations.length,
    schemaSnapshot: 'prisma/baselines/v1-baseline/schema.prisma',
    schemaSha256: await sha256File(schemaSnapshot),
    sqlSnapshot: 'prisma/baselines/v1-baseline/migration.sql',
    sqlSha256: await sha256File(sqlSnapshot),
    source:
      'PostgreSQL schema-only dump after all frozen migrations; data and _prisma_migrations excluded',
  },
  frozenMigrations: migrations.map((migration) => ({
    name: migration.name,
    sha256: migration.sha256,
  })),
  activeRelease: 'v1.1-schema-governance',
  releases: [
    {
      id: 'v1.1-schema-governance',
      status: 'OPEN',
      description:
        'Post-baseline migration governance and forward schema changes',
      migrations: [],
    },
  ],
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(
  JSON.stringify(
    {
      status: 'frozen',
      baseline: baselineId,
      migrations: migrations.length,
      frozenThrough: migrations.at(-1).name,
    },
    null,
    2,
  ),
);
