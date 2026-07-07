import { Global, Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsInterceptor } from './metrics.interceptor.js';
import { metricProviders } from './prometheus.provider.js';

@Global()
@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: [...metricProviders, MetricsInterceptor],
  exports: [MetricsInterceptor],
})
export class MetricsModule {}
