import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { FilesService } from './files.service.js';
import { ListFilesQueryDto, UploadFileDto } from './files.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  STORAGE_PROVIDER_TOKEN,
  type StorageProvider,
} from '../../shared/storage/storage.service.js';
import { Inject } from '@nestjs/common';

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    @Inject(STORAGE_PROVIDER_TOKEN)
    private readonly storage: StorageProvider,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Upload a file (base64 payload, org-scoped)' })
  upload(@CurrentUser() user: JwtPayload, @Body() dto: UploadFileDto) {
    return this.filesService.upload(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List file assets of the current organization' })
  findAll(@CurrentUser() user: JwtPayload, @Query() query: ListFilesQueryDto) {
    return this.filesService.findAll(user, query);
  }

  @Get(':id/download')
  @ApiOperation({
    summary: 'Download a file asset (authenticated, org-scoped)',
  })
  async download(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const asset = await this.filesService.getOwned(user, id);
    const buffer = await this.storage.download(asset.storageKey);
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(asset.filename)}"`,
    );
    res.send(buffer);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a file asset (org-scoped)' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.filesService.remove(user, id);
  }
}
