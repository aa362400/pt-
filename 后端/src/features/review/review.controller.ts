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
  UpdateManualPricingDto,
  UpdateReviewDto,
} from './review.dto.js';
import {
  ConfirmProductLaunchDto,
  ConfirmProductPublishDto,
} from '../product-launch/product-launch.dto.js';
import { ProductLaunchService } from '../product-launch/product-launch.service.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';

@ApiTags('Review')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('review')
export class ReviewController {
  constructor(
    private readonly reviewService: ReviewService,
    private readonly productLaunchService: ProductLaunchService,
  ) {}

  @Post()
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a review task (manual)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateReviewTaskDto) {
    return this.reviewService.createFromAgentRun(user.orgId!, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List review tasks (filter by status/entityType/page)',
  })
  findAll(@CurrentUser() user: JwtPayload, @Query() query: ReviewListQueryDto) {
    return this.reviewService.findAll(user, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get review statistics for the organization' })
  getStats(@CurrentUser() user: JwtPayload) {
    return this.reviewService.getStats(user);
  }

  @Post('product-launch/:launchId/publish')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({
    summary:
      'Separately confirm publishing the exact approved listing hash to Ozon',
  })
  confirmProductPublish(
    @CurrentUser() user: JwtPayload,
    @Param('launchId') launchId: string,
    @Body() dto: ConfirmProductPublishDto,
  ) {
    return this.productLaunchService.confirmPublish(user, launchId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a review task by ID' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.reviewService.findOne(user, id);
  }

  @Patch(':id/manual-pricing')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({
    summary:
      'Save or submit human-entered pricing and risk evidence without approving or publishing',
  })
  updateManualPricing(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateManualPricingDto,
  ) {
    return this.reviewService.updateManualPricing(user, id, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({
    summary: 'Approve, reject, or request rework on a review task',
  })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewService.update(user, id, dto);
  }

  @Post(':id/product-launch')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({
    summary:
      'Approve local image and listing preparation for a research candidate',
  })
  confirmProductLaunch(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ConfirmProductLaunchDto,
  ) {
    return this.productLaunchService.confirm(user, id, dto);
  }
}
