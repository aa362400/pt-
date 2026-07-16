import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class LaunchEnterpriseObjectiveDto {
  @ApiProperty({ description: 'Enterprise operating objective' })
  @IsString()
  @MinLength(8)
  goal: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 9 })
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  @IsOptional()
  specialistIds?: string[];
}
