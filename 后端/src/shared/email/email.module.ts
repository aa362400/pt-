import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsoleEmailService, EmailService } from './email.service.js';

export const EMAIL_SERVICE_TOKEN = 'EMAIL_SERVICE';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_SERVICE_TOKEN,
      useFactory: (configService: ConfigService): EmailService => {
        const provider = configService.get<string>('EMAIL_PROVIDER', 'console');
        switch (provider) {
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
