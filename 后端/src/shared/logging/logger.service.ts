import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
  requestId?: string;
  userId?: string;
  orgId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const LEVEL_COLORS: Record<string, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  fatal: '\x1b[35m', // magenta
};

const RESET = '\x1b[0m';

@Injectable()
export class LoggerService_ implements LoggerService {
  private readonly level: string;
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    this.level = this.configService.get<string>('LOG_LEVEL', 'info');
    this.isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
  }

  private shouldLog(level: string): boolean {
    return (LOG_LEVELS[level] ?? 0) >= (LOG_LEVELS[this.level] ?? 0);
  }

  private formatEntry(
    level: string,
    message: string,
    context?: Record<string, unknown>,
  ): string {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...context,
    };

    if (this.isProduction) {
      return JSON.stringify(entry);
    }

    // Human-readable development formatting with colors
    const color = LEVEL_COLORS[level] ?? '';
    const label = level.toUpperCase().padEnd(5);
    const timestamp = entry.timestamp;
    const extras = { ...context };
    delete extras.requestId;
    delete extras.userId;
    delete extras.orgId;
    delete extras.durationMs;

    const parts: string[] = [
      `${color}${label}${RESET}`,
      `${timestamp}`,
      `[${entry.requestId ?? '-'}]`,
      message,
    ];

    const meta: string[] = [];
    if (entry.userId) meta.push(`user=${entry.userId}`);
    if (entry.orgId) meta.push(`org=${entry.orgId}`);
    if (entry.durationMs !== undefined) meta.push(`dur=${entry.durationMs}ms`);
    if (Object.keys(extras).length > 0) meta.push(JSON.stringify(extras));
    if (meta.length > 0) parts.push(meta.join(' '));

    return parts.join(' ');
  }

  private emit(
    level: string,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    if (!this.shouldLog(level)) return;
    const formatted = this.formatEntry(level, message, context);
    switch (level) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
      case 'fatal':
        console.error(formatted);
        break;
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.emit('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.emit('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.emit('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.emit('error', message, context);
  }

  fatal(message: string, context?: Record<string, unknown>): void {
    this.emit('fatal', message, context);
  }

  log(message: string, context?: Record<string, unknown>): void {
    this.info(message, context);
  }
}
