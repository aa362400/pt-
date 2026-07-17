import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

describe('guarded migration deploy', () => {
  const script = join(
    process.cwd(),
    'scripts',
    'migrations',
    'deploy-guarded.mjs',
  );

  function check(databaseUrl: string, adminUrl: string) {
    return spawnSync(process.execPath, [script, '--check'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DATABASE_ADMIN_URL: adminUrl,
      },
    });
  }

  it('fails before Prisma when directUrl points at a different database', () => {
    const result = check(
      'postgresql://app:secret@127.0.0.1:54099/disposable',
      'postgresql://postgres:secret@127.0.0.1:5432/shopmate_codex',
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Migration target mismatch');
    expect(result.stderr).toContain('127.0.0.1:54099/disposable');
    expect(result.stderr).toContain('127.0.0.1:5432/shopmate_codex');
    expect(result.stdout).not.toContain('Applying migration');
  });

  it('accepts different credentials only when host, port, and database match', () => {
    const result = check(
      'postgresql://app:app-secret@postgres:5432/disposable',
      'postgresql://postgres:admin-secret@postgres:5432/disposable',
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      'Guarded migration target: postgres:5432/disposable',
    );
  });
});
