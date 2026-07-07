import { Module } from '@nestjs/common';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { FileValidatorService } from '../../shared/storage/file-validator.service.js';

@Module({
  controllers: [FilesController],
  providers: [FilesService, FileValidatorService],
  exports: [FilesService],
})
export class FilesModule {}
