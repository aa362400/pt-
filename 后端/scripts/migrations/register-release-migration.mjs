import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  backendRootFromArgs,
  listMigrations,
  pathExists,
  readJson,
  resolveManifestPath,
  sha256File,
} from './governance-lib.mjs';

const argv = process.argv.slice(2);
const nameIndex = argv.indexOf('--migration');
const migrationName = nameIndex >= 0 ? argv[nameIndex + 1] : null;
const root = backendRootFromArgs(argv);

if (process.env.MIGRATION_RELEASE_REGISTER !== '1') {
  throw new Error(
    'Refusing to update release governance without MIGRATION_RELEASE_REGISTER=1',
  );
}
if (!migrationName) {
  throw new Error('--migration <directory-name> is required');
}

const manifestPath = resolveManifestPath(root);
const manifest = await readJson(manifestPath);
const activeRelease = manifest.releases.find(
  (release) => release.id === manifest.activeRelease,
);
if (!activeRelease || activeRelease.status !== 'OPEN') {
  throw new Error('The active release is missing or not OPEN');
}
if (migrationName <= manifest.baseline.frozenThrough) {
  throw new Error('A frozen baseline migration cannot be registered again');
}
if (
  manifest.frozenMigrations.some((item) => item.name === migrationName) ||
  manifest.releases.some((release) =>
    release.migrations.some((item) => item.name === migrationName),
  )
) {
  throw new Error(`${migrationName} is already registered`);
}

const migration = (await listMigrations(root)).find(
  (item) => item.name === migrationName,
);
if (!migration?.sha256) {
  throw new Error(`${migrationName}/migration.sql does not exist`);
}
for (const required of ['metadata.json', 'rollback.sql']) {
  if (!(await pathExists(path.join(migration.directory, required)))) {
    throw new Error(`${migrationName}/${required} is required`);
  }
}

activeRelease.migrations.push({
  name: migration.name,
  sha256: migration.sha256,
  metadataSha256: await sha256File(
    path.join(migration.directory, 'metadata.json'),
  ),
  rollbackSha256: await sha256File(
    path.join(migration.directory, 'rollback.sql'),
  ),
});
activeRelease.migrations.sort((left, right) =>
  left.name.localeCompare(right.name),
);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(
  JSON.stringify(
    {
      status: 'registered',
      release: activeRelease.id,
      migration: migration.name,
    },
    null,
    2,
  ),
);
