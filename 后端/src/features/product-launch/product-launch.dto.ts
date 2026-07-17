import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export const PRODUCT_PREPARATION_MODES = [
  'CREATIVE_ONLY',
  'PUBLISH_READY',
] as const;
export type ProductPreparationMode = (typeof PRODUCT_PREPARATION_MODES)[number];

export class ConfirmProductLaunchDto {
  @ApiProperty({
    description: 'Candidate ID returned by the product research report',
  })
  @IsString()
  candidateId: string;

  @ApiPropertyOptional({
    enum: PRODUCT_PREPARATION_MODES,
    description:
      'CREATIVE_ONLY generates local images and a non-publishable listing draft without economics proof. PUBLISH_READY keeps the full economics and risk gates.',
    default: 'PUBLISH_READY',
  })
  @IsIn(PRODUCT_PREPARATION_MODES)
  @IsOptional()
  preparationMode?: ProductPreparationMode;

  @ApiPropertyOptional({
    description:
      'Required for a daily research candidate. Identifies the exact VERIFIED/PASS economics evaluation used for listing price and publication.',
  })
  @IsString()
  @IsOptional()
  economicsEvaluationId?: string;

  @ApiPropertyOptional({
    description:
      'Required with economicsEvaluationId for a daily research candidate. SHA-256 of the immutable evaluation payload.',
  })
  @Matches(/^[a-f0-9]{64}$/)
  @IsOptional()
  economicsEvaluationHash?: string;

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
      'Organization-owned PRODUCT_IMAGE asset CUID used as the immutable visual reference.',
  })
  @Matches(/^c[a-z0-9]{24}$/, {
    message: 'referenceAssetId must be a Prisma CUID',
  })
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
