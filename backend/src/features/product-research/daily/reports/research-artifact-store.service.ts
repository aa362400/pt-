import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ResearchArtifactStoreService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(
      config.get<string>(
        'DAILY_PRODUCT_RESEARCH_ARTIFACT_DIR',
        resolve(tmpdir(), 'shopmate-agent-runtime', 'daily-product-research'),
      ),
    );
  }

  async write(input: {
    organizationId: string;
    runId: string;
    fileName: string;
    content: string;
  }) {
    const safeOrg = this.safeSegment(input.organizationId);
    const safeRun = this.safeSegment(input.runId);
    const safeName = this.safeFileName(input.fileName);
    const directory = resolve(this.root, safeOrg, safeRun);
    const target = resolve(directory, safeName);
    if (!target.startsWith(`${directory}${sep}`)) {
      throw new Error('Artifact path escaped its run directory');
    }
    await mkdir(directory, { recursive: true });
    await writeFile(target, input.content, { encoding: 'utf8', flag: 'w' });
    return {
      storageKey: target,
      contentHash: createHash('sha256')
        .update(input.content, 'utf8')
        .digest('hex'),
      byteSize: Buffer.byteLength(input.content, 'utf8'),
    };
  }

  async read(storageKey: string, expectedHash: string): Promise<string> {
    const target = resolve(storageKey);
    if (target !== this.root && !target.startsWith(`${this.root}${sep}`)) {
      throw new Error('Artifact path is outside the configured storage root');
    }
    const content = await readFile(target, 'utf8');
    const actualHash = createHash('sha256')
      .update(content, 'utf8')
      .digest('hex');
    if (actualHash !== expectedHash) {
      throw new Error('Artifact integrity verification failed');
    }
    return content;
  }

  private safeSegment(value: string): string {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
      throw new Error('Artifact path segment is invalid');
    }
    return value;
  }

  private safeFileName(value: string): string {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(value) || value.includes('..')) {
      throw new Error('Artifact filename is invalid');
    }
    return value;
  }
}
