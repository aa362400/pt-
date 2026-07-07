import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DashboardParamsDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;
}
