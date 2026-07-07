import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Auth-specific throttle guard with stricter limits.
 *
 * Applies a tighter rate limit (10 req/min per IP) to authentication
 * endpoints to mitigate brute-force and credential-stuffing attacks.
 *
 * Usage:
 * ```typescript
 * @UseGuards(AuthThrottleGuard)
 * @Post('login')
 * async login(@Body() dto: LoginDto) { ... }
 * ```
 *
 * The per-endpoint @Throttle() decorators on the AuthController
 * already provide granular limits per route:
 *   - register:           5 req/min
 *   - login:             10 req/min
 *   - refresh:           20 req/min
 *   - forgot-password:    5 req/min
 *   - reset-password:     5 req/min
 *   - send-verification:  3 req/min
 *   - verify-email:       5 req/min
 *
 * This guard can be applied as a class-level guard for all auth routes
 * when a uniform baseline is preferred over per-route decorators.
 */
@Injectable()
export class AuthThrottleGuard extends ThrottlerGuard {
  /**
   * Override the default limit for auth endpoints.
   * Limit: 10 requests per 60 seconds.
   */
  protected readonly limit = 10;
  protected readonly ttl = 60_000;
}
