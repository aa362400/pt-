import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service.js';
import { TenantDatabaseContextService } from '../database/tenant-database-context.service.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
  orgId?: string;
  amr?: string[];
  mfaAt?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET', ''),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    if (!payload.orgId) return payload;

    const membership = await this.tenantDatabase.run(payload.orgId, (tx) =>
      tx.membership.findFirst({
        where: {
          userId: payload.sub,
          organizationId: payload.orgId,
          status: 'ACTIVE',
        },
        select: { role: true },
      }),
    );
    if (!membership) {
      throw new UnauthorizedException('Organization membership is not active');
    }

    return { ...payload, role: membership.role };
  }
}
