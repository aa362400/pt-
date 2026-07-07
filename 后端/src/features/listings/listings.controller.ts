import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ListingsService } from './listings.service.js';
import {
  GenerateListingDto,
  ListListingsQueryDto,
  UpdateListingDto,
} from './listings.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('Listings')
@ApiBearerAuth()
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate a listing draft with AI copywriting' })
  generate(@CurrentUser() user: JwtPayload, @Body() dto: GenerateListingDto) {
    return this.listingsService.generate(user, dto);
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
