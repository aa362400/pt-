import { Module } from '@nestjs/common';
import { AuthModule as SharedAuthModule } from '../../shared/auth/auth.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TotpSecretEncryptionService } from './totp-secret-encryption.service.js';

@Module({
  // JwtModule is configured once in the shared auth module and re-exported.
  imports: [SharedAuthModule],
  controllers: [AuthController],
  providers: [AuthService, TotpSecretEncryptionService],
  exports: [AuthService],
})
export class AuthModule {}
