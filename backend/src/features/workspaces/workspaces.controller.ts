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
import { WorkspacesService } from './workspaces.service.js';
import {
  CreateWorkspaceDto,
  ListWorkspacesQueryDto,
  UpdateWorkspaceDto,
} from './workspaces.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { QuotaResource } from '../../shared/decorators/quota.decorator.js';
import { QuotaGuard } from '../../shared/guards/quota.guard.js';

@ApiTags('Workspaces')
@ApiBearerAuth()
@UseGuards(QuotaGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  @Roles('OWNER', 'ADMIN')
  @QuotaResource('workspaces')
  @ApiOperation({ summary: 'Create a workspace (owner/admin)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateWorkspaceDto) {
    return this.workspacesService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List workspaces of the current organization' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListWorkspacesQueryDto,
  ) {
    return this.workspacesService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a workspace (org-scoped)' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.workspacesService.findOne(user, id);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Update a workspace (owner/admin)' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Delete a workspace and all its data (owner)' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.workspacesService.remove(user, id);
  }
}
