import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

function requiredDatabaseUrl(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for a guarded migration deploy`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL`);
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use the PostgreSQL protocol`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!parsed.hostname || !database) {
    throw new Error(`${name} must identify both a host and database`);
  }
  return {
    host: parsed.hostname.toLowerCase(),
    port: parsed.port || '5432',
    database,
  };
}

function targetKey(target) {
  return `${target.host}:${target.port}/${target.database}`;
}

export function assertMigrationUrlsMatch() {
  const runtime = requiredDatabaseUrl('DATABASE_URL');
  const direct = requiredDatabaseUrl('DATABASE_ADMIN_URL');
  const runtimeKey = targetKey(runtime);
  const directKey = targetKey(direct);
  if (runtimeKey !== directKey) {
    throw new Error(
      `Migration target mismatch: DATABASE_URL=${runtimeKey}, DATABASE_ADMIN_URL=${directKey}. ` +
        'Prisma migrate deploy follows the schema directUrl, so both variables must identify the exact same database.',
    );
  }
  return runtimeKey;
}

export function main(argv = process.argv.slice(2)) {
  const target = assertMigrationUrlsMatch();
  process.stdout.write(`Guarded migration target: ${target}\n`);
  if (argv.includes('--check')) return;

  const prismaCli = resolve('node_modules', 'prisma', 'build', 'index.js');
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

const invokedPath = process.argv[1]
  ? resolve(process.argv[1])
  : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
