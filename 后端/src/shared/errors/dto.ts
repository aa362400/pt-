import { ApiProperty } from '@nestjs/swagger';

export class ErrorDetailDto {
  @ApiProperty({ description: 'Error code string' })
  code: string;

  @ApiProperty({ description: 'Human-readable error message' })
  message: string;

  @ApiProperty({
    required: false,
    description: 'Optional stack trace (dev only)',
  })
  stack?: string;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorDetailDto })
  error: ErrorDetailDto;

  @ApiProperty({ description: 'Unique request identifier for tracing' })
  requestId: string;
}
