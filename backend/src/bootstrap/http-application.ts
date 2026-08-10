import {
  type INestApplication,
  ShutdownSignal,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { GlobalExceptionFilter } from '../shared/errors/filters.js';

const CROSS_ORIGIN_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const;

const CROSS_ORIGIN_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Request-Id',
  'X-Trace-Id',
  'traceparent',
  'X-Locale',
] as const;

const EXPOSED_TRACE_HEADERS = [
  'X-Request-Id',
  'X-Trace-Id',
  'traceparent',
] as const;

export function resolveCorsOptions(corsOrigins: string) {
  return {
    origin:
      corsOrigins === '*'
        ? true
        : corsOrigins
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean),
    credentials: true,
    methods: [...CROSS_ORIGIN_METHODS],
    allowedHeaders: [...CROSS_ORIGIN_HEADERS],
    exposedHeaders: [...EXPOSED_TRACE_HEADERS],
  };
}

export function configureHttpApplication(
  app: INestApplication,
  configService: ConfigService,
): void {
  app.enableShutdownHooks([ShutdownSignal.SIGTERM, ShutdownSignal.SIGINT]);

  app.use(
    json({
      limit: '50mb',
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter(configService));
  app.enableCors(
    resolveCorsOptions(configService.get<string>('CORS_ORIGINS', '*')),
  );

  if (configService.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ShopMate AI API')
      .setDescription('AI-powered e-commerce backend API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }
}
