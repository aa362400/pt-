import {
  type INestApplication,
  ShutdownSignal,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  configureHttpApplication,
  resolveCorsOptions,
} from '../src/bootstrap/http-application.js';

describe('HTTP application bootstrap', () => {
  it('normalizes a CORS whitelist and exposes correlation headers', () => {
    expect(resolveCorsOptions(' https://one.test,https://two.test, ')).toEqual({
      origin: ['https://one.test', 'https://two.test'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-Id',
        'X-Trace-Id',
        'traceparent',
        'X-Locale',
      ],
      exposedHeaders: ['X-Request-Id', 'X-Trace-Id', 'traceparent'],
    });
    expect(resolveCorsOptions('*').origin).toBe(true);
  });

  it('configures graceful shutdown and the existing HTTP safety controls', () => {
    const app = {
      enableShutdownHooks: jest.fn(),
      use: jest.fn(),
      setGlobalPrefix: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      enableCors: jest.fn(),
    } as unknown as INestApplication;
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          NODE_ENV: 'production',
          CORS_ORIGINS: 'https://app.shopmate.test',
        };
        return values[key] ?? fallback;
      }),
    } as unknown as ConfigService;

    configureHttpApplication(app, config);

    expect(app.enableShutdownHooks).toHaveBeenCalledWith([
      ShutdownSignal.SIGTERM,
      ShutdownSignal.SIGINT,
    ]);
    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api/v1');
    expect(app.use).toHaveBeenCalledTimes(4);
    expect(app.useGlobalPipes).toHaveBeenCalledWith(expect.any(ValidationPipe));
    expect(app.useGlobalFilters).toHaveBeenCalledTimes(1);
    expect(app.enableCors).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: ['https://app.shopmate.test'],
        credentials: true,
        exposedHeaders: ['X-Request-Id', 'X-Trace-Id', 'traceparent'],
      }),
    );
  });
});
