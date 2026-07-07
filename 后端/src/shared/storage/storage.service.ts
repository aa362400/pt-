import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface StorageProvider {
  upload(file: Buffer, key: string, mimeType: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}

@Injectable()
export class LocalStorageService implements StorageProvider {
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.uploadDir = path.resolve(
      this.configService.get<string>('LOCAL_STORAGE_PATH', './uploads'),
    );
    this.baseUrl = this.configService.get<string>(
      'LOCAL_STORAGE_BASE_URL',
      '/uploads',
    );
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /** Resolves a storage key inside uploadDir, rejecting path traversal. */
  private resolveKey(key: string): string {
    const filePath = path.resolve(this.uploadDir, key);
    if (
      filePath !== this.uploadDir &&
      !filePath.startsWith(this.uploadDir + path.sep)
    ) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return filePath;
  }

  async upload(file: Buffer, key: string, _mimeType: string): Promise<string> {
    const filePath = this.resolveKey(key);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.writeFile(filePath, file);
    return key;
  }

  async download(key: string): Promise<Buffer> {
    return fs.promises.readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolveKey(key);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  getUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}

// Token for dependency injection
export const STORAGE_PROVIDER_TOKEN = 'STORAGE_PROVIDER';
