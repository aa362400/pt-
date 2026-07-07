import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReviewService } from './review.service.js';
import {
  CreateReviewTaskDto,
  ReviewListQueryDto,
  UpdateReviewDto,
} from './review.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('Review')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('review')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a review task (manual)' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateReviewTaskDto,
  ) {
    return this.reviewService.createFromAgentRun(user.orgId!, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List review tasks (filter by status/entityType/page)' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ReviewListQueryDto,
  ) {
    return this.reviewService.findAll(user, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get review statistics for the organization' })
  getStats(@CurrentUser() user: JwtPayload) {
    return this.reviewService.getStats(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a review task by ID' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.reviewService.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Approve, reject, or request rework on a review task' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewService.update(user, id, dto);
  }
}
