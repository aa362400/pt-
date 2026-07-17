import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Headers,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { ListingsService } from './listings.service.js';
import {
  AttachListingRiskClearanceDto,
  GenerateListingDto,
  ListListingsQueryDto,
  UpdateListingDto,
} from './listings.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';

@ApiTags('Listings')
@ApiBearerAuth()
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate a listing draft with AI copywriting' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Stable 16-128 character key used to safely retry the same generation request.',
  })
  generate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateListingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'LISTING_IDEMPOTENCY_KEY_REQUIRED',
        message:
          'Idempotency-Key is required for listing generation so retries cannot create duplicate drafts.',
      });
    }
    return this.listingsService.generate(user, dto, idempotencyKey);
  }

  @Get()
  @ApiOperation({ summary: 'List listing drafts (workspace/status filters)' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListListingsQueryDto,
  ) {
    return this.listingsService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a listing draft' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.listingsService.findOne(user, id);
  }

  @Post(':id/risk-clearance')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({
    summary:
      'Verify and bind a signed risk clearance to the exact reviewed listing',
  })
  attachRiskClearance(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AttachListingRiskClearanceDto,
  ) {
    return this.listingsService.attachRiskClearance(user, id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a listing draft (incl. status)' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
  ) {
    return this.listingsService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a listing draft' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.listingsService.remove(user, id);
  }
}
