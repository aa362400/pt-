import { AuthService } from '../src/features/auth/auth.service.js';
import * as argon2 from 'argon2';

describe('AuthService publish step-up claims', () => {
  it('issues fresh password plus OTP claims from an authenticated inline step-up', async () => {
    const passwordHash = await argon2.hash('correct-password');
    const jwtService = {
      sign: jest
        .fn()
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token'),
    };
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('2fa-temp-secret'),
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    };
    const user = {
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Owner',
      passwordHash,
      status: 'ACTIVE',
      twoFactorEnabled: true,
      twoFactorSecret: 'encrypted-secret',
    };
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      membership: {
        findFirst: jest.fn().mockResolvedValue({
          organizationId: 'org-1',
          role: 'OWNER',
        }),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'refresh-1' }),
      },
    };
    prisma.$transaction = jest.fn(async (operation) =>
      operation({ ...prisma, $executeRawUnsafe: jest.fn() }),
    );
    const service = new AuthService(
      prisma,
      jwtService as never,
      configService as never,
      { send: jest.fn() },
    );
    jest.spyOn(service, 'verifyTwoFactorToken').mockReturnValue(true);

    const result = await service.stepUpTwoFactor(
      'user-1',
      'correct-password',
      '123456',
    );

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'user-1', email: 'owner@example.com', name: 'Owner' },
    });
    expect(jwtService.sign.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        sub: 'user-1',
        amr: ['pwd', 'otp'],
        mfaAt: expect.any(Number),
      }),
    );
  });

  it('attests the original MFA time and authentication methods after TOTP verification', async () => {
    const jwtService = {
      verify: jest.fn().mockReturnValue({ sub: 'user-1', purpose: '2fa' }),
      sign: jest
        .fn()
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token'),
    };
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('2fa-temp-secret'),
      get: jest.fn((key: string, fallback?: unknown) => fallback),
    };
    const user = {
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Owner',
      status: 'ACTIVE',
      twoFactorEnabled: true,
      twoFactorSecret: 'encrypted-secret',
    };
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      membership: {
        findFirst: jest.fn().mockResolvedValue({
          organizationId: 'org-1',
          role: 'OWNER',
        }),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'refresh-1' }),
      },
    };
    prisma.$transaction = jest.fn(async (operation) =>
      operation({ ...prisma, $executeRawUnsafe: jest.fn() }),
    );
    const service = new AuthService(
      prisma,
      jwtService as never,
      configService as never,
      { send: jest.fn() },
    );
    jest.spyOn(service, 'verifyTwoFactorToken').mockReturnValue(true);
    const earliestMfaAt = Math.floor(Date.now() / 1000);

    await service.verifyTwoFactorLogin('temporary-token', '123456');

    const latestMfaAt = Math.floor(Date.now() / 1000);
    const accessPayload = jwtService.sign.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    const refreshPayload = jwtService.sign.mock.calls[1]?.[0] as Record<
      string,
      unknown
    >;
    expect(accessPayload).toEqual(
      expect.objectContaining({
        amr: ['pwd', 'otp'],
        mfaAt: expect.any(Number),
      }),
    );
    expect(accessPayload.mfaAt).toEqual(refreshPayload.mfaAt);
    expect(Number(accessPayload.mfaAt)).toBeGreaterThanOrEqual(earliestMfaAt);
    expect(Number(accessPayload.mfaAt)).toBeLessThanOrEqual(latestMfaAt);
  });

  it('preserves the original MFA time across refresh instead of making stale MFA fresh again', async () => {
    const originalMfaAt = Math.floor(Date.now() / 1000) - 120;
    const jwtService = {
      verify: jest.fn().mockReturnValue({
        sub: 'user-1',
        amr: ['pwd', 'otp'],
        mfaAt: originalMfaAt,
      }),
      sign: jest
        .fn()
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token'),
    };
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('2fa-temp-secret'),
      get: jest.fn((key: string, fallback?: unknown) => fallback),
    };
    const user = {
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Owner',
      status: 'ACTIVE',
    };
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      membership: {
        findFirst: jest.fn().mockResolvedValue({
          organizationId: 'org-1',
          role: 'OWNER',
        }),
      },
      refreshToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'refresh-1',
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 60_000),
        }),
        delete: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'refresh-2' }),
      },
    };
    prisma.$transaction = jest.fn(async (operation) =>
      operation({ ...prisma, $executeRawUnsafe: jest.fn() }),
    );
    const service = new AuthService(
      prisma,
      jwtService as never,
      configService as never,
      { send: jest.fn() },
    );

    await service.refresh('original-refresh-token');

    expect(jwtService.sign.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        amr: ['pwd', 'otp'],
        mfaAt: originalMfaAt,
      }),
    );
    expect(jwtService.sign.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        amr: ['pwd', 'otp'],
        mfaAt: originalMfaAt,
      }),
    );
  });
});
