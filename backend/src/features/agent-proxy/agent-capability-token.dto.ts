import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class IssueAgentCapabilityTokenDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @IsString({ each: true })
  actions: string[];

  @ApiProperty({ minimum: 60, maximum: 3600, default: 300 })
  @IsInt()
  @Min(60)
  @Max(3600)
  ttlSeconds: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}
