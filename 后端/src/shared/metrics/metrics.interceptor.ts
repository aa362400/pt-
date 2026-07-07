import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(MetricsInterceptor.name);

  constructor(
    @InjectMetric('http_requests_total') private requestsCounter: Counter<string>,
    @InjectMetric('http_request_duration_seconds') private requestDuration: Histogram<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const path = request.route?.path || request.path || 'unknown';

    const end = this.requestDuration.startTimer({ method, path });

    return next.handle().pipe(
      tap({
        next: () => {
          end({ method, path, status: 'success' });
          this.requestsCounter.inc({ method, path, status: '2xx' });
        },
        error: (error: { status?: number }) => {
          end({ method, path, status: 'error' });
          const status = error.status ? `${Math.floor(error.status / 100)}xx` : '5xx';
          this.requestsCounter.inc({ method, path, status });
        },
      }),
    );
  }
}
