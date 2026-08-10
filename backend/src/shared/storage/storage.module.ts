import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LocalStorageService,
  STORAGE_PROVIDER_TOKEN,
  StorageProvider,
} from './storage.service.js';
import { S3StorageService } from './s3-storage.service.js';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER_TOKEN,
      useFactory: (configService: ConfigService): StorageProvider => {
        const provider = configService.get<string>('STORAGE_PROVIDER', 'local');
        switch (provider) {
          case 's3':
            return new S3StorageService(configService);
          case 'local':
          default:
            return new LocalStorageService(configService);
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [STORAGE_PROVIDER_TOKEN],
})
export class StorageModule {}
