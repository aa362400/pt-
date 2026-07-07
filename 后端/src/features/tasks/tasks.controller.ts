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
import { TasksService } from './tasks.service.js';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from './tasks.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a team task' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List team tasks (status/assignee filters)' })
  findAll(@CurrentUser() user: JwtPayload, @Query() query: ListTasksQueryDto) {
    return this.tasksService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a team task' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tasksService.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a team task (incl. status transitions)' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a team task' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tasksService.remove(user, id);
  }
}
