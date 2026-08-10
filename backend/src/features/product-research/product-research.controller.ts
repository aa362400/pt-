import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProductResearchService } from './product-research.service.js';
import {
  ApproveResearchCandidateDto,
  CreateResearchReportDto,
  ListResearchCandidatesQueryDto,
  ListResearchReportsQueryDto,
  RejectResearchCandidateDto,
} from './product-research.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('ProductResearch')
@ApiBearerAuth()
@Controller('product-research')
export class ProductResearchController {
  constructor(
    private readonly productResearchService: ProductResearchService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Run product research and persist the report' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateResearchReportDto,
  ) {
    return this.productResearchService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List research reports' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListResearchReportsQueryDto,
  ) {
    return this.productResearchService.findAll(user, query);
  }

  @Get('candidates')
  @ApiOperation({
    summary: 'List agent-selected product candidates pending approval',
  })
  findCandidates(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListResearchCandidatesQueryDto,
  ) {
    return this.productResearchService.findCandidates(user, query);
  }

  @Post('candidates/:candidateId/review')
  @ApiOperation({
    summary: 'Create or reuse the human review task for a pending candidate',
  })
  ensureCandidateReview(
    @CurrentUser() user: JwtPayload,
    @Param('candidateId') candidateId: string,
  ) {
    return this.productResearchService.ensureCandidateReview(user, candidateId);
  }

  @Post('candidates/:candidateId/approve')
  @ApiOperation({
    summary: 'Approve an agent-selected product candidate into products',
  })
  approveCandidate(
    @CurrentUser() user: JwtPayload,
    @Param('candidateId') candidateId: string,
    @Body() dto: ApproveResearchCandidateDto,
  ) {
    return this.productResearchService.approveCandidate(user, candidateId, dto);
  }

  @Post('candidates/:candidateId/reject')
  @ApiOperation({
    summary:
      'Reject an agent-selected product candidate and record the learning reason',
  })
  rejectCandidate(
    @CurrentUser() user: JwtPayload,
    @Param('candidateId') candidateId: string,
    @Body() dto: RejectResearchCandidateDto,
  ) {
    return this.productResearchService.rejectCandidate(user, candidateId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a research report' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.productResearchService.findOne(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a research report' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.productResearchService.remove(user, id);
  }
}
