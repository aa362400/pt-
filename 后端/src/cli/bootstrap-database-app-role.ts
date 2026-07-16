import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const APP_ROLE = 'shopmate_app';

function readEnvValue(source: string, key: string): string | undefined {
  const line = source
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim();
}

function setEnvValue(source: string, key: string, value: string): string {
  const lines = source.split(/\r?\n/);
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) {
    lines[index] = `${key}=${value}`;
  } else {
    lines.push(`${key}=${value}`);
  }
  return lines.join('\n');
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function main() {
  const envPath = resolve(process.cwd(), '.env');
  const envSource = await readFile(envPath, 'utf8');
  const adminUrl =
    readEnvValue(envSource, 'DATABASE_ADMIN_URL') ??
    readEnvValue(envSource, 'DATABASE_URL');
  if (!adminUrl) throw new Error('DATABASE_URL is not configured');

  const password = randomBytes(36).toString('base64url');
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    const database = await admin.$queryRawUnsafe<Array<{ name: string }>>(
      'SELECT current_database() AS name',
    );
    const databaseName = database[0]?.name;
    if (!databaseName) throw new Error('Unable to resolve database name');

    const existing = await admin.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${sqlLiteral(APP_ROLE)}) AS exists`,
    );
    const roleOptions = `LOGIN PASSWORD ${sqlLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`;
    await admin.$executeRawUnsafe(
      existing[0]?.exists
        ? `ALTER ROLE ${sqlIdentifier(APP_ROLE)} WITH ${roleOptions}`
        : `CREATE ROLE ${sqlIdentifier(APP_ROLE)} WITH ${roleOptions}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT CONNECT ON DATABASE ${sqlIdentifier(databaseName)} TO ${sqlIdentifier(APP_ROLE)}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${sqlIdentifier(APP_ROLE)}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${sqlIdentifier(APP_ROLE)}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${sqlIdentifier(APP_ROLE)}`,
    );
    await admin.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${sqlIdentifier(APP_ROLE)}`,
    );
    await admin.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${sqlIdentifier(APP_ROLE)}`,
    );

    const appUrl = new URL(adminUrl);
    appUrl.username = APP_ROLE;
    appUrl.password = password;
    let updated = setEnvValue(envSource, 'DATABASE_ADMIN_URL', adminUrl);
    updated = setEnvValue(updated, 'DATABASE_URL', appUrl.toString());
    await writeFile(envPath, updated, { encoding: 'utf8', mode: 0o600 });
    process.stdout.write(
      `${JSON.stringify({ status: 'configured', role: APP_ROLE, superuser: false, bypassRls: false })}\n`,
    );
  } finally {
    await admin.$disconnect();
  }
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
