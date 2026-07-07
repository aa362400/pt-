import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const PLANS = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;

export class UpdatePlanDto {
  @ApiProperty({ enum: PLANS })
  @IsIn(PLANS)
  plan: string;
}

export class BillingUsageDto {
  @ApiProperty()
  products: number;
  @ApiProperty()
  listings: number;
  @ApiProperty()
  agentRuns: number;
  @ApiProperty()
  teamMembers: number;
  @ApiProperty()
  storageFiles: number;
  @ApiProperty()
  workspaces: number;
}

export class PlanInfoDto {
  @ApiProperty()
  name: string;
  @ApiProperty()
  description: string;
  @ApiProperty()
  monthlyPrice: number;
  @ApiProperty({ type: [String] })
  features: string[];
}
