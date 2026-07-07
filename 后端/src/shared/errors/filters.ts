import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';

interface ErrorBodyShape {
  code?: string;
  message?: string;
}

interface RequestWithId extends Request {
  requestId?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    const requestId = request.requestId ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseBody = exception.getResponse();

      if (typeof responseBody === 'object' && responseBody !== null) {
        const body = responseBody as ErrorBodyShape;
        if (typeof body.code === 'string') {
          code = body.code;
        } else {
          code = this.getDefaultCode(status);
        }
        message = body.message ?? exception.message;
      } else if (typeof responseBody === 'string') {
        message = responseBody;
        code = this.getDefaultCode(status);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // In production, don't leak error details for 500s
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    if (status === HttpStatus.INTERNAL_SERVER_ERROR && isProduction) {
      message = 'An unexpected error occurred';
    }

    const errorPayload: {
      code: string;
      message: string;
      stack?: string;
    } = { code, message };

    if (exception instanceof Error && !isProduction) {
      errorPayload.stack = exception.stack;
    }

    response.status(status).json({
      error: errorPayload,
      requestId,
    });
  }

  private getDefaultCode(status: HttpStatus): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'VALIDATION_FAILED';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMIT_EXCEEDED';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
