import { HttpException, HttpStatus } from '@nestjs/common';

export class BusinessException extends HttpException {
  public readonly errorCode: string;

  constructor(
    errorCode: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code: errorCode, message }, status);
    this.errorCode = errorCode;
  }
}

export class NotFoundException extends BusinessException {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} with id "${id}" not found`
      : `${resource} not found`;
    super(`${resource.toUpperCase()}_NOT_FOUND`, message, HttpStatus.NOT_FOUND);
  }
}

export class UnauthorizedException extends BusinessException {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenException extends BusinessException {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }
}

export class ValidationFailedException extends BusinessException {
  constructor(message: string) {
    super('VALIDATION_FAILED', message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

export class ConflictException extends BusinessException {
  constructor(resource: string, field?: string) {
    const message = field
      ? `${resource} with this ${field} already exists`
      : `${resource} already exists`;
    super(`${resource.toUpperCase()}_CONFLICT`, message, HttpStatus.CONFLICT);
  }
}

export class RateLimitException extends BusinessException {
  constructor(message = 'Too many requests, please try again later') {
    super('RATE_LIMIT_EXCEEDED', message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
