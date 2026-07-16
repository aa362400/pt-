import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import {
  RegisterDto,
  LoginDto,
  RefreshDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  AuthResponseDto,
  LoginResponseDto,
  SendVerificationEmailDto,
  VerifyEmailDto,
  TwoFactorEnableDto,
  TwoFactorDisableDto,
  TwoFactorVerifyDto,
  TwoFactorStepUpDto,
  TwoFactorGenerateResponseDto,
  TwoFactorResponseDto,
} from './auth.dto.js';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { Public } from '../../shared/auth/public.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() dto: RefreshDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create password reset token' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If the email exists, a reset link has been issued' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.resetPassword(dto.token, dto.password);
    return { message: 'Password updated successfully' };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('send-verification-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send email verification link' })
  async sendVerificationEmail(
    @Body() dto: SendVerificationEmailDto,
  ): Promise<{ message: string }> {
    const user = await this.authService.findByEmail(dto.email);
    if (user) {
      await this.authService.sendVerificationEmail(user.id);
    }
    return {
      message:
        'If the email exists and is not yet verified, a verification link has been sent.',
    };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with token' })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ message: string }> {
    await this.authService.verifyEmail(dto.token);
    return { message: 'Email verified successfully' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email via GET (for link clicks)' })
  async verifyEmailGet(
    @Query('token') token: string,
  ): Promise<{ message: string }> {
    await this.authService.verifyEmail(token);
    return { message: 'Email verified successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async me(@CurrentUser() user: JwtPayload): Promise<{
    id: string;
    email: string;
    orgId?: string;
    role?: string;
    twoFactorEnabled: boolean;
  }> {
    const profile = await this.authService.getCurrentUserProfile(user.sub);
    return {
      id: profile.id,
      email: profile.email,
      orgId: user.orgId,
      role: user.role,
      twoFactorEnabled: profile.twoFactorEnabled,
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout (revokes all refresh tokens)' })
  async logout(@CurrentUser() user: JwtPayload): Promise<{ message: string }> {
    await this.authService.logout(user.sub);
    return { message: 'Logged out successfully' };
  }

  // ── 2FA Endpoints ──────────────────────────────────────────────

  @Post('2fa/generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate TOTP secret and QR code for 2FA setup' })
  async generateTwoFactor(
    @CurrentUser() user: JwtPayload,
  ): Promise<TwoFactorGenerateResponseDto> {
    return this.authService.generateTwoFactorSecret(user.sub);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable 2FA by verifying a TOTP token' })
  async enableTwoFactor(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TwoFactorEnableDto,
  ): Promise<TwoFactorResponseDto> {
    await this.authService.enableTwoFactor(user.sub, dto.token);
    return {
      twoFactorEnabled: true,
      message: 'Two-factor authentication enabled',
    };
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable 2FA after verifying current TOTP token' })
  async disableTwoFactor(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TwoFactorDisableDto,
  ): Promise<TwoFactorResponseDto> {
    await this.authService.disableTwoFactor(user.sub, dto.token);
    return {
      twoFactorEnabled: false,
      message: 'Two-factor authentication disabled',
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete 2FA step during login (second step)' })
  async verifyTwoFactor(
    @Body() dto: TwoFactorVerifyDto,
  ): Promise<AuthResponseDto> {
    return this.authService.verifyTwoFactorLogin(dto.tempToken, dto.token);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('2fa/step-up')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Issue fresh password plus TOTP claims for a high-risk action',
  })
  async stepUpTwoFactor(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TwoFactorStepUpDto,
  ): Promise<AuthResponseDto> {
    return this.authService.stepUpTwoFactor(user.sub, dto.password, dto.token);
  }
}
