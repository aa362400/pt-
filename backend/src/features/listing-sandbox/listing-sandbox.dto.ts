import { IsString, MinLength } from 'class-validator';

export class EvaluateListingSandboxDto {
  @IsString()
  @MinLength(1)
  snapshotId!: string;
}

export class OverrideListingSandboxDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}
