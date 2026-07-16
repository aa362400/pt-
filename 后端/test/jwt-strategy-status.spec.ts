import { UnauthorizedException } from '@nestjs/common';
import {
  JwtStrategy,
  type JwtPayload,
} from '../src/shared/auth/jwt.strategy.js';

describe('JwtStrategy account and membership validation', () => {
  const config = {
    get: jest.fn(() => 'access-secret'),
  };

  function createStrategy(input?: {
    userStatus?: string | null;
    membership?: { role: string } | null;
  }) {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            input?.userStatus === null
              ? null
              : { status: input?.userStatus ?? 'ACTIVE' },
          ),
      },
    };
    const membershipFindFirst = jest
      .fn()
      .mockResolvedValue(
        input?.membership === undefined ? { role: 'ADMIN' } : input.membership,
      );
    const tenantDatabase = {
      run: jest.fn(async (_organizationId, operation) =>
        operation({ membership: { findFirst: membershipFindFirst } }),
      ),
    };
    return {
      strategy: new JwtStrategy(
        config as never,
        prisma as never,
        tenantDatabase as never,
      ),
      prisma,
      tenantDatabase,
      membershipFindFirst,
    };
  }

  const payload: JwtPayload = {
    sub: 'user-1',
    email: 'owner@example.com',
    orgId: 'org-1',
    role: 'OWNER',
  };

  it('rejects an access token immediately after the account is suspended', async () => {
    const { strategy, tenantDatabase } = createStrategy({
      userStatus: 'SUSPENDED',
    });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tenantDatabase.run).not.toHaveBeenCalled();
  });

  it('rejects an access token after its organization membership is removed', async () => {
    const { strategy } = createStrategy({ membership: null });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('uses the current database role instead of trusting a stale token role', async () => {
    const { strategy, membershipFindFirst } = createStrategy({
      membership: { role: 'MEMBER' },
    });

    await expect(strategy.validate(payload)).resolves.toEqual({
      ...payload,
      role: 'MEMBER',
    });
    expect(membershipFindFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        organizationId: 'org-1',
        status: 'ACTIVE',
      },
      select: { role: true },
    });
  });
});
