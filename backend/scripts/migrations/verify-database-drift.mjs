import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { backendRootFromArgs } from './governance-lib.mjs';

const argv = process.argv.slice(2);
const schemaIndex = argv.indexOf('--schema');
const migrationsIndex = argv.indexOf('--migrations');
const root = backendRootFromArgs(argv);
const schema = path.resolve(
  root,
  schemaIndex >= 0 ? argv[schemaIndex + 1] : 'prisma/schema.prisma',
);
const migrations = path.resolve(
  root,
  migrationsIndex >= 0 ? argv[migrationsIndex + 1] : 'prisma/migrations',
);
const require = createRequire(import.meta.url);
const prismaCli = require.resolve('prisma/build/index.js');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for database drift verification');
}
if (!process.env.SHADOW_DATABASE_URL) {
  throw new Error(
    'SHADOW_DATABASE_URL is required to compare the target database with migration history',
  );
}

const result = spawnSync(
  process.execPath,
  [
    prismaCli,
    'migrate',
    'diff',
    '--from-schema-datasource',
    schema,
    '--to-migrations',
    migrations,
    '--shadow-database-url',
    process.env.SHADOW_DATABASE_URL,
    '--exit-code',
  ],
  {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
if (result.status === 2) {
  console.error(
    'Database schema drift from the registered migration history was detected. Deployment is blocked.',
  );
  process.exit(1);
}
process.exit(result.status ?? 1);
