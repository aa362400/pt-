import * as argon2 from 'argon2';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../src/features/auth/auth.service.js';

describe('AuthService login lockout', () => {
  const jwtService = {
    sign: jest.fn(() => 'signed-token'),
    verify: jest.fn(() => ({ sub: 'user-1' })),
  };
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'AUTH_MAX_FAILED_ATTEMPTS') return 5;
      if (key === 'AUTH_LOCKOUT_MINUTES') return 15;
      return fallback;
    }),
    getOrThrow: jest.fn(() => 'test-secret'),
  };
  const emailService = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash('correct-password');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createPrisma(userOverrides: Record<string, unknown> = {}) {
    const user = {
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Owner',
      passwordHash,
      emailVerifiedAt: new Date(),
      twoFactorEnabled: false,
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastFailedLoginAt: null,
      ...userOverrides,
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...user,
            ...data,
            failedLoginAttempts:
              typeof data.failedLoginAttempts === 'object'
                ? user.failedLoginAttempts + data.failedLoginAttempts.increment
                : data.failedLoginAttempts,
          }),
        ),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue({
          organizationId: 'org-1',
          role: 'OWNER',
        }),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'refresh-1' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'refresh-1',
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 60_000),
        }),
        delete: jest.fn().mockResolvedValue({ id: 'refresh-1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    Object.assign(prisma, {
      $transaction: jest.fn(async (callback) =>
        callback({ ...prisma, $executeRawUnsafe: jest.fn() }),
      ),
    });
    return prisma;
  }

  it('locks the account and sends a security alert on the fifth failed password', async () => {
    const prisma = createPrisma({ failedLoginAttempts: 4 });
    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
      emailService,
    );

    await expect(
      service.login({ email: 'owner@example.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          failedLoginAttempts: { increment: 1 },
          lockedUntil: expect.any(Date),
          lastFailedLoginAt: expect.any(Date),
        }),
      }),
    );
    expect(emailService.send).toHaveBeenCalledWith(
      'owner@example.com',
      expect.stringContaining('Security alert'),
      expect.stringContaining('temporarily locked'),
    );
  });

  it('rejects a locked account before password verification', async () => {
    const prisma = createPrisma({
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() + 10 * 60_000),
    });
    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
      emailService,
    );

    await expect(
      service.login({
        email: 'owner@example.com',
        password: 'correct-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('clears previous failed attempts after a successful login', async () => {
    const prisma = createPrisma({ failedLoginAttempts: 2 });
    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
      emailService,
    );

    const result = await service.login({
      email: 'owner@example.com',
      password: 'correct-password',
    });

    expect(result.accessToken).toBe('signed-token');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastFailedLoginAt: null,
      },
    });
  });

  it('rejects a suspended account before issuing login tokens', async () => {
    const prisma = createPrisma({ status: 'SUSPENDED' });
    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
      emailService,
    );

    await expect(
      service.login({
        email: 'owner@example.com',
        password: 'correct-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('revokes every refresh token when a suspended account attempts renewal', async () => {
    const prisma = createPrisma({ status: 'SUSPENDED' });
    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
      emailService,
    );

    await expect(service.refresh('refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });
});
