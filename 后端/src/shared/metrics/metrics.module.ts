import { Global, Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsInterceptor } from './metrics.interceptor.js';
import { MetricsController } from './metrics.controller.js';
import { metricProviders } from './prometheus.provider.js';

@Global()
@Module({
  imports: [
    PrometheusModule.register({
      // Custom controller marks the endpoint @Public (Prometheus can't do JWT)
      controller: MetricsController,
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: [...metricProviders, MetricsInterceptor],
  exports: [MetricsInterceptor],
})
export class MetricsModule {}
