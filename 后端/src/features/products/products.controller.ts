import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service.js';
import {
  CreateProductDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './products.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { QuotaResource } from '../../shared/decorators/quota.decorator.js';
import { QuotaGuard } from '../../shared/guards/quota.guard.js';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(QuotaGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @QuotaResource('products')
  @ApiOperation({ summary: 'Create a product in a workspace' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProductDto) {
    return this.productsService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List products (filter by workspace/status/search)' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListProductsQueryDto,
  ) {
    return this.productsService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product (org-scoped)' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.productsService.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product (org-scoped)' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a product (org-scoped)' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.productsService.remove(user, id);
  }
}
