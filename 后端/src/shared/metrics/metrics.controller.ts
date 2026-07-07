import { Controller, Get, Res } from '@nestjs/common';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';

/**
 * Custom Prometheus controller so the scrape endpoint is exempt from the
 * global JWT guard (Prometheus cannot authenticate with a bearer token).
 * Exposed at GET /api/v1/metrics (global prefix applies).
 */
@Controller()
export class MetricsController extends PrometheusController {
  @Public()
  @Get('metrics')
  async index(@Res({ passthrough: true }) response: Response): Promise<string> {
    return super.index(response);
  }
}
