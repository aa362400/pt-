import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class ConfirmProductLaunchDto {
  @ApiProperty({
    description: 'Candidate ID returned by the product research report',
  })
  @IsString()
  candidateId: string;

  @ApiProperty({
    description:
      'Must be true. This approves local image and listing preparation only; it does not authorize an Ozon write.',
    example: true,
  })
  @IsBoolean()
  @Equals(true, {
    message:
      'An explicit confirmation is required before generating local assets',
  })
  confirmImageGeneration: true;

  @ApiPropertyOptional({ description: 'Workspace that owns the product draft' })
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiProperty({
    description:
      'Organization-owned PRODUCT_IMAGE asset used as the immutable visual reference.',
  })
  @IsUUID()
  referenceAssetId: string;

  @ApiPropertyOptional({
    type: Object,
    description:
      'Ozon import data. The worker validates it again before any Ozon write is attempted.',
  })
  @IsObject()
  @IsOptional()
  ozonPublication?: Record<string, unknown>;
}

export class ConfirmProductPublishDto {
  @ApiProperty({
    description:
      'Must be true. Records a separate approval to publish the exact reviewed listing hash to Ozon.',
    example: true,
  })
  @IsBoolean()
  @Equals(true, {
    message:
      'A separate explicit confirmation is required before publishing to Ozon',
  })
  confirmPublish: true;
}
