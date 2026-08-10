import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { FilePurpose } from '@prisma/client';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export const FILE_PURPOSES = [
  'PRODUCT_IMAGE',
  'KNOWLEDGE_DOC',
  'LISTING_IMAGE',
  'BRAND_ASSET',
  'REPORT_EXPORT',
  'AVATAR',
  'OTHER',
] as const;

export class UploadFileDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  filename: string;

  @ApiProperty({ example: 'image/png' })
  @IsString()
  @MaxLength(100)
  mimeType: string;

  @ApiProperty({ description: 'File content as base64 (raw or data URL)' })
  @IsString()
  dataBase64: string;

  @ApiProperty({ enum: FILE_PURPOSES })
  @IsIn(FILE_PURPOSES)
  purpose: FilePurpose;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;
}

export class ListFilesQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: FILE_PURPOSES })
  @IsIn(FILE_PURPOSES)
  @IsOptional()
  purpose?: FilePurpose;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;
}
