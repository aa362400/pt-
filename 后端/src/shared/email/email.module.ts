import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConsoleEmailService,
  SmtpEmailService,
  EmailService,
} from './email.service.js';

export const EMAIL_SERVICE_TOKEN = 'EMAIL_SERVICE';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_SERVICE_TOKEN,
      useFactory: (configService: ConfigService): EmailService => {
        const provider = configService.get<string>('EMAIL_PROVIDER', 'console');
        switch (provider) {
          case 'smtp':
            return new SmtpEmailService({
              host: configService.getOrThrow<string>('SMTP_HOST'),
              port: configService.get<number>('SMTP_PORT', 587),
              secure:
                configService.get<string>('SMTP_SECURE', 'false') === 'true',
              user: configService.get<string>('SMTP_USER'),
              pass: configService.get<string>('SMTP_PASS'),
              from: configService.getOrThrow<string>('SMTP_FROM'),
            });
          case 'console':
          default:
            return new ConsoleEmailService();
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [EMAIL_SERVICE_TOKEN],
})
export class EmailModule {}
