import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateImagePromptDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  prompt?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  workspaceId?: string;
}

export class UpdateImagePromptDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(2)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  prompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  settings?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  status?: 'DRAFT' | 'GENERATING' | 'COMPLETED' | 'FAILED';
}

export class ImagePromptResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  prompt?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
