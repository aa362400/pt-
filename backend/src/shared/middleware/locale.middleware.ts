import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

interface RequestWithLocale extends Request {
  locale?: string;
}

/**
 * Reads the X-Locale header from the frontend and attaches it to `req.locale`.
 * Registered globally via AppModule so all controllers can access it.
 */
@Injectable()
export class LocaleMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const locale = req.headers['x-locale'] as string | undefined;
    if (locale) {
      (req as RequestWithLocale).locale = locale;
    }
    next();
  }
}
