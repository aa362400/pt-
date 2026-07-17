import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class OrganizationAgentControlCommandDto {
  @ApiPropertyOptional({
    description:
      'Optional compare-and-set revision. A stale value returns HTTP 409.',
    minimum: 0,
    maximum: 2_147_483_647,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  @IsOptional()
  expectedRevision?: number;

  @ApiPropertyOptional({
    description: 'Operator reason retained with the durable control request.',
    maxLength: 500,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}
