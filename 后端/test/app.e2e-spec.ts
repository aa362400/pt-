import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  Controller,
  Get,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Server } from 'node:http';
import supertest from 'supertest';
import { AppModule } from './../src/app.module.js';
import { Public } from './../src/shared/auth/public.decorator.js';
import { JwtAuthGuard } from './../src/shared/auth/jwt-auth.guard.js';

const HAS_DB =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0;
const describeIfDb = HAS_DB ? describe : describe.skip;

function apiRequest(app: INestApplication) {
  return supertest(app.getHttpServer() as Server);
}

@Injectable()
class StubJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: () => 'stub-token',
      ignoreExpiration: true,
      secretOrKey: 'stub-secret',
    });
  }

  validate(payload: unknown): unknown {
    return payload;
  }
}

interface AuthRegisterBody {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
}

interface AuthLoginBody {
  accessToken: string;
  refreshToken: string;
}

interface ReadyBody {
  status: 'ready' | 'not_ready';
  checks: Record<
    string,
    { status: 'up' | 'down'; latencyMs?: number; error?: string }
  >;
}

@Controller()
class SmokeTestController {
  @Public()
  @Get('health')
  getHealth(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('auth/me')
  me(): { id: string } {
    return { id: 'test' };
  }
}

describe('ShopMate AI (e2e)', () => {
  describe('Smoke tests (no external deps)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        controllers: [SmokeTestController],
        imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
        providers: [StubJwtStrategy],
      }).compile();

      app = moduleFixture.createNestApplication();
      app.setGlobalPrefix('api/v1');
      app.useGlobalGuards(new JwtAuthGuard(new Reflector()));
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/v1/health returns 200', async () => {
      const res = await apiRequest(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body as { status: string }).toHaveProperty('status', 'ok');
    });

    it('GET /api/v1/auth/me without token returns 401', async () => {
      const res = await apiRequest(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describeIfDb('Full app tests (requires PostgreSQL + Redis)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      app.setGlobalPrefix('api/v1');
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/v1/ready reports required dependencies and reflects optional agent readiness', async () => {
      const res = await apiRequest(app).get('/api/v1/ready');
      expect([200, 503]).toContain(res.status);
      const body = res.body as ReadyBody;
      expect(body.checks.database.status).toBe('up');
      expect(body.checks.redis.status).toBe('up');
      const allChecksUp = Object.values(body.checks).every(
        (check) => check.status === 'up',
      );
      expect(body.status).toBe(allChecksUp ? 'ready' : 'not_ready');
      expect(res.status).toBe(allChecksUp ? 200 : 503);
    });

    describe('Auth full flow', () => {
      const testEmail = `e2e-${Date.now()}@shopmate.ai`;
      const testPassword = 'test12345678';
      let accessToken = '';

      it('POST /api/v1/auth/register creates user', async () => {
        const res = await apiRequest(app)
          .post('/api/v1/auth/register')
          .send({ email: testEmail, password: testPassword, name: 'E2E User' });
        expect(res.status).toBe(201);
        const body = res.body as AuthRegisterBody;
        expect(body).toHaveProperty('accessToken');
        expect(body).toHaveProperty('refreshToken');
        accessToken = body.accessToken;
      });

      it('POST /api/v1/auth/login with correct password returns 200', async () => {
        const res = await apiRequest(app)
          .post('/api/v1/auth/login')
          .send({ email: testEmail, password: testPassword });
        expect(res.status).toBe(200);
        const body = res.body as AuthLoginBody;
        expect(body).toHaveProperty('accessToken');
      });

      it('POST /api/v1/auth/login with wrong password returns 401', async () => {
        const res = await apiRequest(app)
          .post('/api/v1/auth/login')
          .send({ email: testEmail, password: 'wrong-password' });
        expect(res.status).toBe(401);
      });

      it('GET /api/v1/auth/me with token returns user', async () => {
        const res = await apiRequest(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${accessToken}`);
        expect(res.status).toBe(200);
        const body = res.body as { email: string };
        expect(body.email).toBe(testEmail);
      });
    });
  });
});
