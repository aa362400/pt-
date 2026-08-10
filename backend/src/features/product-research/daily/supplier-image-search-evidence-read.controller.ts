import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../../shared/auth/jwt.strategy.js';
import {
  ListSupplierImageSearchEvidenceQueryDto,
  SupplierImageSearchEvidenceCandidateParamsDto,
  SupplierImageSearchEvidenceReadResponseDto,
} from './supplier-image-search-evidence-read.dto.js';
import { SupplierImageSearchEvidenceReadService } from './services/supplier-image-search-evidence-read.service.js';

@ApiTags('DailyProductResearch')
@ApiBearerAuth()
@Controller('daily-product-research')
export class SupplierImageSearchEvidenceReadController {
  constructor(
    private readonly evidenceRead: SupplierImageSearchEvidenceReadService,
  ) {}

  @Get('candidates/:candidateId/supplier-image-search-evidence')
  @ApiOperation({
    summary: 'List immutable 1688 image-search evidence for one candidate',
    description:
      'Read-only and tenant-bound. Offer prices are returned only as string-or-null DISPLAY_ONLY evidence; they are never currency-normalized or treated as verified procurement cost. An empty list means no stored observation and is not a fabricated NO_RESULTS result.',
  })
  @ApiOkResponse({
    type: SupplierImageSearchEvidenceReadResponseDto,
    description:
      'Newest immutable evidence first (fetchedAt desc, id desc), capped at 50. Does not call the supplier provider or write data.',
  })
  listForCandidate(
    @CurrentUser() user: JwtPayload,
    @Param() params: SupplierImageSearchEvidenceCandidateParamsDto,
    @Query() query: ListSupplierImageSearchEvidenceQueryDto,
  ) {
    return this.evidenceRead.listForCandidate(user, params.candidateId, query);
  }
}
