import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

export interface EmailService {
  send(to: string, subject: string, body: string): Promise<void>;
}

@Injectable()
export class ConsoleEmailService implements EmailService {
  private readonly logger = new Logger(ConsoleEmailService.name);

  send(to: string, subject: string, body: string): Promise<void> {
    this.logger.log(`===== EMAIL =====`);
    this.logger.log(`To: ${to}`);
    this.logger.log(`Subject: ${subject}`);
    this.logger.log(`Body:\n${body}`);
    this.logger.log(`================`);
    return Promise.resolve();
  }
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

@Injectable()
export class SmtpEmailService implements EmailService {
  private readonly logger = new Logger(SmtpEmailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig) {
    this.from = config.from;
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth:
        config.user && config.pass
          ? { user: config.user, pass: config.pass }
          : undefined,
    });
    this.logger.log(
      `SMTP email service initialised — ${config.host}:${config.port} (from: ${config.from})`,
    );
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text: body,
    });
    this.logger.log(`Email sent to ${to}: ${subject}`);
  }
}
