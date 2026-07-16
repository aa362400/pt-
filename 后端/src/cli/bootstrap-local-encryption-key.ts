import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env');
const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
if (/^\s*ENCRYPTION_(?:KEY|KEYS)\s*=/m.test(existing)) {
  process.stdout.write(
    'Encryption configuration already exists; no local key was generated.\n',
  );
  process.exit(0);
}
if (process.env.NODE_ENV === 'production') {
  throw new Error('Local encryption-key bootstrap is forbidden in production');
}

const keyId = 'local-2026-07';
const secret = randomBytes(32).toString('base64url');
const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
const addition = [
  '',
  '# Local credential encryption keyring. Do not commit this file.',
  `ENCRYPTION_ACTIVE_KEY_ID=${keyId}`,
  `ENCRYPTION_KEYS=${JSON.stringify({ [keyId]: secret })}`,
  '',
].join('\n');
writeFileSync(envPath, `${existing}${separator}${addition}`, {
  encoding: 'utf8',
  mode: 0o600,
});
process.stdout.write(
  `Created local encryption keyring variables for key id ${keyId}; secret value was not printed.\n`,
);
