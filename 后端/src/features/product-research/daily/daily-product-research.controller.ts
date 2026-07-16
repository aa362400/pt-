import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../../shared/auth/jwt.strategy.js';
import { Roles } from '../../../shared/rbac/roles.decorator.js';
import {
  CandidateDecisionDto,
  CreateProductFeedbackDto,
  CreateScoringVersionDto,
  ListDailyCandidatesQueryDto,
  ListDailyResearchRunsQueryDto,
  ManualDailyResearchRunDto,
  ProductFeedbackSummaryQueryDto,
  ScoringVersionActionDto,
  UpdateDailyResearchScheduleDto,
} from './daily-product-research.dto.js';
import { DailyProductResearchService } from './daily-product-research.service.js';
import { ProductResearchFeedbackService } from './services/feedback/product-research-feedback.service.js';

@ApiTags('DailyProductResearch')
@ApiBearerAuth()
@Controller('daily-product-research')
export class DailyProductResearchController {
  constructor(
    private readonly service: DailyProductResearchService,
    private readonly feedback: ProductResearchFeedbackService,
  ) {}

  @Post('runs/manual')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({
    summary: 'Create or reuse an evidence-first daily research run',
  })
  manualRun(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ManualDailyResearchRunDto,
  ) {
    return this.service.manualRun(user, dto);
  }

  @Get('runs')
  listRuns(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListDailyResearchRunsQueryDto,
  ) {
    return this.service.listRuns(user, query);
  }

  @Get('runs/:id/candidates')
  listCandidates(
    @CurrentUser() user: JwtPayload,
    @Param('id') runId: string,
    @Query() query: ListDailyCandidatesQueryDto,
  ) {
    return this.service.listCandidates(user, runId, query);
  }

  @Get('runs/:id/source-health')
  sourceHealth(@CurrentUser() user: JwtPayload, @Param('id') runId: string) {
    return this.service.getSourceHealth(user, runId);
  }

  @Get('runs/:id/artifacts')
  artifacts(@CurrentUser() user: JwtPayload, @Param('id') runId: string) {
    return this.service.listArtifacts(user, runId);
  }

  @Get('runs/:id/artifacts/:artifactId')
  artifact(
    @CurrentUser() user: JwtPayload,
    @Param('id') runId: string,
    @Param('artifactId') artifactId: string,
  ) {
    return this.service.getArtifact(user, runId, artifactId);
  }

  @Post('runs/:id/cancel')
  cancel(@CurrentUser() user: JwtPayload, @Param('id') runId: string) {
    return this.service.cancelRun(user, runId);
  }

  @Get('runs/:id')
  getRun(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.getRun(user, id);
  }

  @Get('candidates/:id')
  getCandidate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.getCandidate(user, id);
  }

  @Post('candidates/:id/feedback')
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  createFeedback(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateProductFeedbackDto,
  ) {
    return this.feedback.createFeedback(user, id, dto);
  }

  @Get('candidates/:id/performance')
  candidatePerformance(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.feedback.getPerformance(user, id);
  }

  @Get('feedback/summary')
  feedbackSummary(
    @CurrentUser() user: JwtPayload,
    @Query() query: ProductFeedbackSummaryQueryDto,
  ) {
    return this.feedback.getSummary(user, query);
  }

  @Post('candidates/:id/approve-development')
  approveForDevelopment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CandidateDecisionDto,
  ) {
    return this.service.approveForDevelopment(user, id, dto);
  }

  @Post('candidates/:id/reject')
  rejectCandidate(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CandidateDecisionDto,
  ) {
    return this.service.rejectCandidate(user, id, dto);
  }

  @Get('scoring-versions')
  listScoringVersions(
    @CurrentUser() user: JwtPayload,
    @Query('workspaceId') workspaceId?: string,
  ) {
    return this.service.listScoringVersions(user, workspaceId);
  }

  @Post('scoring-versions')
  @Roles('OWNER', 'ADMIN')
  createScoringVersion(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateScoringVersionDto,
  ) {
    return this.service.createScoringVersion(user, dto);
  }

  @Post('scoring-versions/:id/activate')
  @Roles('OWNER', 'ADMIN')
  activateScoringVersion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ScoringVersionActionDto,
  ) {
    return this.service.activateScoringVersion(user, id, dto);
  }

  @Post('scoring-versions/:id/rollback')
  @Roles('OWNER', 'ADMIN')
  rollbackScoringVersion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ScoringVersionActionDto,
  ) {
    return this.service.rollbackScoringVersion(user, id, dto);
  }

  @Get('schedule')
  getSchedule(
    @CurrentUser() user: JwtPayload,
    @Query('workspaceId') workspaceId?: string,
  ) {
    return this.service.getSchedule(user, workspaceId);
  }

  @Put('schedule')
  @Roles('OWNER', 'ADMIN')
  updateSchedule(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateDailyResearchScheduleDto,
  ) {
    return this.service.updateSchedule(user, dto);
  }
}
