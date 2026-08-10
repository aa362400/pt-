import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SupplierImageSearchEvidenceCandidateParamsDto {
  @ApiProperty({ description: 'Tenant-bound product candidate identifier' })
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  candidateId: string;
}

export class ListSupplierImageSearchEvidenceQueryDto {
  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 50,
    description: 'Maximum immutable evidence records to return (hard cap: 50)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number;
}

export class SupplierImageSearchDisplayPriceReadDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Provider price text for display only; never a numeric or verified procurement cost',
  })
  price: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Provider consignment price text for display only; never a numeric cost',
  })
  consignPrice: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Provider tier-price text for display only; never a numeric cost',
  })
  multipleConsignPrice: string | null;

  @ApiProperty({
    enum: ['DISPLAY_ONLY'],
    description: 'Prices from image search are always DISPLAY_ONLY evidence',
  })
  evidenceUse: 'DISPLAY_ONLY';

  @ApiProperty({
    enum: [false],
    description:
      'Always false. This endpoint never promotes image-search text to procurement cost.',
  })
  verifiedProcurementCost: false;
}

export class SupplierImageSearchOfferReadDto {
  @ApiProperty()
  offerId: string;

  @ApiProperty({ type: String, nullable: true })
  subject: string | null;

  @ApiProperty({ type: String, nullable: true })
  detailUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty({ type: Boolean, nullable: true })
  distributionFreePostage: boolean | null;

  @ApiProperty({ type: SupplierImageSearchDisplayPriceReadDto })
  displayPriceEvidence: SupplierImageSearchDisplayPriceReadDto;
}

export class SupplierImageSearchCanonicalImageReadDto {
  @ApiProperty({ description: 'SHA-256 of the bounded raw provider snapshot' })
  rawSnapshotSha256: string;

  @ApiProperty()
  canonicalizationVersion: string;

  @ApiProperty()
  sourceOriginalSha256: string;

  @ApiProperty()
  sourceCanonicalSha256: string;

  @ApiProperty({ maximum: 3 * 1024 * 1024 })
  canonicalByteSize: number;

  @ApiProperty({ enum: ['image/png'] })
  canonicalMimeType: 'image/png';

  @ApiProperty()
  canonicalWidth: number;

  @ApiProperty()
  canonicalHeight: number;

  @ApiProperty({ enum: ['DHASH64'] })
  retrievalHashAlgorithm: 'DHASH64';

  @ApiProperty()
  retrievalHash: string;
}

export class SupplierImageSearchEvidenceReadItemDto {
  @ApiProperty()
  evidenceId: string;

  @ApiProperty({ enum: ['supplier-image-search/v1'] })
  sourceSchemaVersion: 'supplier-image-search/v1';

  @ApiProperty({ enum: ['MATCHES', 'NO_RESULTS'] })
  outcome: 'MATCHES' | 'NO_RESULTS';

  @ApiProperty()
  provider: string;

  @ApiProperty()
  adapterVersion: string;

  @ApiProperty()
  requestId: string;

  @ApiProperty({ format: 'date-time' })
  fetchedAt: string;

  @ApiProperty({ minimum: 0, maximum: 500 })
  providerResultCount: number;

  @ApiProperty({ type: SupplierImageSearchCanonicalImageReadDto })
  image: SupplierImageSearchCanonicalImageReadDto;

  @ApiProperty()
  contentCanonicalizerVersion: string;

  @ApiProperty()
  contentHash: string;

  @ApiProperty({
    type: [SupplierImageSearchOfferReadDto],
    description:
      'Normalized offers. Every price remains a string-or-null DISPLAY_ONLY observation.',
  })
  offers: SupplierImageSearchOfferReadDto[];
}

export class SupplierImageSearchEvidenceReadResponseDto {
  @ApiProperty({ enum: ['supplier-image-search-evidence-read/v1'] })
  schemaVersion: 'supplier-image-search-evidence-read/v1';

  @ApiProperty()
  candidateId: string;

  @ApiProperty({ minimum: 1, maximum: 50 })
  limit: number;

  @ApiProperty({ type: [SupplierImageSearchEvidenceReadItemDto] })
  items: SupplierImageSearchEvidenceReadItemDto[];
}
