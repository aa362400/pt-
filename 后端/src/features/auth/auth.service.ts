import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import * as otplib from 'otplib';
import { toDataURL } from 'qrcode';
import type { SignOptions } from 'jsonwebtoken';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { EMAIL_SERVICE_TOKEN } from '../../shared/email/email.module.js';
import type { EmailService } from '../../shared/email/email.service.js';
import {
  RegisterDto,
  LoginDto,
  AuthResponseDto,
  LoginResponseDto,
  TwoFactorGenerateResponseDto,
} from './auth.dto.js';

interface TokenContext {
  userId: string;
  email: string;
  orgId?: string;
  role?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(EMAIL_SERVICE_TOKEN)
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('User already exists');
    }

    const hashedPassword = await argon2.hash(dto.password);
    const orgSlug = this.buildOrgSlug(dto.name);
    const { user, membership } = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash: hashedPassword,
          // emailVerifiedAt left null — user must verify via email
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: `${dto.name} 的团队`,
          slug: orgSlug,
        },
      });

      const createdMembership = await tx.membership.create({
        data: {
          userId: createdUser.id,
          organizationId: organization.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });

      return { user: createdUser, membership: createdMembership };
    });

    const tokens = await this.generateTokens({
      userId: user.id,
      email: user.email,
      orgId: membership.organizationId,
      role: membership.role,
    });

    // Send verification email asynchronously (don't block registration)
    this.sendVerificationEmail(user.id).catch((err) =>
      this.logger.error('Failed to send verification email', err),
    );

    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // ── 2FA check ───────────────────────────────────────────────
    if (user.twoFactorEnabled) {
      // Issue a short-lived temporary token that must be exchanged
      // for real tokens after 2FA verification
      const tempToken = this.jwtService.sign(
        { sub: user.id, purpose: '2fa' },
        {
          secret: this.configService.getOrThrow<string>('JWT_2FA_TEMP_SECRET'),
          expiresIn: '5m',
        },
      );

      const emailVerified = !!user.emailVerifiedAt;
      const result: LoginResponseDto = {
        accessToken: '',
        refreshToken: '',
        user: { id: user.id, email: user.email, name: user.name },
        emailVerified,
        requiresTwoFactor: true,
        tempToken,
      };

      if (!emailVerified) {
        result.warning =
          'Your email address has not been verified. Please check your inbox for a verification email.';
      }

      return result;
    }

    const membership = await this.findActiveMembership(user.id);
    const tokens = await this.generateTokens({
      userId: user.id,
      email: user.email,
      orgId: membership?.organizationId,
      role: membership?.role,
    });

    const emailVerified = !!user.emailVerifiedAt;
    const result: LoginResponseDto = {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name },
      emailVerified,
    };

    if (!emailVerified) {
      result.warning =
        'Your email address has not been verified. Please check your inbox for a verification email.';
    }

    return result;
  }

  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    let payload: { sub: string };
    try {
      payload = this.jwtService.verify<{ sub: string }>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const membership = await this.findActiveMembership(user.id);
    const tokens = await this.generateTokens({
      userId: user.id,
      email: user.email,
      orgId: membership?.organizationId,
      role: membership?.role,
    });
    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;
    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + 1000 * 60 * 30),
      },
    });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await argon2.hash(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      });
      await tx.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      });
      await tx.refreshToken.deleteMany({ where: { userId: stored.userId } });
    });
  }

  async sendVerificationEmail(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.emailVerifiedAt) {
      return; // Already verified
    }

    // Invalidate any existing unused tokens
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gte: new Date() } },
      data: { expiresAt: new Date(0) },
    });

    const token = randomBytes(32).toString('hex');
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24h expiry
      },
    });

    const appUrl = this.configService.get<string>(
      'APP_URL',
      'http://localhost:3000',
    );
    const verificationUrl = `${appUrl}/auth/verify-email?token=${token}`;

    await this.emailService.send(
      user.email,
      'Verify your email address',
      `Hello ${user.name},\n\nPlease verify your email address by clicking the link below:\n\n${verificationUrl}\n\nThis link expires in 24 hours.\n\nIf you did not create an account, please ignore this email.`,
    );

    this.logger.log(`Verification email sent to ${user.email}`);
  }

  async findByEmail(email: string): Promise<{
    id: string;
    email: string;
    emailVerifiedAt: Date | null;
  } | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    return user;
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const stored = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: stored.userId },
        data: { emailVerifiedAt: new Date() },
      });
      await tx.emailVerificationToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      });
    });

    this.logger.log(`Email verified for user ${stored.userId}`);
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  // ── 2FA ──────────────────────────────────────────────────────────────────

  /**
   * Generate a TOTP secret for the user, store it encrypted, and return
   * the secret + otpauth URL + QR code data URL.
   */
  async generateTwoFactorSecret(
    userId: string,
  ): Promise<TwoFactorGenerateResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.twoFactorEnabled) {
      throw new ConflictException(
        'Two-factor authentication is already enabled',
      );
    }

    const secret = otplib.generateSecret();
    const appName = this.configService.get<string>('APP_NAME', 'ShopMate AI');
    const otpauthUrl = otplib.generateURI({
      label: user.email,
      issuer: appName,
      secret,
    });

    // Pre-generate QR as base64 PNG data URL
    const qrCode = await toDataURL(otpauthUrl);

    // Encrypt secret before storing (at-rest encryption)
    const encryptedSecret = this.encryptTwoFactorSecret(secret);
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: encryptedSecret },
    });

    return { secret, otpauthUrl, qrCode };
  }

  /**
   * Enable 2FA after verifying a valid TOTP token from the user's authenticator app.
   */
  async enableTwoFactor(userId: string, token: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.twoFactorEnabled) {
      throw new ConflictException(
        'Two-factor authentication is already enabled',
      );
    }
    if (!user.twoFactorSecret) {
      throw new UnauthorizedException(
        'No 2FA secret generated. Call generate first.',
      );
    }

    const secret = this.decryptTwoFactorSecret(user.twoFactorSecret);
    const isValid = otplib.verifySync({ token, secret }).valid;
    if (!isValid) {
      throw new UnauthorizedException('Invalid two-factor token');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
  }

  /**
   * Disable 2FA after verifying the current TOTP token.
   */
  async disableTwoFactor(userId: string, token: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (!user.twoFactorEnabled) {
      throw new ConflictException('Two-factor authentication is not enabled');
    }

    const verified = this.verifyTwoFactorToken(user, token);
    if (!verified) {
      throw new UnauthorizedException('Invalid two-factor token');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
  }

  /**
   * Verify a TOTP token against the user's stored secret.
   */
  verifyTwoFactorToken(
    user: { twoFactorEnabled: boolean; twoFactorSecret: string | null },
    token: string,
  ): boolean {
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return false;
    }

    try {
      const secret = this.decryptTwoFactorSecret(user.twoFactorSecret);
      return otplib.verifySync({ token, secret }).valid;
    } catch {
      return false;
    }
  }

  /**
   * Complete 2FA step during login: validate tempToken + TOTP token,
   * then issue real access/refresh tokens.
   */
  async verifyTwoFactorLogin(
    tempToken: string,
    token: string,
  ): Promise<AuthResponseDto> {
    // Validate temporary token
    let payload: { sub: string; purpose: string };
    try {
      payload = this.jwtService.verify<{ sub: string; purpose: string }>(
        tempToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_2FA_TEMP_SECRET'),
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired temporary token');
    }

    if (payload.purpose !== '2fa') {
      throw new UnauthorizedException('Invalid token purpose');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (!user.twoFactorEnabled) {
      throw new UnauthorizedException(
        'Two-factor authentication is not enabled for this user',
      );
    }

    const verified = this.verifyTwoFactorToken(user, token);
    if (!verified) {
      throw new UnauthorizedException('Invalid two-factor token');
    }

    const membership = await this.findActiveMembership(user.id);
    const tokens = await this.generateTokens({
      userId: user.id,
      email: user.email,
      orgId: membership?.organizationId,
      role: membership?.role,
    });

    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  // ── Encryption helpers ────────────────────────────────────────────────────

  /**
   * Encrypt a 2FA secret using APP_KEY before storing in the database.
   * Uses AES-256-GCM for authenticated encryption.
   */
  private encryptTwoFactorSecret(secret: string): string {
    const appKey = this.configService.get<string>('APP_KEY');
    if (!appKey) {
      // Fallback: base64-encode only (not truly encrypted, but the field exists)
      // In production, always set APP_KEY to a 32-byte hex string.
      return Buffer.from(secret).toString('base64');
    }

    // Use Node.js crypto for AES-256-GCM (already imported at top)
    const key = createHash('sha256').update(appKey).digest();
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Store: iv:tag:encrypted (all base64)
    return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  /**
   * Decrypt a 2FA secret that was encrypted with encryptTwoFactorSecret.
   */
  private decryptTwoFactorSecret(encrypted: string): string {
    const appKey = this.configService.get<string>('APP_KEY');
    if (!appKey) {
      // Fallback: treat as plain base64
      return Buffer.from(encrypted, 'base64').toString('utf8');
    }

    const key = createHash('sha256').update(appKey).digest();
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      // Not in encrypted format; treat as raw base64
      return Buffer.from(encrypted, 'base64').toString('utf8');
    }

    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  }

  private async findActiveMembership(userId: string) {
    return this.prisma.membership.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
  }

  private buildOrgSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    const suffix = randomBytes(4).toString('hex');
    return base ? `${base}-${suffix}` : `org-${suffix}`;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseTtlMs(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl.trim());
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = match[2];
    const unitMs: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return value * (unitMs[unit ?? 'd'] ?? 86_400_000);
  }

  private async generateTokens(
    ctx: TokenContext,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = {
      sub: ctx.userId,
      email: ctx.email,
      orgId: ctx.orgId,
      role: ctx.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string>(
        'ACCESS_TOKEN_TTL',
        '15m',
      ) as SignOptions['expiresIn'],
    });

    const refreshTtl = this.configService.get<string>(
      'REFRESH_TOKEN_TTL',
      '7d',
    );
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshTtl as SignOptions['expiresIn'],
    });

    await this.prisma.refreshToken.create({
      data: {
        userId: ctx.userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.parseTtlMs(refreshTtl)),
      },
    });

    return { accessToken, refreshToken };
  }
}
