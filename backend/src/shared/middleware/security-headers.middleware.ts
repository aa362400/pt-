import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/**
 * Security headers middleware.
 *
 * Sets HTTP response headers that mitigate common web attacks:
 * - X-Content-Type-Options: prevents MIME type sniffing
 * - X-Frame-Options: prevents clickjacking
 * - X-XSS-Protection: enables browser XSS filter (legacy)
 * - Strict-Transport-Security: enforces HTTPS
 * - Referrer-Policy: controls referrer information leakage
 *
 * These headers complement the nginx-level security headers
 * (see /nginx/security-headers.conf) and ensure they are applied
 * even when the API is accessed directly (e.g., in dev/test).
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent the page from being rendered in an iframe (clickjacking protection)
    res.setHeader('X-Frame-Options', 'DENY');

    // Enable browser XSS filter (deprecated but still widely respected)
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Enforce HTTPS — 1 year including all subdomains
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );

    // Control referrer information sent with cross-origin requests
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    next();
  }
}
