import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateAgentAutonomyModeDto {
  @ApiProperty({
    description: 'Enable automatic research and local Listing draft creation',
  })
  @IsBoolean()
  autoResearchAndDraftEnabled: boolean;
}

export class UpdateAgentAutonomyPolicyDto {
  @ApiProperty({ enum: ['organization', 'user'], default: 'organization' })
  @IsIn(['organization', 'user'])
  scope: 'organization' | 'user';

  @ApiProperty({ required: false, description: 'Required for user scope' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  targetUserId?: string;

  @ApiProperty({ minimum: 0, maximum: 4 })
  @IsInt()
  @Min(0)
  @Max(4)
  level: number;

  @ApiProperty({ type: [String], default: [] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  allowedTools: string[];

  @ApiProperty({ type: [String], default: [] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  deniedTools: string[];

  @ApiProperty({ default: true })
  @IsBoolean()
  highRiskApproval: boolean;
}
