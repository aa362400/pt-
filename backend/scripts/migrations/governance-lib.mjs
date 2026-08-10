import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const MIGRATION_NAME_PATTERN = /^\d{14}_[a-z0-9][a-z0-9_]*$/;

export function backendRootFromArgs(argv = process.argv.slice(2)) {
  const rootIndex = argv.indexOf('--root');
  if (rootIndex >= 0) {
    const value = argv[rootIndex + 1];
    if (!value) {
      throw new Error('--root requires a directory path');
    }
    return path.resolve(value);
  }
  return process.cwd();
}

export function resolveManifestPath(root) {
  return path.join(root, 'prisma', 'migration-governance.json');
}

export async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export async function sha256File(target) {
  const content = await readFile(target);
  return createHash('sha256').update(content).digest('hex');
}

export async function readJson(target) {
  return JSON.parse(await readFile(target, 'utf8'));
}

export async function listMigrations(root) {
  const migrationsRoot = path.join(root, 'prisma', 'migrations');
  const entries = await readdir(migrationsRoot, { withFileTypes: true });
  const migrations = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const migrationSql = path.join(migrationsRoot, entry.name, 'migration.sql');
    migrations.push({
      name: entry.name,
      directory: path.dirname(migrationSql),
      migrationSql,
      sha256: (await pathExists(migrationSql))
        ? await sha256File(migrationSql)
        : null,
    });
  }

  return migrations.sort((left, right) => left.name.localeCompare(right.name));
}

export function resolveStoredPath(root, storedPath) {
  return path.resolve(root, ...storedPath.split('/'));
}

export async function listFilesRecursively(target) {
  if (!(await pathExists(target))) return [];
  const entries = await readdir(target, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(target, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(absolute)));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

export function relativePortable(root, target) {
  return path.relative(root, target).split(path.sep).join('/');
}
