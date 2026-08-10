import { IsArray, IsString, Length, MinLength } from 'class-validator';

export class ApproveJudgeGoldDto {
  @IsString()
  @Length(64, 64)
  datasetHash!: string;

  @IsString()
  @Length(64, 64)
  reportHash!: string;

  @IsArray()
  @IsString({ each: true })
  reviewedCaseIds!: string[];

  @IsString()
  @MinLength(10)
  reason!: string;

  @IsString()
  confirmation!: string;
}

export class RevokeJudgeGoldDto {
  @IsString()
  @MinLength(10)
  reason!: string;

  @IsString()
  confirmation!: string;
}
