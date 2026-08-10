import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const verifier = path.resolve(
  process.cwd(),
  'scripts/migrations/verify-migration-governance.mjs',
);

function hash(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

function write(target: string, content: string) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
}

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'migration-governance-'));
  const migrationName = '20260715200000_initial_baseline';
  const migrationSql = 'CREATE TABLE example (id text PRIMARY KEY);\n';
  const schema =
    'datasource db { provider = "postgresql" url = env("DATABASE_URL") }\n';
  const baselineSql = migrationSql;

  write(
    path.join(root, 'prisma/migrations', migrationName, 'migration.sql'),
    migrationSql,
  );
  write(path.join(root, 'prisma/baselines/v1-baseline/schema.prisma'), schema);
  write(
    path.join(root, 'prisma/baselines/v1-baseline/migration.sql'),
    baselineSql,
  );
  write(
    path.join(root, '.github/workflows/ci.yml'),
    'env: SHADOW_DATABASE_URL\nrun: pnpm run db:migrations:verify\nrun: pnpm exec prisma migrate deploy\nrun: pnpm run db:migrations:drift:check\nrun: pnpm exec prisma db execute --file prisma/baselines/v1-baseline/migration.sql\n',
  );
  write(
    path.join(root, 'Dockerfile'),
    'COPY scripts/migrations ./scripts/migrations\nCMD npx prisma migrate deploy\n',
  );
  write(
    path.join(root, 'prisma/migration-governance.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        baseline: {
          id: 'v1-baseline',
          createdAt: '2026-07-15T00:00:00.000Z',
          frozenThrough: migrationName,
          migrationCount: 1,
          schemaSnapshot: 'prisma/baselines/v1-baseline/schema.prisma',
          schemaSha256: hash(schema),
          sqlSnapshot: 'prisma/baselines/v1-baseline/migration.sql',
          sqlSha256: hash(baselineSql),
        },
        frozenMigrations: [{ name: migrationName, sha256: hash(migrationSql) }],
        activeRelease: 'v1.1-next',
        releases: [
          {
            id: 'v1.1-next',
            status: 'OPEN',
            description: 'Fixture release',
            migrations: [],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  return { root, migrationName };
}

function run(root: string) {
  return spawnSync(process.execPath, [verifier, '--root', root], {
    encoding: 'utf8',
  });
}

describe('migration governance', () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length > 0) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  it('accepts an immutable registered baseline', () => {
    const fixture = createFixture();
    roots.push(fixture.root);
    const result = run(fixture.root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"status": "passed"');
  });

  it('blocks edits to a frozen migration', () => {
    const fixture = createFixture();
    roots.push(fixture.root);
    write(
      path.join(
        fixture.root,
        'prisma/migrations',
        fixture.migrationName,
        'migration.sql',
      ),
      'DROP TABLE example;\n',
    );
    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FROZEN_MIGRATION_CHANGED');
  });

  it('blocks an unregistered migration', () => {
    const fixture = createFixture();
    roots.push(fixture.root);
    write(
      path.join(
        fixture.root,
        'prisma/migrations/20260715210000_unregistered/migration.sql',
      ),
      'ALTER TABLE example ADD COLUMN value text;\n',
    );
    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('UNREGISTERED_MIGRATION');
  });

  it('requires release metadata and rollback plans', () => {
    const fixture = createFixture();
    roots.push(fixture.root);
    const name = '20260715210000_release_change';
    const sql = 'ALTER TABLE example ADD COLUMN value text;\n';
    write(
      path.join(fixture.root, 'prisma/migrations', name, 'migration.sql'),
      sql,
    );
    const manifestPath = path.join(
      fixture.root,
      'prisma/migration-governance.json',
    );
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.releases[0].migrations.push({ name, sha256: hash(sql) });
    write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('RELEASE_METADATA_MISSING');
  });

  it('blocks migrate dev in deployment entrypoints', () => {
    const fixture = createFixture();
    roots.push(fixture.root);
    write(
      path.join(fixture.root, 'Dockerfile'),
      'CMD npx prisma migrate dev\n',
    );
    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('MIGRATE_DEV_IN_DEPLOYMENT');
  });

  it('blocks CI without an isolated baseline execution gate', () => {
    const fixture = createFixture();
    roots.push(fixture.root);
    write(
      path.join(fixture.root, '.github/workflows/ci.yml'),
      'env: SHADOW_DATABASE_URL\nrun: pnpm run db:migrations:verify\nrun: pnpm exec prisma migrate deploy\nrun: pnpm run db:migrations:drift:check\n',
    );
    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CI_MIGRATION_GATE_MISSING');
  });
});
