import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  MIGRATION_NAME_PATTERN,
  backendRootFromArgs,
  listFilesRecursively,
  listMigrations,
  pathExists,
  readJson,
  relativePortable,
  resolveManifestPath,
  resolveStoredPath,
  sha256File,
} from './governance-lib.mjs';

const root = backendRootFromArgs();
const errors = [];

function fail(code, message) {
  errors.push({ code, message });
}

async function verifyBaseline(manifest, frozen) {
  const baseline = manifest.baseline;
  if (!baseline || typeof baseline !== 'object') {
    fail('BASELINE_MISSING', 'migration-governance.json must define baseline');
    return;
  }
  if (baseline.migrationCount !== frozen.length) {
    fail(
      'BASELINE_COUNT_MISMATCH',
      `baseline.migrationCount=${baseline.migrationCount} but ${frozen.length} frozen migrations are registered`,
    );
  }
  if (frozen.at(-1)?.name !== baseline.frozenThrough) {
    fail(
      'BASELINE_BOUNDARY_MISMATCH',
      `baseline.frozenThrough must equal the latest frozen migration (${frozen.at(-1)?.name ?? 'none'})`,
    );
  }
  if (
    typeof baseline.createdAt !== 'string' ||
    Number.isNaN(Date.parse(baseline.createdAt))
  ) {
    fail('BASELINE_DATE_INVALID', 'baseline.createdAt must be an ISO date');
  }

  for (const artifact of [
    ['schemaSnapshot', 'schemaSha256'],
    ['sqlSnapshot', 'sqlSha256'],
  ]) {
    const [pathKey, hashKey] = artifact;
    const storedPath = baseline[pathKey];
    const expectedHash = baseline[hashKey];
    if (typeof storedPath !== 'string' || typeof expectedHash !== 'string') {
      fail(
        'BASELINE_ARTIFACT_INVALID',
        `${pathKey} and ${hashKey} are required`,
      );
      continue;
    }
    const absolute = resolveStoredPath(root, storedPath);
    if (!(await pathExists(absolute))) {
      fail('BASELINE_ARTIFACT_MISSING', `${storedPath} does not exist`);
      continue;
    }
    const actualHash = await sha256File(absolute);
    if (actualHash !== expectedHash) {
      fail(
        'BASELINE_ARTIFACT_CHANGED',
        `${storedPath} is immutable (${expectedHash} expected, ${actualHash} found)`,
      );
    }
  }

  if (typeof baseline.sqlSnapshot === 'string') {
    const sqlPath = resolveStoredPath(root, baseline.sqlSnapshot);
    if (await pathExists(sqlPath)) {
      const sql = await readFile(sqlPath, 'utf8');
      const forbidden = [
        ['BASELINE_CONTAINS_MIGRATION_HISTORY', /_prisma_migrations/i],
        ['BASELINE_CONTAINS_DATA', /^(?:\s*)(?:INSERT|COPY)\s/im],
        ['BASELINE_CREATES_DATABASE', /^\s*CREATE\s+DATABASE\s/im],
        ['BASELINE_CONTAINS_PSQL_META', /^\\/m],
      ];
      for (const [code, pattern] of forbidden) {
        if (pattern.test(sql)) {
          fail(code, `${baseline.sqlSnapshot} contains forbidden baseline SQL`);
        }
      }
    }
  }
}

async function verifyReleaseMigration(release, migration, registration) {
  const metadataPath = path.join(migration.directory, 'metadata.json');
  const rollbackPath = path.join(migration.directory, 'rollback.sql');
  if (!(await pathExists(metadataPath))) {
    fail(
      'RELEASE_METADATA_MISSING',
      `${migration.name} requires metadata.json`,
    );
    return;
  }
  if (!(await pathExists(rollbackPath))) {
    fail('RELEASE_ROLLBACK_MISSING', `${migration.name} requires rollback.sql`);
    return;
  }

  let metadata;
  try {
    metadata = await readJson(metadataPath);
  } catch (error) {
    fail(
      'RELEASE_METADATA_INVALID',
      `${migration.name}/metadata.json is not valid JSON: ${error.message}`,
    );
    return;
  }

  if (metadata.releaseId !== release.id) {
    fail(
      'RELEASE_ID_MISMATCH',
      `${migration.name} metadata releaseId must be ${release.id}`,
    );
  }
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(metadata.risk)) {
    fail(
      'RELEASE_RISK_INVALID',
      `${migration.name} metadata risk must be LOW, MEDIUM or HIGH`,
    );
  }
  if (!['AUTO', 'MANUAL', 'FORWARD_ONLY'].includes(metadata.rollbackMode)) {
    fail(
      'RELEASE_ROLLBACK_MODE_INVALID',
      `${migration.name} metadata rollbackMode is invalid`,
    );
  }
  if (typeof metadata.owner !== 'string' || metadata.owner.trim().length < 2) {
    fail(
      'RELEASE_OWNER_MISSING',
      `${migration.name} metadata owner is required`,
    );
  }
  if (
    typeof metadata.backwardCompatibility !== 'string' ||
    metadata.backwardCompatibility.trim().length < 8
  ) {
    fail(
      'RELEASE_COMPATIBILITY_MISSING',
      `${migration.name} must document backwardCompatibility`,
    );
  }
  const rollback = await readFile(rollbackPath, 'utf8');
  if (rollback.trim().length < 12) {
    fail(
      'RELEASE_ROLLBACK_EMPTY',
      `${migration.name}/rollback.sql must contain a rollback or explicit forward-only recovery plan`,
    );
  }
  const metadataHash = await sha256File(metadataPath);
  const rollbackHash = await sha256File(rollbackPath);
  if (registration.metadataSha256 !== metadataHash) {
    fail(
      'RELEASE_METADATA_CHANGED',
      `${migration.name}/metadata.json changed after registration`,
    );
  }
  if (registration.rollbackSha256 !== rollbackHash) {
    fail(
      'RELEASE_ROLLBACK_CHANGED',
      `${migration.name}/rollback.sql changed after registration`,
    );
  }
}

async function verifyDeploymentEntrypoints() {
  const workflowRoot = path.join(root, '.github', 'workflows');
  const deploymentFiles = [
    ...(await listFilesRecursively(workflowRoot)),
    path.join(root, 'Dockerfile'),
  ].filter(
    (target) => target.endsWith('Dockerfile') || /\.ya?ml$/i.test(target),
  );

  for (const target of deploymentFiles) {
    if (!(await pathExists(target))) continue;
    const content = await readFile(target, 'utf8');
    if (/\bprisma\s+migrate\s+dev\b/i.test(content)) {
      fail(
        'MIGRATE_DEV_IN_DEPLOYMENT',
        `${relativePortable(root, target)} must not use prisma migrate dev`,
      );
    }
  }

  const dockerfile = path.join(root, 'Dockerfile');
  if (
    !(await pathExists(dockerfile)) ||
    !/\bprisma\s+migrate\s+deploy\b/i.test(await readFile(dockerfile, 'utf8'))
  ) {
    fail(
      'RUNTIME_DEPLOY_GATE_MISSING',
      'Dockerfile must run prisma migrate deploy before the application starts',
    );
  }

  const ciPath = path.join(root, '.github', 'workflows', 'ci.yml');
  if (await pathExists(ciPath)) {
    const ci = await readFile(ciPath, 'utf8');
    for (const marker of [
      'db:migrations:verify',
      'prisma migrate deploy',
      'db:migrations:drift:check',
      'SHADOW_DATABASE_URL',
      'prisma db execute',
      'prisma/baselines/v1-baseline/migration.sql',
    ]) {
      if (!ci.includes(marker)) {
        fail('CI_MIGRATION_GATE_MISSING', `ci.yml must run ${marker}`);
      }
    }
  } else {
    fail('CI_MISSING', '.github/workflows/ci.yml does not exist');
  }

  if (
    (await pathExists(dockerfile)) &&
    !(await readFile(dockerfile, 'utf8')).includes('scripts/migrations')
  ) {
    fail(
      'RUNTIME_MIGRATION_TOOLS_MISSING',
      'Dockerfile must copy scripts/migrations into the runtime image',
    );
  }
}

async function main() {
  const manifestPath = resolveManifestPath(root);
  if (!(await pathExists(manifestPath))) {
    fail(
      'GOVERNANCE_MANIFEST_MISSING',
      'prisma/migration-governance.json is missing',
    );
    return;
  }

  const manifest = await readJson(manifestPath);
  if (manifest.schemaVersion !== 1) {
    fail('MANIFEST_VERSION_UNSUPPORTED', 'schemaVersion must be 1');
  }

  const migrations = await listMigrations(root);
  const migrationByName = new Map(migrations.map((item) => [item.name, item]));
  const timestamps = new Set();
  for (const migration of migrations) {
    if (!MIGRATION_NAME_PATTERN.test(migration.name)) {
      fail(
        'MIGRATION_NAME_INVALID',
        `${migration.name} must match YYYYMMDDHHMMSS_lower_snake_case`,
      );
    }
    const timestamp = migration.name.slice(0, 14);
    if (timestamps.has(timestamp)) {
      fail(
        'MIGRATION_TIMESTAMP_DUPLICATE',
        `${timestamp} is used more than once`,
      );
    }
    timestamps.add(timestamp);
    if (!migration.sha256) {
      fail(
        'MIGRATION_SQL_MISSING',
        `${migration.name}/migration.sql is missing`,
      );
    }
  }

  const frozen = Array.isArray(manifest.frozenMigrations)
    ? manifest.frozenMigrations
    : [];
  const releases = Array.isArray(manifest.releases) ? manifest.releases : [];
  const releaseIds = new Set();
  for (const release of releases) {
    if (releaseIds.has(release.id)) {
      fail(
        'RELEASE_ID_DUPLICATE',
        `${release.id} is registered more than once`,
      );
    }
    releaseIds.add(release.id);
    if (!['OPEN', 'SEALED'].includes(release.status)) {
      fail(
        'RELEASE_STATUS_INVALID',
        `${release.id} status must be OPEN or SEALED`,
      );
    }
    if (
      typeof release.description !== 'string' ||
      release.description.trim().length < 8
    ) {
      fail(
        'RELEASE_DESCRIPTION_MISSING',
        `${release.id} description is required`,
      );
    }
  }
  if (!releaseIds.has(manifest.activeRelease)) {
    fail(
      'ACTIVE_RELEASE_INVALID',
      `activeRelease ${manifest.activeRelease ?? '(missing)'} is not registered`,
    );
  }
  const activeRelease = releases.find(
    (release) => release.id === manifest.activeRelease,
  );
  if (activeRelease?.status !== 'OPEN') {
    fail('ACTIVE_RELEASE_NOT_OPEN', 'activeRelease must have status OPEN');
  }

  const frozenNames = frozen.map((item) => item.name);
  const frozenNamesSorted = [...frozenNames].sort((left, right) =>
    left.localeCompare(right),
  );
  if (JSON.stringify(frozenNames) !== JSON.stringify(frozenNamesSorted)) {
    fail(
      'FROZEN_MIGRATIONS_UNSORTED',
      'frozen migrations must be chronological',
    );
  }
  for (let index = 0; index < frozen.length; index += 1) {
    if (migrations[index]?.name !== frozen[index]?.name) {
      fail(
        'FROZEN_MIGRATION_PREFIX_INVALID',
        'frozen migrations must be an exact chronological prefix of prisma/migrations',
      );
      break;
    }
  }

  const registered = new Map();
  for (const item of frozen) {
    registered.set(item.name, { sha256: item.sha256, frozen: true });
  }
  for (const release of releases) {
    if (!Array.isArray(release.migrations)) {
      fail(
        'RELEASE_MIGRATIONS_INVALID',
        `${release.id} migrations must be an array`,
      );
      continue;
    }
    for (const item of release.migrations) {
      if (item.name <= manifest.baseline.frozenThrough) {
        fail(
          'RELEASE_MIGRATION_BEFORE_BASELINE',
          `${item.name} must be newer than ${manifest.baseline.frozenThrough}`,
        );
      }
      if (registered.has(item.name)) {
        fail(
          'MIGRATION_REGISTERED_TWICE',
          `${item.name} is registered more than once`,
        );
      }
      registered.set(item.name, {
        sha256: item.sha256,
        metadataSha256: item.metadataSha256,
        rollbackSha256: item.rollbackSha256,
        frozen: false,
        release,
      });
    }
  }

  for (const [name, registration] of registered) {
    const migration = migrationByName.get(name);
    if (!migration) {
      fail(
        'REGISTERED_MIGRATION_MISSING',
        `${name} is registered but absent from disk`,
      );
      continue;
    }
    if (migration.sha256 !== registration.sha256) {
      fail(
        registration.frozen
          ? 'FROZEN_MIGRATION_CHANGED'
          : 'RELEASE_MIGRATION_CHANGED',
        `${name}/migration.sql hash changed after registration`,
      );
    }
    if (!registration.frozen) {
      await verifyReleaseMigration(
        registration.release,
        migration,
        registration,
      );
    }
  }

  for (const migration of migrations) {
    if (!registered.has(migration.name)) {
      fail(
        'UNREGISTERED_MIGRATION',
        `${migration.name} must be registered in the active release before merge`,
      );
    }
  }

  await verifyBaseline(manifest, frozen);
  await verifyDeploymentEntrypoints();
}

await main();

if (errors.length > 0) {
  console.error(JSON.stringify({ status: 'failed', errors }, null, 2));
  process.exit(1);
}

const manifest = await readJson(resolveManifestPath(root));
const migrations = await listMigrations(root);
console.log(
  JSON.stringify(
    {
      status: 'passed',
      baseline: manifest.baseline.id,
      frozenThrough: manifest.baseline.frozenThrough,
      migrations: migrations.length,
      activeRelease: manifest.activeRelease,
    },
    null,
    2,
  ),
);
