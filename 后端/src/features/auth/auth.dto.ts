import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'User password', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ description: 'Display name' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ required: false, description: 'Organization invite code' })
  @IsString()
  @IsOptional()
  inviteCode?: string;
}

export class LoginDto {
  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'User password' })
  @IsString()
  password: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsString()
  refreshToken: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Password reset token' })
  @IsString()
  token: string;

  @ApiProperty({ description: 'New password', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}

export class SendVerificationEmailDto {
  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  email: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Email verification token' })
  @IsString()
  token: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export class LoginResponseDto extends AuthResponseDto {
  @ApiPropertyOptional({ description: 'Warning if email not verified' })
  emailVerified?: boolean;

  @ApiPropertyOptional({ description: 'Warning message' })
  warning?: string;

  @ApiPropertyOptional({
    description:
      'If true, the user must complete 2FA verification. A tempToken is provided for the second step.',
  })
  requiresTwoFactor?: boolean;

  @ApiPropertyOptional({
    description:
      'Temporary token for completing 2FA verification. Only present when requiresTwoFactor is true.',
  })
  tempToken?: string;
}

// ── 2FA DTOs ──────────────────────────────────────────

export class TwoFactorGenerateResponseDto {
  @ApiProperty({
    description:
      'Base32-encoded TOTP secret to be stored in the authenticator app',
  })
  secret: string;

  @ApiProperty({ description: 'otpauth URL for QR code generation' })
  otpauthUrl: string;

  @ApiProperty({ description: 'QR code as a base64-encoded PNG data URL' })
  qrCode: string;
}

export class TwoFactorEnableDto {
  @ApiProperty({ description: 'TOTP token from the authenticator app' })
  @IsString()
  token: string;
}

export class TwoFactorDisableDto {
  @ApiProperty({ description: 'Current TOTP token to confirm the operation' })
  @IsString()
  token: string;
}

export class TwoFactorVerifyDto {
  @ApiProperty({ description: 'Temporary token from the login response' })
  @IsString()
  tempToken: string;

  @ApiProperty({ description: 'TOTP token from the authenticator app' })
  @IsString()
  token: string;
}

export class TwoFactorStepUpDto {
  @ApiProperty({ description: 'Current account password' })
  @IsString()
  password: string;

  @ApiProperty({ description: 'Current TOTP token from the authenticator app' })
  @IsString()
  token: string;
}

export class TwoFactorResponseDto {
  @ApiProperty({ description: 'Whether 2FA is enabled' })
  twoFactorEnabled: boolean;

  @ApiProperty({ description: 'Success message' })
  message: string;
}
