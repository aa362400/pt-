import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

describe('e2e pipeline smoke release gate', () => {
  it('runs dry channels to the publish approval gate without publishing', () => {
    const temporaryDirectory = mkdtempSync(
      join(tmpdir(), 'shopmate-e2e-smoke-'),
    );
    const output = join(temporaryDirectory, 'evidence.json');
    try {
      execFileSync(
        process.execPath,
        [
          resolve(process.cwd(), 'scripts/e2e-pipeline-smoke.mjs'),
          '--dry-channels',
          '--output',
          output,
        ],
        { cwd: process.cwd(), stdio: 'pipe' },
      );

      const evidence = JSON.parse(readFileSync(output, 'utf8')) as {
        status: string;
        mode: string;
        safety: {
          externalPublishAttempted: boolean;
          stoppedAt: string;
        };
        stages: Array<{ status: string; errorCode: string | null }>;
      };
      expect(evidence.status).toBe('PASSED');
      expect(evidence.mode).toBe('dry-channels');
      expect(evidence.safety).toEqual({
        externalPublishAttempted: false,
        stoppedAt: 'AWAITING_PUBLISH_APPROVAL',
      });
      expect(evidence.stages).toHaveLength(7);
      expect(evidence.stages.every((stage) => stage.status === 'PASSED')).toBe(
        true,
      );
      expect(evidence.stages.every((stage) => stage.errorCode === null)).toBe(
        true,
      );
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('maps the real HTTP flow but never calls the publish endpoint', async () => {
    const temporaryDirectory = mkdtempSync(
      join(tmpdir(), 'shopmate-e2e-http-smoke-'),
    );
    const output = join(temporaryDirectory, 'evidence.json');
    const requestLog = join(temporaryDirectory, 'requests.log');
    let server: ChildProcess | null = null;
    try {
      server = spawn(
        process.execPath,
        [resolve(process.cwd(), 'test/fixtures/e2e-pipeline-smoke-server.mjs')],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            E2E_SMOKE_TEST_REQUEST_LOG: requestLog,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      const port = await new Promise<number>((resolvePort, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('mock smoke server did not start')),
          5_000,
        );
        server!.once('error', reject);
        server!.stdout!.once('data', (chunk) => {
          const match = /PORT:(\d+)/.exec(String(chunk));
          if (!match)
            return reject(new Error(`unexpected server output: ${chunk}`));
          clearTimeout(timeout);
          resolvePort(Number(match[1]));
        });
      });

      execFileSync(
        process.execPath,
        [
          resolve(process.cwd(), 'scripts/e2e-pipeline-smoke.mjs'),
          '--base-url',
          `http://127.0.0.1:${port}/api/v1`,
          '--poll-ms',
          '50',
          '--timeout-ms',
          '2000',
          '--output',
          output,
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            E2E_SMOKE_EMAIL: 'owner@example.test',
            E2E_SMOKE_PASSWORD: 'not-a-real-secret',
          },
          stdio: 'pipe',
        },
      );

      const evidence = JSON.parse(readFileSync(output, 'utf8')) as {
        status: string;
        mode: string;
        safety: { externalPublishAttempted: boolean; stoppedAt: string };
      };
      const requests = readFileSync(requestLog, 'utf8');
      expect(evidence.status).toBe('PASSED');
      expect(evidence.mode).toBe('real');
      expect(evidence.safety.externalPublishAttempted).toBe(false);
      expect(evidence.safety.stoppedAt).toBe('AWAITING_PUBLISH_APPROVAL');
      expect(requests).toContain(
        'POST /api/v1/review/mock-review-task/product-launch',
      );
      expect(requests).not.toMatch(/\/publish(?:\?|\s|$)/);
    } finally {
      server?.kill();
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
