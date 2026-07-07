import { Injectable, Logger } from '@nestjs/common';

export interface EmailService {
  send(to: string, subject: string, body: string): Promise<void>;
}

@Injectable()
export class ConsoleEmailService implements EmailService {
  private readonly logger = new Logger(ConsoleEmailService.name);

  async send(to: string, subject: string, body: string): Promise<void> {
    this.logger.log(`===== EMAIL =====`);
    this.logger.log(`To: ${to}`);
    this.logger.log(`Subject: ${subject}`);
    this.logger.log(`Body:\n${body}`);
    this.logger.log(`================`);
  }
}
