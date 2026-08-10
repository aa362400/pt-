import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { StorageProvider } from './storage.service.js';

@Injectable()
export class S3StorageService implements StorageProvider {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor(private readonly configService: ConfigService) {
    const region = configService.get<string>('S3_REGION', 'us-east-1');
    this.bucket = configService.get<string>('S3_BUCKET', '');
    this.endpoint = configService.get<string>('S3_ENDPOINT', '');
    const accessKeyId = configService.get<string>('S3_ACCESS_KEY_ID', '');
    const secretAccessKey = configService.get<string>(
      'S3_SECRET_ACCESS_KEY',
      '',
    );

    if (!this.bucket) {
      this.logger.warn('S3_BUCKET is not set; S3 operations will fail');
    }

    this.s3Client = new S3Client({
      region,
      endpoint: this.endpoint || undefined,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // required for MinIO / S3-compatible non-AWS endpoints
    });

    this.logger.log(
      `S3StorageService initialised — bucket: ${this.bucket}, endpoint: ${this.endpoint || 'default AWS'}`,
    );
  }

  async upload(file: Buffer, key: string, mimeType: string): Promise<string> {
    this.logger.debug(`Uploading ${key} (${mimeType}, ${file.length} bytes)`);

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file,
        ContentType: mimeType,
      });
      await this.s3Client.send(command);
      this.logger.log(`Uploaded ${key}`);
      return key;
    } catch (error) {
      this.logger.error(
        `Failed to upload ${key}`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async download(key: string): Promise<Buffer> {
    this.logger.debug(`Downloading ${key}`);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const response = await this.s3Client.send(command);

      const chunks: Buffer[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error(
        `Failed to download ${key}`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    this.logger.debug(`Deleting ${key}`);

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.s3Client.send(command);
      this.logger.log(`Deleted ${key}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete ${key}`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  getUrl(key: string): string {
    const baseEndpoint = this.endpoint.replace(/\/+$/, '');
    const bucket = this.bucket;
    return `${baseEndpoint}/${bucket}/${key}`;
  }
}
